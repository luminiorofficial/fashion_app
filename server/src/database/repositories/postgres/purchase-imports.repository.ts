import type {Pool, PoolClient} from "pg";
import {iso, withTransaction} from "../../postgres";
import type {PurchaseImportsRepository} from "../../../types/repositories";
import type {PurchaseImport, RecordParsedOrderInput} from "../../../types/commerce.types";

interface PurchaseImportRow {
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
  ordered_at: string | Date | null;
  delivered_at: string | Date | null;
  latest_event_at: string | Date;
  review_status: string;
  imported_wardrobe_item_id: string | null;
  email_subject: string | null;
  latest_message_id: string | null;
  source_message_ids: string[] | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function purchaseFromRow(row: PurchaseImportRow | undefined): PurchaseImport | null {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    gmailConnectionId: row.gmail_connection_id,
    marketplace: row.marketplace as PurchaseImport["marketplace"],
    orderId: row.order_id,
    productIdentity: row.product_identity,
    productName: row.product_name,
    brand: row.brand,
    productImageUrl: row.product_image_url,
    sizeLabel: row.size_label,
    colorLabel: row.color_label,
    quantity: row.quantity,
    currency: row.currency,
    priceAmount: row.price_amount === null ? null : Number(row.price_amount),
    orderStatus: row.order_status as PurchaseImport["orderStatus"],
    orderedAt: iso(row.ordered_at),
    deliveredAt: iso(row.delivered_at),
    latestEventAt: iso(row.latest_event_at) as string,
    reviewStatus: row.review_status as PurchaseImport["reviewStatus"],
    importedWardrobeItemId: row.imported_wardrobe_item_id,
    emailSubject: row.email_subject,
    latestMessageId: row.latest_message_id,
    sourceMessageIds: row.source_message_ids || [],
    createdAt: iso(row.created_at) as string,
    updatedAt: iso(row.updated_at) as string,
  };
}

export class PostgresPurchaseImportsRepository implements PurchaseImportsRepository {
  constructor(private readonly pool: Pool) {}

  // Transaction + row lock (mirrors PostgresSecurityRepository.reserveAiUsage's
  // advisory-lock pattern) rather than a single ON CONFLICT statement: the
  // two dedup keys (order_id present vs absent) map to two different
  // partial unique indexes, and the terminal-state / out-of-order guards
  // are easier to express correctly as plain conditional TS than as a
  // single DO UPDATE ... WHERE clause. gmail-sync processes one
  // connection's messages sequentially, so contention here is not a
  // practical concern.
  async upsertParsedOrder(userId: string, connectionId: string, input: RecordParsedOrderInput, {allowCreate}: {allowCreate: boolean}): Promise<PurchaseImport | null> {
    return withTransaction(this.pool, async (client) => {
      const match = await this.findExisting(client, userId, input);
      if (!match) {
        if (!allowCreate) return null;
        return purchaseFromRow((await this.insert(client, userId, connectionId, input)).rows[0]) as PurchaseImport;
      }
      const {row: existing, strongMatch} = match;

      if (existing.review_status === "imported" || existing.review_status === "ignored") {
        return purchaseFromRow((await this.appendMessageId(client, existing.id, input.messageId)).rows[0]) as PurchaseImport;
      }
      if (new Date(input.latestEventAt).getTime() < new Date(iso(existing.latest_event_at) as string).getTime()) {
        return purchaseFromRow((await this.appendMessageId(client, existing.id, input.messageId)).rows[0]) as PurchaseImport;
      }

      const deliveredAt = input.orderStatus === "delivered" ? input.deliveredAt ?? input.latestEventAt : null;
      // A "weak" match (fell back to order-id-only, see findExisting) means
      // this email's own product detail is less trustworthy than what's
      // already stored — e.g. a bare "order cancelled" notice — so only the
      // lifecycle/status columns are updated, not the product description.
      const result = strongMatch
        ? await client.query<PurchaseImportRow>(
            `UPDATE purchase_imports SET
               product_name = $2, brand = COALESCE($3, brand), product_image_url = COALESCE($4, product_image_url),
               size_label = COALESCE($5, size_label), color_label = COALESCE($6, color_label),
               currency = COALESCE($7, currency), price_amount = COALESCE($8, price_amount),
               order_status = $9, ordered_at = COALESCE(ordered_at, $10),
               delivered_at = COALESCE($11, delivered_at),
               latest_event_at = $12, email_subject = COALESCE($13, email_subject), latest_message_id = $14,
               source_message_ids = CASE WHEN $14 = ANY(source_message_ids) THEN source_message_ids ELSE array_append(source_message_ids, $14) END
             WHERE id = $1
             RETURNING *`,
            [
              existing.id, input.productName, input.brand, input.productImageUrl, input.sizeLabel, input.colorLabel,
              input.currency, input.priceAmount, input.orderStatus, input.orderedAt, deliveredAt, input.latestEventAt,
              input.emailSubject, input.messageId,
            ],
          )
        : await client.query<PurchaseImportRow>(
            `UPDATE purchase_imports SET
               order_status = $2, ordered_at = COALESCE(ordered_at, $3), delivered_at = COALESCE($4, delivered_at),
               latest_event_at = $5, email_subject = COALESCE($6, email_subject), latest_message_id = $7,
               source_message_ids = CASE WHEN $7 = ANY(source_message_ids) THEN source_message_ids ELSE array_append(source_message_ids, $7) END
             WHERE id = $1
             RETURNING *`,
            [existing.id, input.orderStatus, input.orderedAt, deliveredAt, input.latestEventAt, input.emailSubject, input.messageId],
          );
      return purchaseFromRow(result.rows[0]) as PurchaseImport;
    });
  }

