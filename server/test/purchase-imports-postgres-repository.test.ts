import test from "node:test";
import assert from "node:assert/strict";
import type {Pool} from "pg";
import {PostgresPurchaseImportsRepository} from "../src/database/repositories/postgres/purchase-imports.repository";
import type {RecordParsedOrderInput} from "../src/types/commerce.types";

// Minimal structural mirror of the repository's private PurchaseImportRow
// shape (snake_case DB columns) — the repository doesn't export that type,
// so this white-box test duplicates just enough of it to drive a fake
// Postgres client.
interface Row {
  id: string;
  user_id: string;
  gmail_connection_id: string;
  marketplace: string;
  order_id: string | null;
  product_identity: string;
  product_name: string;
  brand: string | null;
  product_image_url: string | null;
  size_label: string | null;
  color_label: string | null;
  quantity: number;
  currency: string | null;
  price_amount: string | null;
  order_status: string;
  ordered_at: string | null;
  delivered_at: string | null;
  latest_event_at: string;
  review_status: string;
  imported_wardrobe_item_id: string | null;
  email_subject: string | null;
  latest_message_id: string | null;
  source_message_ids: string[];
  created_at: string;
  updated_at: string;
}

// A tiny in-memory stand-in for the real purchase_imports table, driven
// entirely through the exact SQL text/params the repository issues (same
// mock-pool pattern hardening.test.ts uses for withTransaction). It exists
// to prove PostgresPurchaseImportsRepository's actual code — not a
// reimplementation of its logic — correctly recovers from a lost INSERT
// race instead of silently dropping the losing email's update.
class FakePurchaseImportsDb {
  rows: Row[] = [];
  private nextId = 1;
  // Simulates a concurrent transaction committing a colliding row in the
  // exact window between our own "no existing row" SELECT and our
  // subsequent INSERT — the race SELECT ... FOR UPDATE cannot close
  // because there's nothing yet to lock. Injected right after the has-order
  // SELECT reports zero rows, so the following INSERT sees a real conflict.
  injectAfterOrderSelect: Row | null = null;

