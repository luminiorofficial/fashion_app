import type {WardrobeDraftAnalysis} from "./wardrobe.types";
import type {ProfileAnalysisResult, FullLengthValidationResult} from "./profile.types";
import type {SuggestOutfitInput, OutfitSuggestion} from "./outfit.types";
import type {TryOnGenerateInput, TryOnGenerationResult} from "./tryon.types";
import type {WeatherSummary} from "./weather.types";

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

export interface WeatherProvider {
  getCurrentWeather(lat: number, lng: number): Promise<WeatherSummary>;
}

export interface SmsSendResult {
  messageId: string | null;
}

export interface SmsProvider {
  name: string;
  exposeOtp: boolean;
  sendOtp(phoneNumber: string, otp: string): Promise<SmsSendResult>;
}

export interface GoogleTokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  scope: string | null;
  tokenType: string;
}

export interface NormalizedGmailMessage {
  id: string;
  internalDate: string | null;
  from: string;
  subject: string;
  textBody: string;
  htmlBody: string;
}

// Thin, hand-rolled Google OAuth + Gmail REST client (no googleapis SDK —
// matches this codebase's fetch()-based provider style, see
// providers/gemini/text-analyzer.provider.ts and
// providers/weather/open-meteo.provider.ts). Injected via AppDependencies
// so commerce/gmail services never call Google directly and tests can
// supply a fake.
export interface GmailApiClient {
  buildAuthUrl(input: {state: string; redirectUri: string; scope: string}): string;
  exchangeCode(code: string, redirectUri: string): Promise<GoogleTokenResponse>;
  refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse>;
  revokeToken(token: string): Promise<void>;
  getUserEmail(accessToken: string): Promise<string>;
  listMessageIds(accessToken: string, query: string, pageToken?: string | null): Promise<{ids: string[]; nextPageToken: string | null}>;
  getMessage(accessToken: string, messageId: string): Promise<NormalizedGmailMessage>;
}
