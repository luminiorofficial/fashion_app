import {ApiError, assert} from "../utils/api-error";
import {resolveEventDate} from "./gmail/parsing-utils";
import {MAX_FETCHED_ASSET_BYTES} from "../config/constants";
import {toPublicPurchaseCandidate} from "../types/commerce.types";
import type {WardrobeService} from "../services/wardrobe.service";
import type {PurchaseImportsRepository} from "../types/repositories";
import type {PublicPurchaseCandidate} from "../types/commerce.types";
import type {PublicWardrobeItem} from "../types/wardrobe.types";
import type {NormalizedGmailMessage} from "../types/provider.types";
import type {ParsedOrderEmail} from "./commerce.types";

// Conservative allow-list: a product name must contain a recognizable
// fashion term to ever become a purchase candidate. Anything not
// explicitly recognized is excluded by default (requirement: filter out
// obvious non-fashion purchases) rather than guessed at.
const FASHION_KEYWORDS = [
  "shirt", "t-shirt", "tshirt", "top", "blouse", "kurta", "kurti", "saree", "sari", "lehenga", "dress", "gown",
  "jean", "jeans", "trouser", "pant", "legging", "jogger", "short", "skirt", "jacket", "coat", "blazer", "sweater",
  "sweatshirt", "hoodie", "cardigan", "suit", "sherwani", "salwar", "dupatta", "nightwear", "pyjama", "pajama",
  "innerwear", "bra", "brief", "boxer", "lingerie", "sock", "stocking", "shoe", "sneaker", "sandal", "heel",
  "boot", "flip-flop", "flipflop", "slipper", "footwear", "handbag", "backpack", "wallet", "belt", "watch",
  "sunglass", "jewellery", "jewelry", "necklace", "earring", "bracelet", "scarf", "stole", "cap", "beanie",
  "muffler", "glove", "tie", "clothing", "apparel", "garment",
];
const NON_FASHION_KEYWORDS = [
  "mobile", "smartphone", "laptop", "charger", "cable", "earphone", "earbud", "headphone", "speaker", "battery",
  "kitchen", "cookware", "grocery", "novel", "kindle", "toy", "furniture", "mattress", "utensil", "television",
  "monitor", "keyboard", "mouse", "printer", "router", "camera", "tablet", "cooler", "refrigerator",
  "washing machine", "vacuum", "medicine", "supplement", "fertilizer", "pesticide", "hardware", "stationery",
];

export function isLikelyFashion(productName: string): boolean {
  const text = productName.toLowerCase();
  if (NON_FASHION_KEYWORDS.some((keyword) => text.includes(keyword))) return false;
  return FASHION_KEYWORDS.some((keyword) => text.includes(keyword));
}

export class PurchaseImportService {
  constructor(
    private readonly purchaseImports: PurchaseImportsRepository,
    private readonly wardrobeService: WardrobeService,
  ) {}

  // Called once per parsed order-lifecycle email during a sync. The
  // fashion-keyword filter (data minimization + "filter out obvious
  // non-fashion purchases") only gates whether a brand-new order/product is
  // ever START tracked — an update to an order already being tracked
  // always proceeds, since a later lifecycle email (e.g. a bare "order
  // cancelled" notice) often carries far less product-name detail than the
  // email that first earned the row's place and must still be able to
  // update its status. See PurchaseImportsRepository.upsertParsedOrder.
  async recordParsedOrder(userId: string, connectionId: string, message: NormalizedGmailMessage, parsed: ParsedOrderEmail): Promise<void> {
    await this.purchaseImports.upsertParsedOrder(userId, connectionId, {
      marketplace: parsed.marketplace,
      orderId: parsed.orderId,
      productIdentity: parsed.productIdentity,
      productName: parsed.productName,
      brand: parsed.brand,
      productImageUrl: parsed.imageUrl,
      sizeLabel: parsed.sizeLabel,
      colorLabel: parsed.colorLabel,
      quantity: parsed.quantity,
      currency: parsed.currency,
      priceAmount: parsed.priceAmount,
      orderStatus: parsed.orderStatus,
      orderedAt: parsed.orderedAt,
      deliveredAt: parsed.deliveredAt,
      latestEventAt: resolveEventDate(message),
      emailSubject: message.subject ? message.subject.slice(0, 500) : null,
      messageId: message.id,
    }, {allowCreate: isLikelyFashion(parsed.productName)});
  }

