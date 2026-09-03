import {classifyStatus, stripHtml, resolveEventDate, type StatusKeywordMap} from "../gmail/parsing-utils";
import type {EmailParser, ParsedOrderEmail} from "../commerce.types";
import type {NormalizedGmailMessage} from "../../types/provider.types";

// Fallback for every fashion retailer that doesn't have its own structured
// parser (compare parsers/amazon-email.parser.ts). Deliberately scoped to
// an explicit allow-list of known fashion/apparel e-commerce domains rather
// than "any sender" — the sender-domain list also drives gmail-sync's
// Gmail search query (see GmailParserService.getCombinedSenderQuery), so an
// unbounded match here would mean scanning the entire mailbox. Growing
// coverage to a new store is: add its domain to this list, nothing else —
// that's what makes this parser "generic" rather than store-specific.
const SENDER_DOMAINS = [
  "flipkart.com", "myntra.com", "ajio.com", "meesho.com",
  "nykaafashion.com", "nykaa.com", "tatacliq.com", "snapdeal.com", "limeroad.com",
  "bewakoof.com", "fabindia.com", "shoppersstop.com", "lifestylestores.com",
  "asos.com", "next.co.uk", "marksandspencer.com", "hm.com", "zara.com", "uniqlo.com",
  "shein.com", "nordstrom.com", "macys.com", "zappos.com", "urbanoutfitters.com",
  "gap.com", "oldnavy.com", "footlocker.com", "adidas.com", "nike.com", "puma.com",
];

