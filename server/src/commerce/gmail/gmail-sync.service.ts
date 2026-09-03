import {assert} from "../../utils/api-error";
import {safeOperationalError, describeFailure} from "../../utils/safe-logging";
import type {GmailOAuthService} from "./gmail-oauth.service";
import type {GmailParserService} from "./gmail-parser.service";
import type {PurchaseImportService} from "../purchase-import.service";
import type {AppConfig} from "../../config/env";
import type {GmailRepository, PurchaseImportsRepository} from "../../types/repositories";
import type {GmailApiClient} from "../../types/provider.types";
import type {GmailConnection} from "../../types/commerce.types";

export type GmailSyncServiceConfig = Pick<AppConfig, "gmailLookbackDays" | "gmailMaxMessagesPerSyncRun" | "gmailSyncBudgetMs">;

export interface GmailSyncResult {
  processed: number;
  hasMore: boolean;
}

const MS_PER_DAY = 86_400_000;
// Gmail's `after:`/`before:` search operators are day-granularity, so an
// incremental sync re-requests a couple of days it already covered rather
// than risk missing a message that landed right at the boundary.
// gmail_processed_messages (checked below) makes that overlap a cheap no-op.
const INCREMENTAL_OVERLAP_DAYS = 2;

function toGmailDateParam(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "/");
}

// Orchestrates one bounded sync pass for a connection: lists candidate
// message ids (scoped to every registered parser's sender domains and a
// date window), skips anything already processed, parses+records the rest
// up to a message-count cap and a wall-clock time budget (Vercel's
// function timeout leaves no room for an unbounded 90-day backfill in one
// request — see container.ts/bootstrap.ts wiring), and returns whether
// more work remains so the caller can re-invoke.
export class GmailSyncService {
  // In-process guard against two overlapping syncConnection() calls for the
  // SAME connection (e.g. a client double-tapping "sync", or a timed-out
  // request retried while the first is still running). Deliberately
  // separate from GmailConnection.lastSyncStatus, which already uses
  // "syncing" to mean something else — "the backlog isn't fully drained
  // yet, call sync again" (see the hasMore handling below) — so gating on
  // that value would incorrectly block the very continuation calls that
  // value exists to invite. Note this only protects one server instance;
  // it does not replace the database-level race handling in
  // PostgresPurchaseImportsRepository.upsertParsedOrder for a multi-instance
  // deployment.
  private readonly inFlightConnectionIds = new Set<string>();

  constructor(
    private readonly gmail: GmailRepository,
    private readonly purchaseImports: PurchaseImportsRepository,
    private readonly purchaseImportService: PurchaseImportService,
    private readonly gmailOAuth: GmailOAuthService,
    private readonly gmailClient: GmailApiClient,
    private readonly parser: GmailParserService,
    private readonly config: GmailSyncServiceConfig,
  ) {}

  async syncConnection(connection: GmailConnection): Promise<GmailSyncResult> {
    assert(!this.inFlightConnectionIds.has(connection.id), 409, "GMAIL_SYNC_ALREADY_IN_PROGRESS", "A Gmail sync for this account is already running.");
    this.inFlightConnectionIds.add(connection.id);
    try {
      return await this.runSync(connection);
    } finally {
      this.inFlightConnectionIds.delete(connection.id);
    }
  }

  private async runSync(connection: GmailConnection): Promise<GmailSyncResult> {
    const startedAt = Date.now();
    const isFirstSync = !connection.initialSyncCompletedAt;
    await this.gmail.updateConnection(connection.id, {lastSyncStatus: "syncing"});

    let accessToken: string;
    try {
      accessToken = await this.gmailOAuth.getValidAccessToken(connection);
    } catch (error) {
      await this.gmail.updateConnection(connection.id, {lastSyncStatus: "failed", lastSyncError: describeFailure(error)});
      throw error;
    }

    const sinceDate = isFirstSync
      ? new Date(startedAt - this.config.gmailLookbackDays * MS_PER_DAY)
      : new Date(new Date(connection.lastSyncedAt as string).getTime() - INCREMENTAL_OVERLAP_DAYS * MS_PER_DAY);
    const senderQuery = this.parser.getCombinedSenderQuery();
    const query = [senderQuery, `after:${toGmailDateParam(sinceDate)}`].filter(Boolean).join(" ");

    let processed = 0;
    let hasMore = false;
    let pageToken: string | null = null;

    try {
      paging: do {
        const page = await this.gmailClient.listMessageIds(accessToken, query, pageToken);
        pageToken = page.nextPageToken;
        for (const messageId of page.ids) {
          if (await this.purchaseImports.isMessageProcessed(connection.id, messageId)) continue;
          if (processed >= this.config.gmailMaxMessagesPerSyncRun || Date.now() - startedAt >= this.config.gmailSyncBudgetMs) {
            hasMore = true;
            break paging;
          }
          await this.processMessage(connection, accessToken, messageId);
          processed += 1;
        }
      } while (pageToken);
    } catch (error) {
      await this.gmail.updateConnection(connection.id, {lastSyncStatus: "failed", lastSyncError: describeFailure(error)});
      throw error;
    }

    await this.gmail.updateConnection(connection.id, {
      lastSyncStatus: hasMore ? "syncing" : "completed",
      lastSyncedAt: new Date(startedAt).toISOString(),
      lastSyncError: null,
      ...(isFirstSync && !hasMore ? {initialSyncCompletedAt: new Date().toISOString()} : {}),
    });

    return {processed, hasMore};
  }

  // A single message's parse/record failure never aborts the whole sync —
  // it's marked processed either way so a permanently-unparseable message
  // doesn't retry forever.
  private async processMessage(connection: GmailConnection, accessToken: string, messageId: string): Promise<void> {
    try {
      const message = await this.gmailClient.getMessage(accessToken, messageId);
      const parsed = this.parser.parse(message);
      if (parsed) await this.purchaseImportService.recordParsedOrder(connection.userId, connection.id, message, parsed);
    } catch (error) {
      safeOperationalError("Gmail message processing failed", error, {connectionId: connection.id});
    } finally {
      await this.purchaseImports.markMessageProcessed(connection.id, messageId, null);
    }
  }
}
