import {MemoryStore, generateId} from "../../memory-store";
import type {PurchaseImportsRepository} from "../../../types/repositories";
import type {PurchaseImport, RecordParsedOrderInput} from "../../../types/commerce.types";

export class MemoryPurchaseImportsRepository implements PurchaseImportsRepository {
  constructor(private readonly store: MemoryStore) {}

  // Exact (marketplace, order_id, product_identity) match when order_id is
  // absent, or as the preferred ("strong") match within one order. But a
  // marketplace's shipped/cancelled/returned notification often repeats
  // the order id without repeating the product name/ASIN found in the
  // original confirmation email (see amazon-email.parser.ts's fallback
  // product-name extraction) — falling back to "the one other row already
  // tracked for this order" ("weak" match) when there's no ambiguity is
  // what lets that later, less detailed email update the same purchase's
  // status instead of spawning an untracked duplicate. A genuinely
  // ambiguous multi-item order (more than one existing row for the same
  // order id, none matching this email's product_identity) is deliberately
  // left alone here and recorded as a new row instead of guessing which
  // item it belongs to.
  private findExisting(userId: string, input: RecordParsedOrderInput): {purchase: PurchaseImport; strongMatch: boolean} | undefined {
    if (!input.orderId) {
      const purchase = [...this.store.purchaseImports.values()].find((candidate) =>
        candidate.userId === userId && candidate.marketplace === input.marketplace && candidate.orderId === null && candidate.productIdentity === input.productIdentity);
      return purchase ? {purchase, strongMatch: true} : undefined;
    }
    const sameOrder = [...this.store.purchaseImports.values()].filter((candidate) =>
      candidate.userId === userId && candidate.marketplace === input.marketplace && candidate.orderId === input.orderId);
    const strong = sameOrder.find((candidate) => candidate.productIdentity === input.productIdentity);
    if (strong) return {purchase: strong, strongMatch: true};
    return sameOrder.length === 1 ? {purchase: sameOrder[0] as PurchaseImport, strongMatch: false} : undefined;
  }

  // Upserts one row per distinct order/product identity, folding every
  // lifecycle email (confirmed -> shipped -> delivered -> cancelled/
  // returned) for the same order into that single row. See
  // types/commerce.types.ts's ReviewStatus doc for why "pending" plus the
  // current orderStatus is enough state — no separate "superseded" status
  // is needed.
  async upsertParsedOrder(userId: string, connectionId: string, input: RecordParsedOrderInput, {allowCreate}: {allowCreate: boolean}): Promise<PurchaseImport | null> {
    const now = new Date().toISOString();
    const match = this.findExisting(userId, input);
    if (!match) {
      if (!allowCreate) return null;
      const purchase: PurchaseImport = {
        id: generateId(),
        userId,
        gmailConnectionId: connectionId,
        marketplace: input.marketplace,
        orderId: input.orderId,
        productIdentity: input.productIdentity,
        productName: input.productName,
        brand: input.brand,
        productImageUrl: input.productImageUrl,
        sizeLabel: input.sizeLabel,
        colorLabel: input.colorLabel,
        quantity: input.quantity ?? 1,
        currency: input.currency,
        priceAmount: input.priceAmount,
        orderStatus: input.orderStatus,
        orderedAt: input.orderedAt,
        deliveredAt: input.orderStatus === "delivered" ? input.deliveredAt ?? input.latestEventAt : null,
        latestEventAt: input.latestEventAt,
        reviewStatus: "pending",
        importedWardrobeItemId: null,
        emailSubject: input.emailSubject,
        latestMessageId: input.messageId,
        sourceMessageIds: [input.messageId],
        createdAt: now,
        updatedAt: now,
      };
      this.store.purchaseImports.set(purchase.id, purchase);
      return purchase;
    }

    const {purchase: existing, strongMatch} = match;

    // Terminal states: a user's own decision is never reversed by a later
    // marketplace email.
    if (existing.reviewStatus === "imported" || existing.reviewStatus === "ignored") {
      if (!existing.sourceMessageIds.includes(input.messageId)) existing.sourceMessageIds.push(input.messageId);
      return existing;
    }

    // Out-of-order guard: Gmail list ordering isn't a chronological
    // guarantee, so an older event must never regress a newer one.
    if (input.latestEventAt < existing.latestEventAt) {
      if (!existing.sourceMessageIds.includes(input.messageId)) existing.sourceMessageIds.push(input.messageId);
      return existing;
    }

    Object.assign(existing, {
      // A "weak" match (fell back to order-id-only, see findExisting) means
      // this email's own product detail is less trustworthy than what's
      // already stored — e.g. a bare "order cancelled" notice — so only the
      // lifecycle/status fields are updated, not the product description.
      ...(strongMatch
        ? {
            productName: input.productName,
            brand: input.brand ?? existing.brand,
            productImageUrl: input.productImageUrl ?? existing.productImageUrl,
            sizeLabel: input.sizeLabel ?? existing.sizeLabel,
            colorLabel: input.colorLabel ?? existing.colorLabel,
            currency: input.currency ?? existing.currency,
            priceAmount: input.priceAmount ?? existing.priceAmount,
          }
        : {}),
      orderStatus: input.orderStatus,
      orderedAt: existing.orderedAt ?? input.orderedAt,
      deliveredAt: input.orderStatus === "delivered" ? input.deliveredAt ?? input.latestEventAt : existing.deliveredAt,
      latestEventAt: input.latestEventAt,
      emailSubject: input.emailSubject ?? existing.emailSubject,
      latestMessageId: input.messageId,
      updatedAt: now,
    });
    if (!existing.sourceMessageIds.includes(input.messageId)) existing.sourceMessageIds.push(input.messageId);
    return existing;
  }

  async listPending(userId: string): Promise<PurchaseImport[]> {
    return [...this.store.purchaseImports.values()]
      .filter((purchase) => purchase.userId === userId && purchase.reviewStatus === "pending" && purchase.orderStatus === "delivered")
      .sort((a, b) => (b.deliveredAt || "").localeCompare(a.deliveredAt || ""));
  }

  async getById(purchaseId: string): Promise<PurchaseImport | null> {
    return this.store.purchaseImports.get(purchaseId) ?? null;
  }

  async markImported(purchaseId: string, wardrobeItemId: string): Promise<PurchaseImport | null> {
    const purchase = this.store.purchaseImports.get(purchaseId);
    if (!purchase) return null;
    Object.assign(purchase, {reviewStatus: "imported", importedWardrobeItemId: wardrobeItemId, updatedAt: new Date().toISOString()});
    return purchase;
  }

  async markIgnored(purchaseId: string): Promise<PurchaseImport | null> {
    const purchase = this.store.purchaseImports.get(purchaseId);
    if (!purchase) return null;
    Object.assign(purchase, {reviewStatus: "ignored", updatedAt: new Date().toISOString()});
    return purchase;
  }

  async isMessageProcessed(connectionId: string, messageId: string): Promise<boolean> {
    return this.store.gmailProcessedMessages.has(`${connectionId}:${messageId}`);
  }

  async markMessageProcessed(connectionId: string, messageId: string): Promise<void> {
    this.store.gmailProcessedMessages.add(`${connectionId}:${messageId}`);
  }
}
