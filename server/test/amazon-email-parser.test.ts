import test from "node:test";
import assert from "node:assert/strict";
import {AmazonEmailParser} from "../src/commerce/parsers/amazon-email.parser";
import {isLikelyFashion} from "../src/commerce/purchase-import.service";
import type {NormalizedGmailMessage} from "../src/types/provider.types";

const ORDER_ID = "402-1234567-7654321";
const ASIN = "B08XYZ1234";
const IMAGE_HTML = `<html><body><img src="https://m.media-amazon.com/images/I/71abcDEF._SY88_.jpg"/><a href="https://www.amazon.in/dp/${ASIN}/ref=od_dic">Roadster Shirt</a></body></html>`;

function message(overrides: Partial<NormalizedGmailMessage>): NormalizedGmailMessage {
  return {id: "msg-1", internalDate: String(Date.parse("2026-01-15T10:00:00Z")), from: "auto-confirm@amazon.in", subject: "", textBody: "", htmlBody: "", ...overrides};
}

const parser = new AmazonEmailParser();

test("matches Amazon sender domains and rejects unrelated senders", () => {
  assert.equal(parser.matches("auto-confirm@amazon.in"), true);
  assert.equal(parser.matches("shipment-tracking@amazon.in"), true);
  assert.equal(parser.matches("no-reply@notifications.myntra.com"), false);
});

test("classifies order confirmed, extracts order id, asin, size, and color", () => {
  const parsed = parser.parse(message({
    from: "auto-confirm@amazon.in",
    subject: 'Your Amazon.in order of "Roadster Men Navy Blue Slim Fit Casual Shirt" has been placed.',
    textBody: `Thank you for shopping with us.\n\nOrder #${ORDER_ID}\nOrder Total: Rs. 899.00\n\nRoadster Men Navy Blue Slim Fit Casual Shirt\nSize: L | Colour: Navy Blue\nQty: 1`,
    htmlBody: IMAGE_HTML,
  }));
  assert.ok(parsed);
  assert.equal(parsed!.orderStatus, "confirmed");
  assert.equal(parsed!.orderId, ORDER_ID);
  assert.equal(parsed!.productIdentity, `asin:${ASIN}`);
  assert.equal(parsed!.productName, "Roadster Men Navy Blue Slim Fit Casual Shirt");
  assert.equal(parsed!.sizeLabel, "L");
  assert.equal(parsed!.colorLabel, "Navy Blue");
  assert.equal(parsed!.currency, "INR");
  assert.equal(parsed!.priceAmount, 899);
  assert.equal(parsed!.imageUrl, "https://m.media-amazon.com/images/I/71abcDEF._SY500_.jpg");
  assert.ok(parsed!.orderedAt);
  assert.equal(parsed!.deliveredAt, null);
});

test("same order's confirm/ship/deliver emails collapse onto one productIdentity via ASIN despite differently-truncated titles", () => {
  const confirmed = parser.parse(message({
    subject: 'Your Amazon.in order of "Roadster Men Navy Blue Slim Fit Casual Shirt" has been placed.',
    textBody: `Order #${ORDER_ID}`,
    htmlBody: IMAGE_HTML,
  }));
  const shipped = parser.parse(message({
    from: "shipment-tracking@amazon.in",
    subject: `Your package with "Roadster Men Navy Blue..." has shipped!`,
    textBody: `Order #${ORDER_ID}`,
    htmlBody: IMAGE_HTML,
  }));
  const delivered = parser.parse(message({
    from: "shipment-tracking@amazon.in",
    subject: `Your Amazon.in order of "Roadster Shirt" has been delivered.`,
    textBody: `Order #${ORDER_ID}`,
    htmlBody: IMAGE_HTML,
  }));
  assert.ok(confirmed && shipped && delivered);
  assert.equal(confirmed!.productIdentity, `asin:${ASIN}`);
  assert.equal(shipped!.productIdentity, confirmed!.productIdentity);
  assert.equal(delivered!.productIdentity, confirmed!.productIdentity);
  assert.equal(shipped!.orderStatus, "shipped");
  assert.equal(delivered!.orderStatus, "delivered");
  assert.ok(delivered!.deliveredAt);
});

test("classifies cancelled and returned orders", () => {
  const cancelled = parser.parse(message({subject: "Your order has been cancelled", textBody: `Order #${ORDER_ID}`}));
  const returned = parser.parse(message({subject: "Your return for your order has been completed. Refund initiated.", textBody: `Order #${ORDER_ID}`}));
  assert.equal(cancelled?.orderStatus, "cancelled");
  assert.equal(returned?.orderStatus, "returned");
});

test("falls back to a name+size+color productIdentity when no ASIN link is present", () => {
  const parsed = parser.parse(message({
    subject: 'Your Amazon.in order of "Generic Cotton Kurti" has been delivered.',
    textBody: `Order #${ORDER_ID}\nSize: M | Colour: Beige`,
    htmlBody: "<html><body>no product image or link here</body></html>",
  }));
  assert.ok(parsed);
  assert.equal(parsed!.productIdentity, "name:generic cotton kurti|M|Beige");
  assert.equal(parsed!.imageUrl, null);
});

test("returns null for an Amazon email whose subject doesn't match any known order-status pattern", () => {
  const parsed = parser.parse(message({subject: "Deals just for you: up to 60% off fashion", textBody: "Check out today's deals."}));
  assert.equal(parsed, null);
});

test("isLikelyFashion allows clothing/footwear/accessory product names and excludes obvious non-fashion ones", () => {
  assert.equal(isLikelyFashion("Roadster Men Navy Blue Slim Fit Casual Shirt"), true);
  assert.equal(isLikelyFashion("Puma Men's Running Sneakers"), true);
  assert.equal(isLikelyFashion("Fastrack Analog Watch for Women"), true);
  assert.equal(isLikelyFashion("Redmi 10 Prime Smartphone (Sapphire Blue, 6GB RAM)"), false);
  assert.equal(isLikelyFashion("AmazonBasics 3-Blade Ceiling Fan"), false);
  assert.equal(isLikelyFashion("Generic Kitchen Storage Container Set"), false);
});