  // See MemoryPurchaseImportsRepository.findExisting's comment: a later
  // shipped/cancelled/returned email for the same order often lacks the
  // product name/ASIN detail the original confirmation email had, so an
  // exact product_identity match ("strong") is preferred but falls back to
  // "the one other row already tracked for this order" ("weak") when
  // there's no ambiguity.
  private async findExisting(client: PoolClient, userId: string, input: RecordParsedOrderInput): Promise<{row: PurchaseImportRow; strongMatch: boolean} | undefined> {
    if (!input.orderId) {
      const result = await client.query<PurchaseImportRow>(
        "SELECT * FROM purchase_imports WHERE user_id = $1 AND marketplace = $2 AND order_id IS NULL AND product_identity = $3 FOR UPDATE",
        [userId, input.marketplace, input.productIdentity],
      );
      return result.rows[0] ? {row: result.rows[0], strongMatch: true} : undefined;
    }
    const sameOrder = await client.query<PurchaseImportRow>(
      "SELECT * FROM purchase_imports WHERE user_id = $1 AND marketplace = $2 AND order_id = $3 FOR UPDATE",
      [userId, input.marketplace, input.orderId],
    );
    if (sameOrder.rows.length === 0) return undefined;
    const strong = sameOrder.rows.find((row) => row.product_identity === input.productIdentity);
    if (strong) return {row: strong, strongMatch: true};
    return sameOrder.rows.length === 1 ? {row: sameOrder.rows[0] as PurchaseImportRow, strongMatch: false} : undefined;
  }

  private insert(client: PoolClient, userId: string, connectionId: string, input: RecordParsedOrderInput) {
    const deliveredAt = input.orderStatus === "delivered" ? input.deliveredAt ?? input.latestEventAt : null;
    return client.query<PurchaseImportRow>(
      `INSERT INTO purchase_imports
         (user_id, gmail_connection_id, marketplace, order_id, product_identity, product_name, brand, product_image_url,
          size_label, color_label, quantity, currency, price_amount, order_status, ordered_at, delivered_at,
          latest_event_at, review_status, email_subject, latest_message_id, source_message_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               $17, 'pending', $18, $19, ARRAY[$19]::text[])
       RETURNING *`,
      [
        userId, connectionId, input.marketplace, input.orderId, input.productIdentity, input.productName, input.brand,
        input.productImageUrl, input.sizeLabel, input.colorLabel, input.quantity ?? 1, input.currency, input.priceAmount,
        input.orderStatus, input.orderedAt, deliveredAt, input.latestEventAt, input.emailSubject, input.messageId,
      ],
    );
  }

  private appendMessageId(client: PoolClient, purchaseId: string, messageId: string) {
    return client.query<PurchaseImportRow>(
      `UPDATE purchase_imports
          SET source_message_ids = CASE WHEN $2 = ANY(source_message_ids) THEN source_message_ids ELSE array_append(source_message_ids, $2) END
        WHERE id = $1
        RETURNING *`,
      [purchaseId, messageId],
    );
  }

  async listPending(userId: string): Promise<PurchaseImport[]> {
    const result = await this.pool.query<PurchaseImportRow>(
      "SELECT * FROM purchase_imports WHERE user_id = $1 AND review_status = 'pending' AND order_status = 'delivered' ORDER BY delivered_at DESC NULLS LAST",
      [userId],
    );
    return result.rows.map((row) => purchaseFromRow(row) as PurchaseImport);
  }

  async getById(purchaseId: string): Promise<PurchaseImport | null> {
    const result = await this.pool.query<PurchaseImportRow>("SELECT * FROM purchase_imports WHERE id = $1", [purchaseId]);
    return purchaseFromRow(result.rows[0]);
  }

  async markImported(purchaseId: string, wardrobeItemId: string): Promise<PurchaseImport | null> {
    const result = await this.pool.query<PurchaseImportRow>(
      "UPDATE purchase_imports SET review_status = 'imported', imported_wardrobe_item_id = $2 WHERE id = $1 RETURNING *",
      [purchaseId, wardrobeItemId],
    );
    return purchaseFromRow(result.rows[0]);
  }

  async markIgnored(purchaseId: string): Promise<PurchaseImport | null> {
    const result = await this.pool.query<PurchaseImportRow>(
      "UPDATE purchase_imports SET review_status = 'ignored' WHERE id = $1 RETURNING *",
      [purchaseId],
    );
    return purchaseFromRow(result.rows[0]);
  }

  async isMessageProcessed(connectionId: string, messageId: string): Promise<boolean> {
    const result = await this.pool.query("SELECT 1 FROM gmail_processed_messages WHERE gmail_connection_id = $1 AND gmail_message_id = $2", [connectionId, messageId]);
    return (result.rowCount ?? 0) > 0;
  }

  async markMessageProcessed(connectionId: string, messageId: string, marketplace: string | null): Promise<void> {
    await this.pool.query(
      "INSERT INTO gmail_processed_messages (gmail_connection_id, gmail_message_id, marketplace) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [connectionId, messageId, marketplace],
    );
  }
}
