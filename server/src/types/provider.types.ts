import type {WardrobeDraftAnalysis} from "./wardrobe.types";
import type {ProfileAnalysisResult, FullLengthValidationResult} from "./profile.types";
import type {SuggestOutfitInput, OutfitSuggestion} from "./outfit.types";
import type {TryOnGenerateInput, TryOnGenerationResult} from "./tryon.types";

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
  processed?: boolean;
}

export interface StoredFileMetadata {
  storageProvider: string;
  storageKey: string;
  publicUrl?: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
}

export interface ReadableAsset {
  buffer: Buffer;
  mimetype: string;
}

export interface AssetStore {
  save(userId: string, file: UploadedFile, purpose?: string): Promise<StoredFileMetadata>;
  remove(storageKey: string): Promise<void>;
  signedUrl(storageKey: string | null | undefined): Promise<string>;
  readBytes(storageKey: string): Promise<ReadableAsset>;
}

export interface TextAnalysisProvider {
  analyzeWardrobe(file: UploadedFile): Promise<WardrobeDraftAnalysis>;
  validateFullLengthPhoto(file: UploadedFile): Promise<FullLengthValidationResult>;
  analyzeProfile(file: UploadedFile): Promise<ProfileAnalysisResult>;
  suggestOutfit(input: SuggestOutfitInput): Promise<OutfitSuggestion>;
}

export interface TryOnProvider {
  generate(input: TryOnGenerateInput): Promise<TryOnGenerationResult>;
}

export interface SmsSendResult {
  messageId: string | null;
}

export interface SmsProvider {
  name: string;
  exposeOtp: boolean;
  sendOtp(phoneNumber: string, otp: string): Promise<SmsSendResult>;
}
