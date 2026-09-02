import type {Request, Response} from "express";
import {assert} from "../utils/api-error";
import {toPublicGmailConnectionStatus} from "../types/commerce.types";
import type {GmailOAuthService} from "../commerce/gmail/gmail-oauth.service";
import type {GmailSyncService} from "../commerce/gmail/gmail-sync.service";
import type {PurchaseImportService} from "../commerce/purchase-import.service";
import type {GmailRepository} from "../types/repositories";
import type {AppConfig} from "../config/env";

export type CommerceControllerConfig = Pick<AppConfig, "googleClientId" | "googleClientSecret">;

function assertGmailConfigured(config: CommerceControllerConfig): void {
  assert(config.googleClientId && config.googleClientSecret, 503, "GMAIL_INTEGRATION_NOT_CONFIGURED", "Gmail purchase detection is not configured on this server.");
}

function callbackPage(success: boolean, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${success ? "Gmail connected" : "Gmail connection failed"}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0b0b0f;color:#f5f0e6;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}
.card{max-width:380px}h1{font-size:20px;margin:0 0 12px}p{color:#b8b3a8;line-height:1.5}</style></head>
<body><div class="card"><h1>${success ? "Gmail connected" : "Connection failed"}</h1><p>${message}</p><p>You can close this tab and return to the Nera app.</p></div></body></html>`;
}

export class CommerceController {
  constructor(
    private readonly gmail: GmailRepository,
    private readonly gmailOAuth: GmailOAuthService,
    private readonly gmailSync: GmailSyncService,
    private readonly purchaseImportService: PurchaseImportService,
    private readonly config: CommerceControllerConfig,
  ) {}

  connectGmail = async (request: Request, response: Response): Promise<void> => {
    assertGmailConfigured(this.config);
    const authUrl = this.gmailOAuth.buildAuthorizationUrl(request.auth!.user.id);
    response.status(201).json({authUrl});
  };

  // Google navigates the user's actual browser to this URL, so it must
  // never respond with a JSON error body — always a small, self-contained
  // HTML page, whatever happens.
  oauthCallback = async (request: Request, response: Response): Promise<void> => {
    try {
      const {code, state, error} = request.query as {code?: string; state?: string; error?: string};
      assert(!error, 400, "OAUTH_DENIED", "Gmail access was not granted.");
      assert(typeof code === "string" && typeof state === "string", 400, "OAUTH_CALLBACK_INVALID", "This Google sign-in link is invalid.");
      await this.gmailOAuth.handleCallback(code, state);
      response.status(200).type("html").send(callbackPage(true, "Your Gmail account is now connected to Nera."));
    } catch {
      response.status(200).type("html").send(callbackPage(false, "We could not connect your Gmail account. Please return to the app and try again."));
    }
  };

  gmailStatus = async (request: Request, response: Response): Promise<void> => {
    assertGmailConfigured(this.config);
    const connection = await this.gmail.getConnectionByUserId(request.auth!.user.id);
    response.json(toPublicGmailConnectionStatus(connection));
  };

  syncGmail = async (request: Request, response: Response): Promise<void> => {
    assertGmailConfigured(this.config);
    const connection = await this.gmail.getConnectionByUserId(request.auth!.user.id);
    assert(connection && connection.status === "connected", 409, "GMAIL_NOT_CONNECTED", "Connect Gmail before syncing.");
    const result = await this.gmailSync.syncConnection(connection);
    response.json(result);
  };

  disconnectGmail = async (request: Request, response: Response): Promise<void> => {
    assertGmailConfigured(this.config);
    await this.gmailOAuth.disconnect(request.auth!.user.id);
    response.sendStatus(204);
  };

  listPurchases = async (request: Request, response: Response): Promise<void> => {
    assertGmailConfigured(this.config);
    const purchases = await this.purchaseImportService.listPendingPurchases(request.auth!.user.id);
    response.json({purchases});
  };

  addPurchaseToWardrobe = async (request: Request, response: Response): Promise<void> => {
    assertGmailConfigured(this.config);
    const item = await this.purchaseImportService.addToWardrobe(request.auth!.user.id, request.params.purchaseId as string);
    response.status(201).json({item});
  };

  ignorePurchase = async (request: Request, response: Response): Promise<void> => {
    assertGmailConfigured(this.config);
    await this.purchaseImportService.ignore(request.auth!.user.id, request.params.purchaseId as string);
    response.sendStatus(204);
  };
}
