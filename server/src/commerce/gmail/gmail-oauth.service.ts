import {ApiError, assert} from "../../utils/api-error";
import {createToken, deriveEncryptionKey, encryptSecret, decryptSecret, signPayload, verifyPayload} from "../../utils/crypto";
import {safeOperationalError, describeFailure} from "../../utils/safe-logging";
import type {AppConfig} from "../../config/env";
import type {GmailRepository} from "../../types/repositories";
import type {GmailApiClient} from "../../types/provider.types";
import type {GmailConnection} from "../../types/commerce.types";

export type GmailOAuthServiceConfig = Pick<AppConfig, "googleClientId" | "googleClientSecret" | "googleOAuthRedirectUri" | "commerceTokenEncryptionKey" | "otpHashSecret">;

// Minimum Gmail permission needed to read order emails, plus the two
// lightweight OpenID scopes needed to show which Gmail account is
// connected — no broader Gmail scope (send/modify/etc.) is ever requested.
const GMAIL_OAUTH_SCOPE = "https://www.googleapis.com/auth/gmail.readonly openid email";

// The OAuth `state` param must round-trip through Google's redirect with no
// server-side session available at that point, so it carries its own
// signature instead of a DB lookup. Signed with a key derived from
// otpHashSecret (domain-separated) rather than a brand new secret.
const STATE_TTL_MS = 10 * 60_000;

export class GmailOAuthService {
  constructor(
    private readonly gmail: GmailRepository,
    private readonly gmailClient: GmailApiClient,
    private readonly config: GmailOAuthServiceConfig,
  ) {}

  private stateSecret(): string {
    return `${this.config.otpHashSecret}:gmail-oauth-state`;
  }

  private encryptionKey(): Buffer {
    return deriveEncryptionKey(this.config.commerceTokenEncryptionKey);
  }

  buildAuthorizationUrl(userId: string): string {
    const payload = {u: userId, n: createToken(), e: Date.now() + STATE_TTL_MS};
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = signPayload(this.stateSecret(), encodedPayload);
    return this.gmailClient.buildAuthUrl({state: `${encodedPayload}.${signature}`, redirectUri: this.config.googleOAuthRedirectUri, scope: GMAIL_OAUTH_SCOPE});
  }

  private verifyState(state: string): string {
    const [encodedPayload, signature] = (state || "").split(".");
    assert(encodedPayload && signature, 400, "INVALID_OAUTH_STATE", "This Google sign-in link is invalid. Please try connecting Gmail again.");
    assert(verifyPayload(this.stateSecret(), encodedPayload, signature), 400, "INVALID_OAUTH_STATE", "This Google sign-in link is invalid. Please try connecting Gmail again.");
    let payload: {u: string; n: string; e: number};
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    } catch {
      throw new ApiError(400, "INVALID_OAUTH_STATE", "This Google sign-in link is invalid. Please try connecting Gmail again.");
    }
    assert(payload.e > Date.now(), 410, "OAUTH_STATE_EXPIRED", "This Google sign-in link has expired. Please try connecting Gmail again.");
    return payload.u;
  }

  async handleCallback(code: string, state: string): Promise<{userId: string}> {
    const userId = this.verifyState(state);
    const tokens = await this.gmailClient.exchangeCode(code, this.config.googleOAuthRedirectUri);
    assert(tokens.refreshToken, 502, "GOOGLE_NO_REFRESH_TOKEN", "Google did not grant offline access. Please try connecting Gmail again.");
    const email = await this.gmailClient.getUserEmail(tokens.accessToken);
    const key = this.encryptionKey();
    await this.gmail.upsertConnection(userId, {
      googleEmail: email,
      googleAccountId: null,
      accessTokenCiphertext: encryptSecret(tokens.accessToken, key),
      accessTokenExpiresAt: new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString(),
      refreshTokenCiphertext: encryptSecret(tokens.refreshToken, key),
      scope: tokens.scope,
    });
    return {userId};
  }

  // Returns a usable plaintext access token, refreshing (and persisting the
  // refreshed token) if the stored one is near/past expiry. On any failure
  // — a decrypt failure after a key rotation, or Google rejecting the
  // refresh token — the connection is marked 'error' with a generic,
  // non-sensitive reason (never the raw error message, which could echo
  // provider response text) so the UI can prompt to reconnect instead of a
  // sync silently looping on the same failure.
  async getValidAccessToken(connection: GmailConnection): Promise<string> {
    const key = this.encryptionKey();
    const nearExpiry = !connection.accessTokenExpiresAt || new Date(connection.accessTokenExpiresAt).getTime() - Date.now() < 60_000;

    if (!nearExpiry && connection.accessTokenCiphertext) {
      try {
        return decryptSecret(connection.accessTokenCiphertext, key);
      } catch (error) {
        await this.markErrored(connection.id, error);
        throw new ApiError(409, "GMAIL_RECONNECT_REQUIRED", "Gmail needs to be reconnected.");
      }
    }

    assert(connection.refreshTokenCiphertext, 409, "GMAIL_RECONNECT_REQUIRED", "Gmail needs to be reconnected.");
    let refreshToken: string;
    try {
      refreshToken = decryptSecret(connection.refreshTokenCiphertext, key);
    } catch (error) {
      await this.markErrored(connection.id, error);
      throw new ApiError(409, "GMAIL_RECONNECT_REQUIRED", "Gmail needs to be reconnected.");
    }

    try {
      const tokens = await this.gmailClient.refreshAccessToken(refreshToken);
      await this.gmail.updateConnection(connection.id, {
        accessTokenCiphertext: encryptSecret(tokens.accessToken, key),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString(),
        ...(tokens.refreshToken ? {refreshTokenCiphertext: encryptSecret(tokens.refreshToken, key)} : {}),
        status: "connected",
        lastSyncError: null,
      });
      return tokens.accessToken;
    } catch (error) {
      await this.markErrored(connection.id, error);
      throw new ApiError(409, "GMAIL_RECONNECT_REQUIRED", "Gmail needs to be reconnected.");
    }
  }

  private async markErrored(connectionId: string, error: unknown): Promise<void> {
    safeOperationalError("Gmail token refresh failed", error);
    await this.gmail.updateConnection(connectionId, {status: "error", lastSyncError: describeFailure(error)});
  }

  // Best-effort revoke, then updates (never deletes) the connection row —
  // purchase_imports history must survive a disconnect.
  async disconnect(userId: string): Promise<void> {
    const connection = await this.gmail.getConnectionByUserId(userId);
    if (!connection) return;
    if (connection.refreshTokenCiphertext) {
      try {
        const refreshToken = decryptSecret(connection.refreshTokenCiphertext, this.encryptionKey());
        await this.gmailClient.revokeToken(refreshToken);
      } catch (error) {
        safeOperationalError("Gmail token revoke failed", error);
      }
    }
    await this.gmail.disconnectConnection(connection.id);
  }
}
