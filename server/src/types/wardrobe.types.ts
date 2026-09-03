export type WardrobeCategory = "Top" | "Bottom" | "Outerwear" | "Dress" | "Shoes" | "Accessory";
export type GarmentVisibility = "full" | "partial" | "occluded";
export type WardrobeSourceType = "upload" | "product_link";
// Deliberately its own type rather than importing commerce.types.ts's
// Marketplace (even though the literal set matches today) — wardrobe stays
// decoupled from the commerce domain (see container.ts's comment on
// PurchaseImportService), and this column only ever records provenance,
// never drives commerce logic.
export type WardrobeSourceMarketplace = "amazon" | "flipkart" | "myntra" | "ajio" | "meesho" | "other";

export interface WardrobeItem {
  id: string;
  userId: string;
  name: string;
  category: string;
  sourceType: WardrobeSourceType;
  imageStorageKey: string | null;
  imageStorageProvider: string | null;
  productUrl: string | null;
  mediaAssetId: string | null;
  analysisJobId: string | null;
  tags: string[];
  primaryColor: string | null;
  secondaryColors: string[];
  material: string | null;
  pattern: string | null;
  season: string[];
  occasion: string[];
  styleTags: string[];
  containsPerson: boolean;
  garmentVisibility: GarmentVisibility;
  virtualTryOnEligible: boolean;
  // Which marketplace this item was imported from via a detected Gmail
  // purchase (see PurchaseImportService.addToWardrobe), or null for every
  // manually photographed/linked item.
  sourceMarketplace: WardrobeSourceMarketplace | null;
  // True until the user opens this item's detail view for the first time
  // (see WardrobeService.markWardrobeItemViewed) — drives the "NEW" badge
  // client-side. Always false when sourceMarketplace is null: a manually
  // added item was never "detected," so there's nothing to badge.
  isNew: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateWardrobeItemInput {
  sourceType: WardrobeSourceType;
  name: string;
  category: string;
  tags: string[];
  mediaAssetId: string | null;
  analysisJobId?: string | null;
  imageStorageKey: string | null;
  imageStorageProvider?: string | null;
  productUrl: string | null;
  primaryColor?: string | null;
  secondaryColors?: string[];
  material?: string | null;
  pattern?: string | null;
  season?: string[];
  occasion?: string[];
  styleTags?: string[];
  containsPerson: boolean;
  garmentVisibility: GarmentVisibility;
  virtualTryOnEligible: boolean;
  // Only ever set by WardrobeService.createWardrobeItem's trusted `options`
  // parameter (never from raw request-body input — see its call site) so a
  // client can never forge purchase provenance or the "NEW" badge for a
  // manually created item.
  sourceMarketplace?: WardrobeSourceMarketplace | null;
  isNew?: boolean;
}

export interface PublicWardrobeItem {
  id: string;
  name: string;
  category: string;
  sourceType: WardrobeSourceType;
  imageUrl: string;
  imageStorageProvider: string | null;
  productUrl: string | null;
  tags: string[];
  primaryColor: string | null;
  secondaryColors: string[];
  material: string | null;
  pattern: string | null;
  season: string[];
  occasion: string[];
  styleTags: string[];
  containsPerson: boolean;
  garmentVisibility: GarmentVisibility;
  virtualTryOnEligible: boolean;
  sourceMarketplace: WardrobeSourceMarketplace | null;
  isNew: boolean;
  createdAt: string;
}

export interface WardrobeDraftAnalysis {
  item_name: string;
  category: string;
  tags: string[];
  color: string | null;
  material: string | null;
  pattern: string | null;
  season: string[];
  occasion: string[];
  style: string[];
  contains_person: boolean;
  garment_visibility: GarmentVisibility;
  virtual_tryon_eligible: boolean;
}

export interface PublicWardrobeDraft {
  assetId: string;
  imageUrl: string;
  name: string;
  category: string;
  tags: string[];
  color: string | null;
  material: string | null;
  pattern: string | null;
  season: string[];
  occasion: string[];
  style: string[];
  containsPerson: boolean;
  garmentVisibility: GarmentVisibility;
  virtualTryOnEligible: boolean;
  analysisJobId: string;
}
