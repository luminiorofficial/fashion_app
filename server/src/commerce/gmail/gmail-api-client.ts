import {ApiError} from "../../utils/api-error";
import {decodeBase64Url} from "./parsing-utils";
import type {AppConfig} from "../../config/env";
import type {GmailApiClient, GoogleTokenResponse, NormalizedGmailMessage} from "../../types/provider.types";

export type GmailApiClientConfig = Pick<AppConfig, "googleClientId" | "googleClientSecret" | "gmailApiRequestTimeoutMs">;

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailMessagePart {
  mimeType?: string;
  body?: {data?: string};
  parts?: GmailMessagePart[];
}

interface GoogleTokenPayload {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

// Hand-rolled Google OAuth + Gmail REST client — no googleapis SDK, matching
// this codebase's fetch()-based provider style (see
// providers/gemini/text-analyzer.provider.ts, providers/weather/open-meteo.provider.ts).
export class GoogleGmailApiClient implements GmailApiClient {
  constructor(private readonly config: GmailApiClientConfig) {}

  buildAuthUrl({state, redirectUri, scope}: {state: string; redirectUri: string; scope: string}): string {
    const params = new URLSearchParams({
      client_id: this.config.googleClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope,
      state,
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  exchangeCode(code: string, redirectUri: string): Promise<GoogleTokenResponse> {
    return this.requestToken({
      code,
      client_id: this.config.googleClientId,
      client_secret: this.config.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
  }

  refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
    return this.requestToken({
      refresh_token: refreshToken,
      client_id: this.config.googleClientId,
      client_secret: this.config.googleClientSecret,
      grant_type: "refresh_token",
    });
  }

  private async requestToken(params: Record<string, string>): Promise<GoogleTokenResponse> {
    const response = await this.fetchWithTimeout(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {"content-type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams(params).toString(),
    });
    if (!response.ok) throw new ApiError(502, "GOOGLE_TOKEN_EXCHANGE_FAILED", "Google did not accept the OAuth request. Please try connecting Gmail again.");
    const json = (await response.json()) as GoogleTokenPayload;
    return {accessToken: json.access_token, refreshToken: json.refresh_token ?? null, expiresInSeconds: json.expires_in, scope: json.scope ?? null, tokenType: json.token_type};
  }

  async revokeToken(token: string): Promise<void> {
    await this.fetchWithTimeout(REVOKE_ENDPOINT, {
      method: "POST",
      headers: {"content-type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams({token}).toString(),
    }).catch(() => undefined);
  }

  async getUserEmail(accessToken: string): Promise<string> {
    const response = await this.fetchWithTimeout(USERINFO_ENDPOINT, {headers: {authorization: `Bearer ${accessToken}`}});
    if (!response.ok) throw new ApiError(502, "GOOGLE_USERINFO_FAILED", "Could not read the connected Google account's email address.");
    const json = (await response.json()) as {email?: string};
    if (!json.email) throw new ApiError(502, "GOOGLE_USERINFO_FAILED", "Google did not return an email address for this account.");
    return json.email;
  }

  async listMessageIds(accessToken: string, query: string, pageToken?: string | null): Promise<{ids: string[]; nextPageToken: string | null}> {
    const params = new URLSearchParams({q: query, maxResults: "100"});
    if (pageToken) params.set("pageToken", pageToken);
    const response = await this.fetchWithTimeout(`${GMAIL_API_BASE}/messages?${params.toString()}`, {headers: {authorization: `Bearer ${accessToken}`}});
    if (!response.ok) throw new ApiError(response.status === 401 ? 401 : 502, "GMAIL_LIST_FAILED", "Could not list Gmail messages.");
    const json = (await response.json()) as {messages?: {id: string}[]; nextPageToken?: string};
    return {ids: (json.messages || []).map((message) => message.id), nextPageToken: json.nextPageToken ?? null};
  }

  async getMessage(accessToken: string, messageId: string): Promise<NormalizedGmailMessage> {
    const response = await this.fetchWithTimeout(`${GMAIL_API_BASE}/messages/${messageId}?format=full`, {headers: {authorization: `Bearer ${accessToken}`}});
    if (!response.ok) throw new ApiError(response.status === 401 ? 401 : 502, "GMAIL_GET_MESSAGE_FAILED", "Could not fetch a Gmail message.");
    const json = (await response.json()) as {id: string; internalDate?: string; payload?: GmailMessagePart & {headers?: {name: string; value: string}[]}};
    const headers = json.payload?.headers || [];
    const header = (name: string) => headers.find((entry) => entry.name.toLowerCase() === name.toLowerCase())?.value || "";
    const {textBody, htmlBody} = this.extractBodies(json.payload);
    return {id: json.id, internalDate: json.internalDate ?? null, from: header("From"), subject: header("Subject"), textBody, htmlBody};
  }

  // Gmail's payload is either one part or a multipart/* tree; recursively
  // collects the first text/plain and text/html bodies found and
  // base64url-decodes each.
  private extractBodies(payload: GmailMessagePart | undefined): {textBody: string; htmlBody: string} {
    let textBody = "";
    let htmlBody = "";
    const visit = (part: GmailMessagePart | undefined) => {
      if (!part) return;
      const data = part.body?.data;
      if (data && part.mimeType === "text/plain" && !textBody) textBody = decodeBase64Url(data);
      if (data && part.mimeType === "text/html" && !htmlBody) htmlBody = decodeBase64Url(data);
      for (const child of part.parts || []) visit(child);
    };
    visit(payload);
    return {textBody, htmlBody};
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {...init, signal: AbortSignal.timeout(this.config.gmailApiRequestTimeoutMs)});
    } catch {
      throw new ApiError(504, "GOOGLE_API_TIMEOUT", "Google did not respond in time.");
    }
  }
}
