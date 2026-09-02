import type {OrderStatus} from "../../types/commerce.types";
import type {NormalizedGmailMessage} from "../../types/provider.types";

// Gmail message bodies are base64url-encoded (RFC 4648 §5), not standard
// base64 — '-'/'_' instead of '+'/'/' and no padding.
export function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

// Best-effort HTML-to-text: order-email templates vary too much for a real
// parser to be worth a new dependency (see amazon-email.parser.ts's header
// comment). Good enough to locate an <img> src or fall back to when a
// marketplace's email has no text/plain part at all.
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export type StatusKeywordMap = Record<OrderStatus, RegExp[]>;

// Checked most-terminal-status-first: a subject describing both a delivery
// and a return ("delivered — return requested") should classify as the
// more actionable status, not the earlier lifecycle stage.
const STATUS_PRIORITY: OrderStatus[] = ["returned", "cancelled", "delivered", "shipped", "confirmed"];

export function classifyStatus(subject: string, keywords: StatusKeywordMap): OrderStatus | null {
  for (const status of STATUS_PRIORITY) {
    if (keywords[status].some((pattern) => pattern.test(subject))) return status;
  }
  return null;
}

// Gmail's internalDate is the message's receipt timestamp as epoch
// milliseconds (a string). Used as the best available proxy for "when this
// lifecycle event happened" across every marketplace parser and by
// purchase-import.service's latestEventAt bookkeeping.
export function resolveEventDate(message: Pick<NormalizedGmailMessage, "internalDate">): string {
  const parsed = message.internalDate ? Number(message.internalDate) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}
