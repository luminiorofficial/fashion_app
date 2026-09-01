export type AssetPurpose = "profile_analysis" | "wardrobe_item" | "tryon_result";

export interface MediaAsset {
  id: string;
  userId: string;
  purpose: AssetPurpose;
  storageProvider: string;
  storageKey: string;
  publicUrl: string | null;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  status: "ready" | "deleted";
  createdAt: string;
  deletedAt: string | null;
}

export interface CreateAssetInput {
  userId: string;
  purpose: AssetPurpose;
  storageProvider: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
}

export type AnalysisType = "style_profile" | "wardrobe_item";

export interface AnalysisJob<TResult = Record<string, unknown>> {
  id: string;
  userId: string;
  mediaAssetId: string;
  analysisType: AnalysisType;
  status: string;
  provider: string;
  model: string | null;
  result: TResult | null;
  completedAt: string | null;
  createdAt: string;
}

export interface CreateAnalysisJobInput<TResult = Record<string, unknown>> {
  userId: string;
  mediaAssetId: string;
  analysisType: AnalysisType;
  provider: string;
  model: string | null;
  result: TResult;
}
