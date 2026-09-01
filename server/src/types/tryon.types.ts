export interface TryOnRequest {
  id: string;
  userId: string;
  outfitId: string | null;
  wardrobeItemIds: string[];
  profileMediaAssetId: string;
  resultMediaAssetId: string | null;
  resultStorageKey?: string | null;
  status: "completed" | "failed" | "pending";
  provider: string | null;
  model: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  isSaved: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface CreateTryOnRequestInput {
  outfitId: string | null;
  wardrobeItemIds: string[];
  profileMediaAssetId: string;
  resultMediaAssetId: string;
  status: "completed";
  provider: string;
  model: string | null;
  completedAt: string;
}

export interface PublicTryOn {
  id: string;
  outfitId: string | null;
  wardrobeItemIds: string[];
  imageUrl: string;
  status: string;
  isSaved: boolean;
  developmentFallback: boolean;
  createdAt: string;
}

export interface TryOnGenerationResult {
  buffer: Buffer;
  mimeType: string;
  developmentFallback?: boolean;
}

export interface TryOnGenerateInput {
  profileFile: {buffer: Buffer; mimetype: string};
  garmentFiles: {buffer: Buffer; mimetype: string}[];
  notes: string;
}