// Generic templates are far noisier than Amazon's single-brand template
// set, so a status-keyword match alone is not trusted — see the
// corroboration check in parse() below.
const STATUS_KEYWORDS: StatusKeywordMap = {
  returned: [/\breturn(ed|s)?\b.*\b(initiated|completed|requested|confirmed|processed)\b/i, /\brefund(ed)?\b/i, /\byour return\b/i],
  cancelled: [/\bcancel(led|ed|lation)\b/i, /\border\s*cancel/i],
  delivered: [/\bdelivered\b/i, /\bhas arrived\b/i, /\bpackage\s*(has\s*)?arrived\b/i, /\bdelivery\s*complete/i],
  shipped: [/\bshipped\b/i, /\bdispatched\b/i, /\bout for delivery\b/i, /\bon (the |it'?s )?way\b/i, /\btracking\s*(number|info|update)\b/i],
  confirmed: [/\border\s*(confirm(ed|ation)|placed|received)\b/i, /\bthank you for (your|the) order\b/i, /\byour order\b.*\bconfirm/i, /\bwe'?ve received your order\b/i],
};

// Real transactional subjects essentially never contain marketing copy
// like this; a status keyword co-occurring with one of these is far more
// likely a promotional email ("Order confirmed sale — extra 20% off!")
// than a genuine order-lifecycle notice, so it's rejected outright rather
// than risk a false positive.
const PROMOTIONAL_PATTERN = /(\d+%\s*off|\bsale\b|\bcoupon\b|\bpromo(?:tion)?\b|\bnewsletter\b|\bwishlist\b|\brecommend(?:ed|ation)?\b|\bnew arrivals?\b|\bback in stock\b|\bdeals?\b|\boffers?\b|\bdiscount\b)/i;

const QUOTED_TITLE_PATTERN = /"([^"]{3,150})"/;
const ITEM_LABEL_PATTERN = /\b(?:item|product)(?:\s*name)?\s*[:\-]\s*([^\n]{3,150})/i;
const GENERIC_ALT_DENYLIST = /^(logo|icon|banner|header|footer|spacer|pixel|tracking|arrow|star|button|divider|social|badge)s?$/i;
const IMG_ALT_PATTERN = /<img\b[^>]*\balt=["']([^"']{3,150})["'][^>]*>/gi;
const IMG_SRC_PATTERN = /<img\b[^>]*\bsrc=["'](https:\/\/[^"'\s]+)["'][^>]*>/gi;
const NON_PRODUCT_IMAGE_PATTERN = /(logo|icon|banner|header|footer|spacer|pixel|tracking|social|badge|sprite|1x1)/i;
// Requires at least one digit in the captured token (via lookahead) so a
// bare "Order Confirmation" heading is never mistaken for an order id.
const ORDER_ID_PATTERN = /\border\s*(?:id|no\.?|number|#)?\s*[:#]?\s*((?=[A-Za-z0-9\-/]*\d)[A-Za-z0-9][A-Za-z0-9\-/]{3,29})\b/i;
const SIZE_PATTERN = /\bsize:?\s*([^\n,|]{1,40})/i;
const COLOR_PATTERN = /\bcolou?r:?\s*([^\n,|]{1,40})/i;
const BRAND_PATTERN = /\b(?:sold\s*by|brand)\s*[:\-]\s*([^\n,|]{2,60})/i;
const QUANTITY_PATTERN = /\b(?:qty|quantity)\s*[:\-]?\s*(\d{1,3})\b/i;
const PRICE_PATTERN = /(?:order\s*total|item\s*total|grand\s*total|total\s*amount|amount\s*paid|total\s*paid|order\s*amount|order\s*value|you\s*paid)[:\s]*(₹|Rs\.?|INR|\$|USD|£|GBP|€|EUR)\s*([\d,]+(?:\.\d{1,2})?)/i;
const CURRENCY_BY_TOKEN: Record<string, string> = {"₹": "INR", RS: "INR", INR: "INR", $: "USD", USD: "USD", "£": "GBP", GBP: "GBP", "€": "EUR", EUR: "EUR"};

function matchedDomain(fromHeader: string): string | null {
  const from = fromHeader.toLowerCase();
  return SENDER_DOMAINS.find((domain) => from.includes(`@${domain}`) || from.includes(`.${domain}`)) ?? null;
}

function extractOrderId(subject: string, textBody: string): string | null {
  return (subject.match(ORDER_ID_PATTERN) || textBody.match(ORDER_ID_PATTERN))?.[1]?.trim() ?? null;
}

function extractPlausibleImageAlt(htmlBody: string): string | null {
  for (const match of htmlBody.matchAll(IMG_ALT_PATTERN)) {
    const alt = match[1]?.trim();
    if (alt && !GENERIC_ALT_DENYLIST.test(alt)) return alt;
  }
  return null;
}

// Most-reliable-signal-first, matching amazon-email.parser.ts's approach:
// a quoted title (subject, then body), then an explicit "Item:"/"Product:"
// label, then a product image's alt text, then — least reliable — the
// subject line itself. `confident` distinguishes the first four (a real
// signal was found) from the last (nothing better than the subject was
// available), and gates the corroboration check in parse() below.
function extractProductName(subject: string, plainText: string, htmlBody: string): {productName: string; confident: boolean} {
  const fromSubjectQuote = subject.match(QUOTED_TITLE_PATTERN)?.[1];
  if (fromSubjectQuote) return {productName: fromSubjectQuote.trim(), confident: true};
  const fromBodyQuote = plainText.match(QUOTED_TITLE_PATTERN)?.[1];
  if (fromBodyQuote) return {productName: fromBodyQuote.trim(), confident: true};
  const fromLabel = plainText.match(ITEM_LABEL_PATTERN)?.[1];
  if (fromLabel) return {productName: fromLabel.trim().slice(0, 150), confident: true};
  const fromAlt = extractPlausibleImageAlt(htmlBody);
  if (fromAlt) return {productName: fromAlt.slice(0, 150), confident: true};
  return {productName: subject.trim().slice(0, 150) || "Order item", confident: false};
}

function extractImageUrl(htmlBody: string): string | null {
  for (const match of htmlBody.matchAll(IMG_SRC_PATTERN)) {
    const src = match[1];
    if (src && !NON_PRODUCT_IMAGE_PATTERN.test(src)) return src;
  }
  return null;
}

function extractPrice(text: string): {currency: string | null; priceAmount: number | null} {
  const match = text.match(PRICE_PATTERN);
  if (!match) return {currency: null, priceAmount: null};
  const token = (match[1] || "").toUpperCase().replace(/\.$/, "");
  const amount = match[2] || "";
  return {currency: CURRENCY_BY_TOKEN[token] ?? null, priceAmount: amount ? Number(amount.replace(/,/g, "")) : null};
}

export class GenericEmailParser implements EmailParser {
  readonly marketplace = "other" as const;
  readonly senderDomains = SENDER_DOMAINS;

  matches(fromHeader: string): boolean {
    return matchedDomain(fromHeader) !== null;
  }

  parse(message: NormalizedGmailMessage): ParsedOrderEmail | null {
    if (PROMOTIONAL_PATTERN.test(message.subject)) return null;

    const orderStatus = classifyStatus(message.subject, STATUS_KEYWORDS);
    if (!orderStatus) return null;

    const plainText = message.textBody || stripHtml(message.htmlBody);
    const orderId = extractOrderId(message.subject, plainText);
    const {productName, confident} = extractProductName(message.subject, plainText, message.htmlBody);
    const sizeLabel = plainText.match(SIZE_PATTERN)?.[1]?.trim() || null;
    const colorLabel = plainText.match(COLOR_PATTERN)?.[1]?.trim() || null;
    const brand = plainText.match(BRAND_PATTERN)?.[1]?.trim() || null;
    const quantityToken = plainText.match(QUANTITY_PATTERN)?.[1];
    const quantity = quantityToken ? Number(quantityToken) : null;
    const {currency, priceAmount} = extractPrice(plainText);
    const eventAt = resolveEventDate(message);

    // Without a marketplace-specific template, a bare status-keyword match
    // is too weak on its own — at least one corroborating signal (an order
    // reference, a price, or a confidently-sourced product name) must also
    // be present, or this is discarded as unparseable rather than risk a
    // false positive.
    if (!orderId && priceAmount === null && !confident) return null;

    // No marketplace exposes a stable product id the way Amazon's ASIN
    // does here, so the sending store's domain is folded into the identity
    // to keep two different stores' same-named products from colliding
    // under the shared "other" marketplace bucket.
    const store = matchedDomain(message.from) ?? "unknown";
    const productIdentity = `${store}:${productName.toLowerCase().trim().slice(0, 80)}|${sizeLabel || ""}|${colorLabel || ""}`.slice(0, 160);

    return {
      marketplace: this.marketplace,
      orderId,
      productIdentity,
      productName,
      brand,
      imageUrl: extractImageUrl(message.htmlBody),
      sizeLabel,
      colorLabel,
      quantity,
      currency,
      priceAmount,
      orderStatus,
      orderedAt: orderStatus === "confirmed" ? eventAt : null,
      deliveredAt: orderStatus === "delivered" ? eventAt : null,
    };
  }
}
