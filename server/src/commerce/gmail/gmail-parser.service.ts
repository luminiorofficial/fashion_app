import {validateParsedOrderEmail} from "../parsed-order-email.schema";
import type {EmailParser, ParsedOrderEmail} from "../commerce.types";
import type {NormalizedGmailMessage} from "../../types/provider.types";

// Registry of marketplace EmailParsers. Adding Flipkart/Myntra/AJIO/Meesho
// support later is: write a new commerce/parsers/*.ts implementing
// EmailParser, and add it to the array container.ts constructs this with —
// nothing else in the sync pipeline changes.
export class GmailParserService {
  constructor(private readonly parsers: EmailParser[]) {}

  // Builds the Gmail search `from:(...)` fragment covering every registered
  // parser's sender domains, so gmail-sync only ever lists messages at
  // least one parser could plausibly handle.
  getCombinedSenderQuery(): string {
    const domains = [...new Set(this.parsers.flatMap((parser) => parser.senderDomains))];
    return domains.length ? `from:(${domains.map((domain) => `@${domain}`).join(" OR ")})` : "";
  }

  // Every parser's output (Amazon's included) is run through the shared
  // strict Zod schema before it ever reaches PurchaseImportService — see
  // parsed-order-email.schema.ts. A schema failure is treated exactly like
  // the parser itself returning null: the email is silently skipped, not
  // an error.
  parse(message: NormalizedGmailMessage): ParsedOrderEmail | null {
    const parser = this.parsers.find((candidate) => candidate.matches(message.from));
    const parsed = parser ? parser.parse(message) : null;
    return parsed ? validateParsedOrderEmail(parsed) : null;
  }
}
