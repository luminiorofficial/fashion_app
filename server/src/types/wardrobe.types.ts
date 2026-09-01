export type WardrobeCategory = "Top" | "Bottom" | "Outerwear" | "Dress" | "Shoes" | "Accessory";
export type GarmentVisibility = "full" | "partial" | "occluded";
export type WardrobeSourceType = "upload" | "product_link";

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
