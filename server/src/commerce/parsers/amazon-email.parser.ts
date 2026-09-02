import {classifyStatus, stripHtml, resolveEventDate, type StatusKeywordMap} from "../gmail/parsing-utils";
import type {EmailParser, ParsedOrderEmail} from "../commerce.types";
import type {NormalizedGmailMessage} from "../../types/provider.types";

// Amazon transactional emails come from several regional/purpose-specific
// addresses (auto-confirm@, shipment-tracking@, order-update@, return@,
// digital-no-reply@, ...) all under one of these domains — matched by
// domain rather than an exhaustive local-part list so new Amazon sender
// addresses don't require a parser change.
const SENDER_DOMAINS = ["amazon.in", "amazon.com", "amazon.co.uk", "amazon.ae", "amazon.de"];

// Every regex here is a best-effort heuristic against Amazon's transactional
// email templates, which vary by region/locale and change periodically
// without notice. There is no official structured-data feed for order
// emails, so this parser intentionally trades completeness for staying
// dependency-free (see gmail/parsing-utils.ts's stripHtml doc) — a miss
// just means that email is skipped, not a crash or bad data.
const STATUS_KEYWORDS: StatusKeywordMap = {
  returned: [/\breturn(ed|s)?\b.*\b(initiated|completed|requested|confirmed)/i, /\brefund\b/i, /\byour return\b/i],
  cancelled: [/\bcancel(led|lation)\b/i],
  delivered: [/\bdelivered\b/i],
  shipped: [/\bshipped\b/i, /\bout for delivery\b/i, /\bon (the |it'?s )?way\b/i, /\bdispatched\b/i],
  confirmed: [/\border (has been placed|confirmed)\b/i, /\bthank you for (your|the) order\b/i, /\border confirmation\b/i, /\byour amazon(\.\w+)? order\b/i],
};

const ORDER_ID_PATTERN = /\b(\d{3}-\d{7}-\d{7})\b/;
const ASIN_PATTERN = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?"]|$)/;
const QUOTED_TITLE_PATTERN = /"([^"]{3,150})"/;
const SIZE_PATTERN = /\bsize:?\s*([^\n,|]{1,40})/i;
const COLOR_PATTERN = /\bcolou?r:?\s*([^\n,|]{1,40})/i;
const PRICE_PATTERN = /(?:order total|item subtotal|grand total)[:\s]*(₹|Rs\.?|\$|£|€)\s*([\d,]+\.\d{2})/i;
const CURRENCY_BY_SYMBOL: Record<string, string> = {"₹": "INR", "Rs.": "INR", Rs: "INR", $: "USD", "£": "GBP", "€": "EUR"};
const AMAZON_IMAGE_HOST_PATTERN = /https:\/\/(?:m\.media-amazon\.com|images-(?:na|eu)\.ssl-images-amazon\.com)\/images\/[^\s"'<>]+/;

function extractOrderId(subject: string, textBody: string): string | null {
  return (subject.match(ORDER_ID_PATTERN) || textBody.match(ORDER_ID_PATTERN))?.[1] ?? null;
}

function extractAsin(htmlBody: string): string | null {
  return htmlBody.match(ASIN_PATTERN)?.[1] ?? null;
}

// The subject line of Amazon's shipped/delivered/cancelled notifications
// almost always quotes a (sometimes truncated) product title — e.g. `Your
// Amazon.in order of "Product Name" has been delivered` — which is a far
// more reliable signal than trying to locate the item line in a stripped
// HTML table. Falls back to the same pattern in the body, then to the
// subject itself so a product name is always returned.
function extractProductName(subject: string, plainText: string): string {
  const fromSubject = subject.match(QUOTED_TITLE_PATTERN)?.[1];
  if (fromSubject) return fromSubject.trim();
  const fromBody = plainText.match(QUOTED_TITLE_PATTERN)?.[1];
  if (fromBody) return fromBody.trim();
  return subject.trim().slice(0, 150) || "Amazon order";
}

function extractImageUrl(htmlBody: string): string | null {
  const match = htmlBody.match(AMAZON_IMAGE_HOST_PATTERN)?.[0];
  if (!match) return null;
  // Amazon thumbnail URLs encode a size suffix like `._SY88_.jpg`; swap it
  // for a larger one so the Purchases UI doesn't show a postage-stamp image.
  return match.replace(/\._[A-Z]{2}\d{2,4}_\./, "._SY500_.");
}

function extractPrice(text: string): {currency: string | null; priceAmount: number | null} {
  const match = text.match(PRICE_PATTERN);
  if (!match) return {currency: null, priceAmount: null};
  const symbol = match[1] || "";
  const amount = match[2] || "";
  return {currency: CURRENCY_BY_SYMBOL[symbol] ?? null, priceAmount: Number(amount.replace(/,/g, ""))};
}

export class AmazonEmailParser implements EmailParser {
  readonly marketplace = "amazon" as const;
  readonly senderDomains = SENDER_DOMAINS;

  matches(fromHeader: string): boolean {
    const from = fromHeader.toLowerCase();
    return SENDER_DOMAINS.some((domain) => from.includes(`@${domain}`) || from.includes(`.${domain}`));
  }

  parse(message: NormalizedGmailMessage): ParsedOrderEmail | null {
    const orderStatus = classifyStatus(message.subject, STATUS_KEYWORDS);
    if (!orderStatus) return null;

    const plainText = message.textBody || stripHtml(message.htmlBody);
    const orderId = extractOrderId(message.subject, plainText);
    const asin = extractAsin(message.htmlBody);
    const productName = extractProductName(message.subject, plainText);
    const sizeLabel = plainText.match(SIZE_PATTERN)?.[1]?.trim() || null;
    const colorLabel = plainText.match(COLOR_PATTERN)?.[1]?.trim() || null;
    const {currency, priceAmount} = extractPrice(plainText);
    const eventAt = resolveEventDate(message);

    // ASIN is Amazon's own stable product identifier, so it's preferred
    // over the product name: confirm/ship/deliver emails for the same
    // order often render slightly different (differently truncated) title
    // text, which would otherwise fragment one order into multiple rows.
    const productIdentity = asin
      ? `asin:${asin}`
      : `name:${productName.toLowerCase().trim().slice(0, 80)}|${sizeLabel || ""}|${colorLabel || ""}`;

    return {
      marketplace: this.marketplace,
      orderId,
      productIdentity,
      productName,
      // Amazon's transactional email templates don't expose brand as a
      // separate field the way some other marketplaces' do — returning
      // null here is more honest than guessing it from the title.
      brand: null,
      imageUrl: extractImageUrl(message.htmlBody),
      sizeLabel,
      colorLabel,
      quantity: null,
      currency,
      priceAmount,
      orderStatus,
      orderedAt: orderStatus === "confirmed" ? eventAt : null,
      deliveredAt: orderStatus === "delivered" ? eventAt : null,
    };
  }
}
