import test from "node:test";
import assert from "node:assert/strict";
import {validateParsedOrderEmail} from "../src/commerce/parsed-order-email.schema";
import type {ParsedOrderEmail} from "../src/commerce/commerce.types";

function order(overrides: Partial<ParsedOrderEmail> = {}): ParsedOrderEmail {
  return {
    marketplace: "other",
    orderId: "ORD123456",
    productIdentity: "example.com:cotton shirt|M|Blue",
    productName: "Cotton Shirt",
    brand: "Roadster",
    imageUrl: "https://cdn.example.com/products/shirt.jpg",
    sizeLabel: "M",
    colorLabel: "Blue",
    quantity: 1,
    currency: "INR",
    priceAmount: 999,
    orderStatus: "delivered",
    orderedAt: null,
    deliveredAt: new Date().toISOString(),
    ...overrides,
  };
}

test("accepts a well-formed parsed order email and returns an equivalent object", () => {
  const input = order();
  const result = validateParsedOrderEmail(input);
  assert.ok(result);
  assert.equal(result!.productName, "Cotton Shirt");
  assert.equal(result!.marketplace, "other");
});

test("accepts every declared marketplace value including the generic-fallback's 'other'", () => {
  for (const marketplace of ["amazon", "flipkart", "myntra", "ajio", "meesho", "other"] as const) {
    assert.ok(validateParsedOrderEmail(order({marketplace})), `expected ${marketplace} to be accepted`);
  }
});

test("rejects an unknown marketplace value", () => {
  assert.equal(validateParsedOrderEmail(order({marketplace: "not-a-real-store" as ParsedOrderEmail["marketplace"]})), null);
});

test("rejects a negative or implausibly large price", () => {
  assert.equal(validateParsedOrderEmail(order({priceAmount: -1})), null);
  assert.equal(validateParsedOrderEmail(order({priceAmount: 50_000_000})), null);
});

test("rejects an empty or oversized product name", () => {
  assert.equal(validateParsedOrderEmail(order({productName: "   "})), null);
  assert.equal(validateParsedOrderEmail(order({productName: "x".repeat(301)})), null);
});

test("rejects a non-https product image URL", () => {
  assert.equal(validateParsedOrderEmail(order({imageUrl: "http://cdn.example.com/shirt.jpg"})), null);
});

test("rejects a javascript: or data: URI disguised as an image URL", () => {
  assert.equal(validateParsedOrderEmail(order({imageUrl: "javascript:alert(1)"})), null);
  assert.equal(validateParsedOrderEmail(order({imageUrl: "data:text/html,<script>alert(1)</script>"})), null);
});

test("rejects an image URL pointing at loopback, link-local, or private-use hosts (SSRF guard)", () => {
  assert.equal(validateParsedOrderEmail(order({imageUrl: "https://127.0.0.1/shirt.jpg"})), null);
  assert.equal(validateParsedOrderEmail(order({imageUrl: "https://localhost/shirt.jpg"})), null);
  assert.equal(validateParsedOrderEmail(order({imageUrl: "https://169.254.169.254/latest/meta-data/"})), null);
  assert.equal(validateParsedOrderEmail(order({imageUrl: "https://10.0.0.5/shirt.jpg"})), null);
  assert.equal(validateParsedOrderEmail(order({imageUrl: "https://192.168.1.5/shirt.jpg"})), null);
});

test("rejects a malformed, implausibly old, or future-dated timestamp", () => {
  assert.equal(validateParsedOrderEmail(order({deliveredAt: "not-a-date"})), null);
  assert.equal(validateParsedOrderEmail(order({deliveredAt: "1990-01-01T00:00:00.000Z"})), null);
  assert.equal(validateParsedOrderEmail(order({deliveredAt: new Date(Date.now() + 30 * 86_400_000).toISOString()})), null);
});

test("rejects a currency that isn't a 3-letter ISO code", () => {
  assert.equal(validateParsedOrderEmail(order({currency: "inr"})), null);
  assert.equal(validateParsedOrderEmail(order({currency: "₹"})), null);
});

test("rejects an unexpected extra field (strict schema)", () => {
  const withExtra = {...order(), unexpectedField: "injected"} as unknown as ParsedOrderEmail;
  assert.equal(validateParsedOrderEmail(withExtra), null);
});

test("allows every nullable field to be null", () => {
  const result = validateParsedOrderEmail(order({
    orderId: null, brand: null, imageUrl: null, sizeLabel: null, colorLabel: null,
    quantity: null, currency: null, priceAmount: null, orderedAt: null, deliveredAt: null,
  }));
  assert.ok(result);
});
