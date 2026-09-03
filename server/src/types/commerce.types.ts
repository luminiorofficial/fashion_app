// "other" is the generic-fallback parser's marketplace (see
// commerce/parsers/generic-email.parser.ts): any allow-listed fashion
// retailer domain that doesn't have its own structured parser. The
// remaining values are reserved for future marketplace-specific parsers
// (only "amazon" is implemented today).
export type Marketplace = "amazon" | "flipkart" | "myntra" | "ajio" | "meesho" | "other";
export type OrderStatus = "confirmed" | "shipped" | "delivered" | "cancelled" | "returned";
export type GmailConnectionStatus = "connected" | "disconnected" | "error";
export type GmailSyncStatus = "idle" | "syncing" | "completed" | "failed";
// "pending" means only "no user decision yet" — visibility in the Purchases
// UI additionally requires orderStatus === 'delivered' (see
// PurchaseImportsRepository.listPending), so a later cancelled/returned
// email naturally drops a row out of view without needing a distinct
// "superseded" state. "imported"/"ignored" are terminal: once set, a later
// lifecycle email for the same order never changes reviewStatus or the
// order's stored fields again.
export type ReviewStatus = "pending" | "imported" | "ignored";

export interface GmailConnection {
  id: string;
  userId: string;
  googleEmail: string;
  googleAccountId: string | null;
  accessTokenCiphertext: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenCiphertext: string | null;
  scope: string | null;
  status: GmailConnectionStatus;
  lastSyncStatus: GmailSyncStatus;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  initialSyncCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  disconnectedAt: string | null;
}

export interface CreateGmailConnectionInput {
  googleEmail: string;
  googleAccountId: string | null;
  accessTokenCiphertext: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenCiphertext: string;
  scope: string | null;
}

export interface UpdateGmailConnectionInput {
  accessTokenCiphertext?: string | null;
  accessTokenExpiresAt?: string | null;
  refreshTokenCiphertext?: string;
  status?: GmailConnectionStatus;
  lastSyncStatus?: GmailSyncStatus;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
  initialSyncCompletedAt?: string | null;
}

export interface PurchaseImport {
  id: string;
  userId: string;
  gmailConnectionId: string;
  marketplace: Marketplace;
  orderId: string | null;
  productIdentity: string;
  productName: string;
  brand: string | null;
  productImageUrl: string | null;
  sizeLabel: string | null;
  colorLabel: string | null;
  quantity: number;
  currency: string | null;
  priceAmount: number | null;
  orderStatus: OrderStatus;
  orderedAt: string | null;
  deliveredAt: string | null;
  latestEventAt: string;
  reviewStatus: ReviewStatus;
  importedWardrobeItemId: string | null;
  emailSubject: string | null;
  latestMessageId: string | null;
  sourceMessageIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RecordParsedOrderInput {
  marketplace: Marketplace;
  orderId: string | null;
  productIdentity: string;
  productName: string;
  brand: string | null;
  productImageUrl: string | null;
  sizeLabel: string | null;
  colorLabel: string | null;
  quantity: number | null;
  currency: string | null;
  priceAmount: number | null;
  orderStatus: OrderStatus;
  orderedAt: string | null;
  deliveredAt: string | null;
  latestEventAt: string;
  emailSubject: string | null;
  messageId: string;
}

export interface PublicGmailConnectionStatus {
  connected: boolean;
  email: string | null;
  lastSyncedAt: string | null;
  syncStatus: GmailSyncStatus | null;
  syncError: string | null;
}

export interface PublicPurchaseCandidate {
  id: string;
  marketplace: Marketplace;
  productName: string;
  brand: string | null;
  imageUrl: string | null;
  sizeLabel: string | null;
  colorLabel: string | null;
  deliveredAt: string | null;
}

export function toPublicGmailConnectionStatus(connection: GmailConnection | null): PublicGmailConnectionStatus {
  if (!connection || connection.status !== "connected") {
    return {connected: false, email: connection?.googleEmail ?? null, lastSyncedAt: null, syncStatus: null, syncError: connection?.lastSyncError ?? null};
  }
  return {
    connected: true,
    email: connection.googleEmail,
    lastSyncedAt: connection.lastSyncedAt,
    syncStatus: connection.lastSyncStatus,
    syncError: connection.lastSyncError,
  };
}

export function toPublicPurchaseCandidate(purchase: PurchaseImport): PublicPurchaseCandidate {
  return {
    id: purchase.id,
    marketplace: purchase.marketplace,
    productName: purchase.productName,
    brand: purchase.brand,
    imageUrl: purchase.productImageUrl,
    sizeLabel: purchase.sizeLabel,
    colorLabel: purchase.colorLabel,
    deliveredAt: purchase.deliveredAt,
  };
}
