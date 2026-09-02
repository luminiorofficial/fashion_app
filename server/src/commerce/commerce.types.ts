import type {Marketplace, OrderStatus} from "../types/commerce.types";
import type {NormalizedGmailMessage} from "../types/provider.types";

// Layer-internal plumbing only — never persisted directly (compare with
// types/commerce.types.ts, which holds the persisted/public shapes).
export interface ParsedOrderEmail {
  marketplace: Marketplace;
  orderId: string | null;
  productIdentity: string;
  productName: string;
  brand: string | null;
  imageUrl: string | null;
  sizeLabel: string | null;
  colorLabel: string | null;
  quantity: number | null;
  currency: string | null;
  priceAmount: number | null;
  orderStatus: OrderStatus;
  orderedAt: string | null;
  deliveredAt: string | null;
}

// One implementation per marketplace (see commerce/parsers/*). Registered
// with GmailParserService, which dispatches an incoming message to whichever
// parser's matches() accepts its From header — this is the seam that makes
// adding Flipkart/Myntra/AJIO/Meesho support a new file, not a rewrite.
export interface EmailParser {
  readonly marketplace: Marketplace;
  readonly senderDomains: string[];
  matches(fromHeader: string): boolean;
  parse(message: NormalizedGmailMessage): ParsedOrderEmail | null;
}