  query(sql: string, params: unknown[] = []): {rows: Row[]; rowCount: number} {
    const text = sql.trim();

    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return {rows: [], rowCount: 0};

    if (text.startsWith("SELECT * FROM purchase_imports WHERE user_id = $1 AND marketplace = $2 AND order_id IS NULL")) {
      const [userId, marketplace, productIdentity] = params as [string, string, string];
      const row = this.rows.find((r) => r.user_id === userId && r.marketplace === marketplace && r.order_id === null && r.product_identity === productIdentity);
      return row ? {rows: [row], rowCount: 1} : {rows: [], rowCount: 0};
    }

    if (text.startsWith("SELECT * FROM purchase_imports WHERE user_id = $1 AND marketplace = $2 AND order_id = $3")) {
      const [userId, marketplace, orderId] = params as [string, string, string];
      const matched = this.rows.filter((r) => r.user_id === userId && r.marketplace === marketplace && r.order_id === orderId);
      if (matched.length === 0 && this.injectAfterOrderSelect) {
        this.rows.push(this.injectAfterOrderSelect);
        this.injectAfterOrderSelect = null;
      }
      return {rows: matched, rowCount: matched.length};
    }

    if (text.startsWith("INSERT INTO purchase_imports")) {
      const [
        userId, connectionId, marketplace, orderId, productIdentity, productName, brand, productImageUrl,
        sizeLabel, colorLabel, quantity, currency, priceAmount, orderStatus, orderedAt, deliveredAt,
        latestEventAt, emailSubject, messageId,
      ] = params as [string, string, string, string | null, string, string, string | null, string | null, string | null, string | null, number, string | null, number | null, string, string | null, string | null, string, string | null, string];
      const conflicts = orderId
        ? this.rows.some((r) => r.user_id === userId && r.marketplace === marketplace && r.order_id === orderId && r.product_identity === productIdentity)
        : this.rows.some((r) => r.user_id === userId && r.marketplace === marketplace && r.order_id === null && r.product_identity === productIdentity);
      if (conflicts) return {rows: [], rowCount: 0};
      const row: Row = {
        id: `row-${this.nextId++}`, user_id: userId, gmail_connection_id: connectionId, marketplace, order_id: orderId,
        product_identity: productIdentity, product_name: productName, brand, product_image_url: productImageUrl,
        size_label: sizeLabel, color_label: colorLabel, quantity, currency,
        price_amount: priceAmount === null ? null : String(priceAmount), order_status: orderStatus,
        ordered_at: orderedAt, delivered_at: deliveredAt, latest_event_at: latestEventAt, review_status: "pending",
        imported_wardrobe_item_id: null, email_subject: emailSubject, latest_message_id: messageId,
        source_message_ids: [messageId], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      this.rows.push(row);
      return {rows: [row], rowCount: 1};
    }

    if (text.startsWith("UPDATE purchase_imports SET") && text.includes("product_name = $2")) {
      const [id, productName, brand, productImageUrl, sizeLabel, colorLabel, currency, priceAmount, orderStatus, orderedAt, deliveredAt, latestEventAt, emailSubject, messageId] =
        params as [string, string, string | null, string | null, string | null, string | null, string | null, number | null, string, string | null, string | null, string, string | null, string];
      const row = this.rows.find((r) => r.id === id);
      if (!row) return {rows: [], rowCount: 0};
      Object.assign(row, {
        product_name: productName, brand: brand ?? row.brand, product_image_url: productImageUrl ?? row.product_image_url,
        size_label: sizeLabel ?? row.size_label, color_label: colorLabel ?? row.color_label,
        currency: currency ?? row.currency, price_amount: priceAmount === null ? row.price_amount : String(priceAmount),
        order_status: orderStatus, ordered_at: row.ordered_at ?? orderedAt, delivered_at: deliveredAt ?? row.delivered_at,
        latest_event_at: latestEventAt, email_subject: emailSubject ?? row.email_subject, latest_message_id: messageId,
        source_message_ids: row.source_message_ids.includes(messageId) ? row.source_message_ids : [...row.source_message_ids, messageId],
      });
      return {rows: [row], rowCount: 1};
    }

    if (text.startsWith("UPDATE purchase_imports SET") && text.includes("order_status = $2")) {
      const [id, orderStatus, orderedAt, deliveredAt, latestEventAt, emailSubject, messageId] =
        params as [string, string, string | null, string | null, string, string | null, string];
      const row = this.rows.find((r) => r.id === id);
      if (!row) return {rows: [], rowCount: 0};
      Object.assign(row, {
        order_status: orderStatus, ordered_at: row.ordered_at ?? orderedAt, delivered_at: deliveredAt ?? row.delivered_at,
        latest_event_at: latestEventAt, email_subject: emailSubject ?? row.email_subject, latest_message_id: messageId,
        source_message_ids: row.source_message_ids.includes(messageId) ? row.source_message_ids : [...row.source_message_ids, messageId],
      });
      return {rows: [row], rowCount: 1};
    }

    if (text.includes("$2 = ANY(source_message_ids)")) {
      const [id, messageId] = params as [string, string];
      const row = this.rows.find((r) => r.id === id);
      if (!row) return {rows: [], rowCount: 0};
      if (!row.source_message_ids.includes(messageId)) row.source_message_ids.push(messageId);
      return {rows: [row], rowCount: 1};
    }

    throw new Error(`FakePurchaseImportsDb: unhandled query: ${text.slice(0, 120)}`);
  }
}

function fakePool(db: FakePurchaseImportsDb): Pool {
  return {connect: async () => ({query: async (sql: string, params?: unknown[]) => db.query(sql, params ?? []), release: () => {}})} as unknown as Pool;
}

function order(overrides: Partial<RecordParsedOrderInput> = {}): RecordParsedOrderInput {
  return {
    marketplace: "amazon", orderId: "402-1234567-7654321", productIdentity: "asin:B08XYZ1234",
    productName: "Roadster Shirt", brand: null, productImageUrl: null, sizeLabel: null, colorLabel: null,
    quantity: null, currency: null, priceAmount: null, orderStatus: "confirmed",
    orderedAt: "2026-01-01T00:00:00.000Z", deliveredAt: null, latestEventAt: "2026-01-01T00:00:00.000Z",
    emailSubject: "order confirmed", messageId: "msg-confirmed",
    ...overrides,
  };
}

test("creates a new row when none exists", async () => {
  const db = new FakePurchaseImportsDb();
  const repo = new PostgresPurchaseImportsRepository(fakePool(db));
  const result = await repo.upsertParsedOrder("user-1", "conn-1", order(), {allowCreate: true});
  assert.ok(result);
  assert.equal(result!.orderStatus, "confirmed");
  assert.equal(db.rows.length, 1);
});

test("returns null instead of creating when allowCreate is false and nothing matched", async () => {
  const db = new FakePurchaseImportsDb();
  const repo = new PostgresPurchaseImportsRepository(fakePool(db));
  const result = await repo.upsertParsedOrder("user-1", "conn-1", order(), {allowCreate: false});
  assert.equal(result, null);
  assert.equal(db.rows.length, 0);
});

test("a strong match (same order id + product identity) updates product detail and status in place", async () => {
  const db = new FakePurchaseImportsDb();
  const repo = new PostgresPurchaseImportsRepository(fakePool(db));
  await repo.upsertParsedOrder("user-1", "conn-1", order(), {allowCreate: true});
  const shipped = await repo.upsertParsedOrder("user-1", "conn-1", order({
    orderStatus: "shipped", orderedAt: null, latestEventAt: "2026-01-02T00:00:00.000Z", emailSubject: "shipped", messageId: "msg-shipped",
  }), {allowCreate: true});
  assert.equal(db.rows.length, 1);
  assert.equal(shipped!.orderStatus, "shipped");
  assert.equal(shipped!.sourceMessageIds.length, 2);
});

test("a weak match (same order id, different/less-detailed identity, single existing row) updates status only", async () => {
  const db = new FakePurchaseImportsDb();
  const repo = new PostgresPurchaseImportsRepository(fakePool(db));
  await repo.upsertParsedOrder("user-1", "conn-1", order(), {allowCreate: true});
  const cancelled = await repo.upsertParsedOrder("user-1", "conn-1", order({
    productIdentity: "name:unrelated fallback identity||", orderStatus: "cancelled", orderedAt: null,
    latestEventAt: "2026-01-03T00:00:00.000Z", emailSubject: "cancelled", messageId: "msg-cancelled",
  }), {allowCreate: true});
  assert.equal(db.rows.length, 1);
  assert.equal(cancelled!.orderStatus, "cancelled");
  assert.equal(cancelled!.productName, "Roadster Shirt");
});

test("a terminal review status (imported/ignored) is never reopened by a later lifecycle email", async () => {
  const db = new FakePurchaseImportsDb();
  const repo = new PostgresPurchaseImportsRepository(fakePool(db));
  const created = await repo.upsertParsedOrder("user-1", "conn-1", order({orderStatus: "delivered", deliveredAt: "2026-01-02T00:00:00.000Z", latestEventAt: "2026-01-02T00:00:00.000Z"}), {allowCreate: true});
  db.rows.find((r) => r.id === created!.id)!.review_status = "imported";
  const cancelled = await repo.upsertParsedOrder("user-1", "conn-1", order({
    orderStatus: "cancelled", orderedAt: null, latestEventAt: "2026-01-03T00:00:00.000Z", emailSubject: "cancelled", messageId: "msg-cancelled",
  }), {allowCreate: true});
  assert.equal(cancelled!.orderStatus, "delivered");
  assert.equal(cancelled!.reviewStatus, "imported");
});

test("an out-of-order (older) event never regresses a newer one", async () => {
  const db = new FakePurchaseImportsDb();
  const repo = new PostgresPurchaseImportsRepository(fakePool(db));
  await repo.upsertParsedOrder("user-1", "conn-1", order({orderStatus: "delivered", deliveredAt: "2026-01-05T00:00:00.000Z", latestEventAt: "2026-01-05T00:00:00.000Z"}), {allowCreate: true});
  const stale = await repo.upsertParsedOrder("user-1", "conn-1", order({
    orderStatus: "shipped", orderedAt: null, latestEventAt: "2026-01-02T00:00:00.000Z", emailSubject: "shipped (delayed delivery)", messageId: "msg-shipped-late",
  }), {allowCreate: true});
  assert.equal(stale!.orderStatus, "delivered");
});

test("upsertParsedOrder recovers from a lost insert race instead of silently dropping the losing email's update", async () => {
  const db = new FakePurchaseImportsDb();
  const repo = new PostgresPurchaseImportsRepository(fakePool(db));

  // Simulates a concurrent sync (e.g. a double-tapped sync request) whose
  // "confirmed" email commits between our own "no existing row" SELECT and
  // our INSERT for this "shipped" email of the very same brand-new order —
  // exactly the window findExisting's FOR UPDATE lock cannot close.
  db.injectAfterOrderSelect = {
    id: "row-concurrent-winner", user_id: "user-1", gmail_connection_id: "conn-1", marketplace: "amazon",
    order_id: "402-1234567-7654321", product_identity: "asin:B08XYZ1234", product_name: "Roadster Shirt",
    brand: null, product_image_url: null, size_label: null, color_label: null, quantity: 1, currency: null,
    price_amount: null, order_status: "confirmed", ordered_at: "2026-01-01T00:00:00.000Z", delivered_at: null,
    latest_event_at: "2026-01-01T00:00:00.000Z", review_status: "pending", imported_wardrobe_item_id: null,
    email_subject: "order confirmed", latest_message_id: "msg-confirmed", source_message_ids: ["msg-confirmed"],
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };

  const result = await repo.upsertParsedOrder("user-1", "conn-1", order({
    orderStatus: "shipped", orderedAt: null, latestEventAt: "2026-01-02T00:00:00.000Z", emailSubject: "shipped", messageId: "msg-shipped",
  }), {allowCreate: true});

  assert.equal(db.rows.length, 1, "the race must never leave two rows for the same order");
  assert.ok(result);
  assert.equal(result!.orderStatus, "shipped", "the losing (shipped) email's update must be applied, not dropped");
  assert.deepEqual(result!.sourceMessageIds, ["msg-confirmed", "msg-shipped"]);
});
