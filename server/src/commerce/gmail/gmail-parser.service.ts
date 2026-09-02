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

  parse(message: NormalizedGmailMessage): ParsedOrderEmail | null {
    const parser = this.parsers.find((candidate) => candidate.matches(message.from));
    return parser ? parser.parse(message) : null;
  }
}