  async listPendingPurchases(userId: string): Promise<PublicPurchaseCandidate[]> {
    const purchases = await this.purchaseImports.listPending(userId);
    return purchases.map(toPublicPurchaseCandidate);
  }

  // Reuses the exact wardrobe upload pipeline (WardrobeService.analyzeDraft
  // + createWardrobeItem) so the resulting item gets the same AI-derived
  // category/color/material/pattern/season/occasion/style/try-on
  // eligibility as a manually photographed item — WardrobeService itself is
  // never modified for this. Only the display name comes from the
  // marketplace email, since it's more precise than a generic AI guess.
  async addToWardrobe(userId: string, purchaseId: string): Promise<PublicWardrobeItem> {
    const purchase = await this.purchaseImports.getById(purchaseId);
    assert(purchase && purchase.userId === userId, 404, "PURCHASE_NOT_FOUND", "The purchase was not found.");
    assert(purchase.reviewStatus === "pending" && purchase.orderStatus === "delivered", 409, "PURCHASE_NOT_ACTIONABLE", "This purchase has already been handled.");
    assert(purchase.productImageUrl, 422, "PURCHASE_IMAGE_UNAVAILABLE", "No product photo was found for this purchase. Add it to your wardrobe manually instead.");

    const image = await this.downloadImage(purchase.productImageUrl);
    const uploadedFile = {buffer: image.buffer, mimetype: image.mimetype, originalname: `${purchase.marketplace}-purchase.jpg`, size: image.buffer.length};
    const draft = await this.wardrobeService.analyzeDraft(userId, uploadedFile as unknown as Express.Multer.File);
    const item = await this.wardrobeService.createWardrobeItem(
      userId,
      {
        assetId: draft.assetId,
        analysisJobId: draft.analysisJobId,
        name: purchase.productName,
        category: draft.category,
        tags: draft.tags,
      },
      // Records provenance and (via WardrobeService.createWardrobeItem's
      // derivation) puts a "NEW" badge on the item until the user opens it.
      {sourceMarketplace: purchase.marketplace},
    );
    await this.purchaseImports.markImported(purchase.id, item.id);
    return item;
  }

  async ignore(userId: string, purchaseId: string): Promise<void> {
    const purchase = await this.purchaseImports.getById(purchaseId);
    assert(purchase && purchase.userId === userId, 404, "PURCHASE_NOT_FOUND", "The purchase was not found.");
    assert(purchase.reviewStatus === "pending", 409, "PURCHASE_NOT_ACTIONABLE", "This purchase has already been handled.");
    await this.purchaseImports.markIgnored(purchase.id);
  }

  private async downloadImage(url: string): Promise<{buffer: Buffer; mimetype: string}> {
    let response: Response;
    try {
      response = await fetch(url, {signal: AbortSignal.timeout(10_000)});
    } catch {
      throw new ApiError(502, "PURCHASE_IMAGE_DOWNLOAD_FAILED", "Could not download the product photo. Add it to your wardrobe manually instead.");
    }
    assert(response.ok, 502, "PURCHASE_IMAGE_DOWNLOAD_FAILED", "Could not download the product photo. Add it to your wardrobe manually instead.");
    const declaredLength = Number(response.headers.get("content-length") || "0");
    assert(!declaredLength || declaredLength <= MAX_FETCHED_ASSET_BYTES, 413, "PURCHASE_IMAGE_TOO_LARGE", "The product photo is too large.");
    const arrayBuffer = await response.arrayBuffer();
    assert(arrayBuffer.byteLength <= MAX_FETCHED_ASSET_BYTES, 413, "PURCHASE_IMAGE_TOO_LARGE", "The product photo is too large.");
    const mimetype = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    return {buffer: Buffer.from(arrayBuffer), mimetype};
  }
}
