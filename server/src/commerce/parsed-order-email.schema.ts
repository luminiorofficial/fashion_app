import {z} from "zod";
import type {ParsedOrderEmail} from "./commerce.types";

// Strict output gate for every EmailParser (Amazon's included — see
// gmail/gmail-parser.service.ts, which runs every parser's result through
// this before it ever reaches PurchaseImportService). Bounds mirror the
// purchase_imports column types/CHECKs (database/migrations/
// 006_gmail_commerce_integration.sql, 007_generic_marketplace_fallback.sql)
// so a malformed extraction is discarded here — as an unparsed email, same
// as a parser returning null — instead of surfacing as a DB constraint
// violation deeper in the sync pipeline. A new marketplace parser added
// later automatically inherits this same floor with no change to this file.
const MARKETPLACES = ["amazon", "flipkart", "myntra", "ajio", "meesho", "other"] as const;
const ORDER_STATUSES = ["confirmed", "shipped", "delivered", "cancelled", "returned"] as const;

const MIN_VALID_DATE_MS = Date.parse("2000-01-01T00:00:00Z");
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

// Loopback / link-local / private-use ranges (IPv4 + IPv6), so a crafted or
// spoofed order email can never turn PurchaseImportService.addToWardrobe's
// server-side product-photo download into a request against internal
// infrastructure (SSRF) — e.g. the 169.254.169.254 cloud metadata endpoint.
const UNSAFE_IMAGE_HOSTS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^169\.254\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/i,
  /^\[?fe80:/i,
  /^\[?f[cd][0-9a-f]{2}:/i,
];

function isSafeImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !UNSAFE_IMAGE_HOSTS.some((pattern) => pattern.test(url.hostname));
}

const isoDate = z.string().refine((value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= MIN_VALID_DATE_MS && parsed <= Date.now() + FUTURE_SLACK_MS;
}, "must be a plausible ISO date string");

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const parsedOrderEmailSchema = z
  .object({
    marketplace: z.enum(MARKETPLACES),
    orderId: trimmed(1, 160).nullable(),
    productIdentity: trimmed(1, 160),
    productName: trimmed(1, 300),
    brand: trimmed(1, 160).nullable(),
    imageUrl: z
      .string()
      .url()
      .max(2048)
      .refine(isSafeImageUrl, "must be a safe https product image URL")
      .nullable(),
    sizeLabel: trimmed(1, 80).nullable(),
    colorLabel: trimmed(1, 80).nullable(),
    quantity: z.number().int().min(1).max(999).nullable(),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, "must be a 3-letter ISO 4217 code")
      .nullable(),
    priceAmount: z.number().finite().min(0).max(10_000_000).nullable(),
    orderStatus: z.enum(ORDER_STATUSES),
    orderedAt: isoDate.nullable(),
    deliveredAt: isoDate.nullable(),
  })
  .strict();

// A validation failure here means "treat this email as unparsed" (same as
// a parser returning null), never a thrown error — one malformed or
// unexpected email must not abort an entire sync run.
export function validateParsedOrderEmail(candidate: ParsedOrderEmail): ParsedOrderEmail | null {
  const result = parsedOrderEmailSchema.safeParse(candidate);
  return result.success ? (result.data as ParsedOrderEmail) : null;
}
