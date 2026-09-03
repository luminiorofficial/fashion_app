import test from "node:test";
import assert from "node:assert/strict";
import {GenericEmailParser} from "../src/commerce/parsers/generic-email.parser";
import type {NormalizedGmailMessage} from "../src/types/provider.types";

function message(overrides: Partial<NormalizedGmailMessage>): NormalizedGmailMessage {
  return {id: "msg-1", internalDate: String(Date.parse("2026-01-15T10:00:00Z")), from: "orders@nykaafashion.com", subject: "", textBody: "", htmlBody: "", ...overrides};
}

const parser = new GenericEmailParser();

test("matches allow-listed fashion retailer domains and rejects unknown/unrelated senders", () => {
  assert.equal(parser.matches("orders@nykaafashion.com"), true);
  assert.equal(parser.matches("no-reply@flipkart.com"), true);
  assert.equal(parser.matches("shipping-updates@myntra.com"), true);
  assert.equal(parser.matches("billing@some-random-saas.io"), false);
  assert.equal(parser.matches("no-reply@amazon.in"), false);
});

test("classifies a delivered order, extracts order id, item label, size, color, price, and image", () => {
  const parsed = parser.parse(message({
    from: "orders@nykaafashion.com",
    subject: "Your order has been delivered!",
    textBody: "Hi Priya,\n\nGreat news! Order ID: NYK7788990 has been delivered.\n\nItem: Libas Women Floral Print Anarkali Kurta\nSize: M | Colour: Pink\nQty: 1\nOrder Total: Rs. 1299.00\n\nThank you for shopping with us.",
    htmlBody: '<html><body><img src="https://images.nykaafashion.com/products/NYK7788990/main.jpg" alt="Libas Women Floral Print Anarkali Kurta"/></body></html>',
  }));
  assert.ok(parsed);
  assert.equal(parsed!.marketplace, "other");
  assert.equal(parsed!.orderStatus, "delivered");
  assert.equal(parsed!.orderId, "NYK7788990");
  assert.equal(parsed!.productName, "Libas Women Floral Print Anarkali Kurta");
  assert.equal(parsed!.sizeLabel, "M");
  assert.equal(parsed!.colorLabel, "Pink");
  assert.equal(parsed!.quantity, 1);
  assert.equal(parsed!.currency, "INR");
  assert.equal(parsed!.priceAmount, 1299);
  assert.equal(parsed!.imageUrl, "https://images.nykaafashion.com/products/NYK7788990/main.jpg");
  assert.equal(parsed!.productIdentity, "nykaafashion.com:libas women floral print anarkali kurta|M|Pink");
  assert.ok(parsed!.deliveredAt);
  assert.equal(parsed!.orderedAt, null);
});

test("classifies confirmed/shipped/cancelled/returned with generic phrasing", () => {
  const confirmed = parser.parse(message({subject: "Thank you for your order! Order Number: FLK1234567", textBody: "We've received your order."}));
  const shipped = parser.parse(message({subject: "Your package has been dispatched — Order #FLK1234567", textBody: "It's on the way."}));
  const cancelled = parser.parse(message({subject: "Order cancelled — Order No. FLK1234567", textBody: "Your order was cancelled."}));
  const returned = parser.parse(message({subject: "Your return has been completed. Refund initiated. Order#FLK1234567", textBody: "Refund processed."}));
  assert.equal(confirmed?.orderStatus, "confirmed");
  assert.equal(shipped?.orderStatus, "shipped");
  assert.equal(cancelled?.orderStatus, "cancelled");
  assert.equal(returned?.orderStatus, "returned");
});

test("classifies an 'out for delivery' notice as shipped, not delivered", () => {
  const parsed = parser.parse(message({
    subject: "Your package is out for delivery today",
    textBody: "Order ID: FLK4445556",
  }));
  assert.equal(parsed?.orderStatus, "shipped");
  assert.equal(parsed?.deliveredAt, null);
});

test("rejects a promotional email even when it superficially contains order-status wording", () => {
  const parsed = parser.parse(message({
    subject: "Your order confirmed — Sale: extra 20% off your next order!",
    textBody: "Order ID: FLK9998887. Shop now and save.",
  }));
  assert.equal(parsed, null);
});

test("rejects a low-confidence match with a status keyword but no corroborating signal", () => {
  const parsed = parser.parse(message({subject: "Your order has been shipped", textBody: "Thanks for shopping with us."}));
  assert.equal(parsed, null);
});

test("returns null for a subject that matches no known order-status pattern", () => {
  assert.equal(parser.parse(message({subject: "Check out our new spring collection", textBody: "Take a look at what's new."})), null);
});

test("skips tracking-pixel-like images and only extracts a plausible product photo", () => {
  const parsed = parser.parse(message({
    subject: 'Your order of "Cotton Blend Shirt" has been delivered',
    textBody: "Order ID: FLK4445556",
    htmlBody: '<html><body><img src="https://track.nykaafashion.com/pixel.gif"/><img src="https://cdn.nykaafashion.com/logo-banner.png"/><img src="https://cdn.nykaafashion.com/items/shirt-front.jpg"/></body></html>',
  }));
  assert.ok(parsed);
  assert.equal(parsed!.imageUrl, "https://cdn.nykaafashion.com/items/shirt-front.jpg");
});

test("never extracts a non-https image URL", () => {
  const parsed = parser.parse(message({
    subject: 'Your order of "Cotton Blend Shirt" has been delivered',
    textBody: "Order ID: FLK4445556",
    htmlBody: '<html><body><img src="http://cdn.nykaafashion.com/items/shirt-front.jpg"/></body></html>',
  }));
  assert.ok(parsed);
  assert.equal(parsed!.imageUrl, null);
});
