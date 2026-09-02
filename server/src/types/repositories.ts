import type {User, UserRegistrationInput} from "./user.types";
import type {OtpChallenge, CreateChallengeInput, Session} from "./auth.types";
import type {MediaAsset, CreateAssetInput, AnalysisJob, CreateAnalysisJobInput} from "./asset.types";
import type {StyleProfile, SaveProfileInput} from "./profile.types";
import type {WardrobeItem, CreateWardrobeItemInput} from "./wardrobe.types";
import type {Outfit, CreateOutfitInput, OutfitFeedback, UpsertOutfitFeedbackInput, WardrobeAffinity} from "./outfit.types";
import type {TryOnRequest, CreateTryOnRequestInput} from "./tryon.types";
import type {GmailConnection, CreateGmailConnectionInput, UpdateGmailConnectionInput, PurchaseImport, RecordParsedOrderInput} from "./commerce.types";

export interface UsersRepository {
  findUserByPhone(phoneNumber: string): Promise<User | null>;
  findOrCreateUser(registration: UserRegistrationInput): Promise<User>;
  findUserById(userId: string): Promise<User | null>;
  deleteAccount(userId: string): Promise<{storageKeys: string[]}>;
}

export type AiOperation = "profile_analysis" | "wardrobe_analysis" | "outfit_generation" | "virtual_tryon";

export interface SecurityRepository {
  consumeRateLimit(input: {bucketKey: string; limit: number; windowSeconds: number}): Promise<{allowed: boolean; remaining: number; resetAt: string}>;
  reserveAiUsage(input: {
    userId: string;
    operation: AiOperation;
    provider: string;
    model: string | null;
    requestKey: string | null;
    dailyLimit: number;
    monthlyLimit: number;
    concurrentLimit: number;
    reservationTimeoutMinutes: number;
  }): Promise<{id: string; reason?: "daily" | "monthly" | "concurrent" | "duplicate"}>;
  completeAiUsage(id: string, input: {success: boolean; durationMs: number; estimatedInputUnits?: number | null; estimatedOutputUnits?: number | null}): Promise<void>;
  pruneSecurityData(aiUsageBeforeIso: string): Promise<{rateLimitBuckets: number; aiUsageEvents: number}>;
}

export interface OtpRepository {
  createChallenge(input: CreateChallengeInput): Promise<OtpChallenge>;
  countRecentChallenges(phoneNumber: string, sinceIso: string): Promise<number>;
  getChallenge(challengeId: string): Promise<OtpChallenge | null>;
  recordChallengeAttempt(challengeId: string, expectedAttempts: number, changes: {consumedAt?: string | null}): Promise<OtpChallenge | null>;
  markChallengeDelivered(challengeId: string, delivery: {providerMessageId: string | null; submittedAt: string}): Promise<OtpChallenge | null>;
  deleteExpiredOtpChallenges(beforeIso: string): Promise<number>;
}

export interface SessionsRepository {
  createSession(input: {userId: string; tokenHash: string; expiresAt: string}): Promise<Session>;
  findSession(tokenHash: string): Promise<Session | null>;
  revokeSession(tokenHash: string): Promise<void>;
  deleteOldSessions(beforeIso: string): Promise<number>;
}

export interface AssetsRepository {
  createAsset(input: CreateAssetInput): Promise<MediaAsset>;
  getAsset(assetId: string): Promise<MediaAsset | null>;
  archiveAsset(assetId: string): Promise<void>;
  createAnalysisJob(input: CreateAnalysisJobInput): Promise<AnalysisJob>;
  getAnalysisJob(jobId: string): Promise<AnalysisJob | null>;
  pruneAnalysisJobResult(jobId: string): Promise<void>;
  deleteOrphanedAnalysisJobs(beforeIso: string): Promise<number>;
  listPurgeableMediaAssets(beforeIso: string): Promise<MediaAsset[]>;
  archiveOrphanedMediaAssets(beforeIso: string): Promise<number>;
  deleteMediaAssetRow(assetId: string): Promise<void>;
}

export interface ProfilesRepository {
  saveProfile(userId: string, profile: SaveProfileInput): Promise<StyleProfile>;
  getProfile(userId: string): Promise<StyleProfile>;
}

export interface WardrobeRepository {
  listWardrobe(userId: string): Promise<WardrobeItem[]>;
  createWardrobeItem(userId: string, item: CreateWardrobeItemInput): Promise<WardrobeItem>;
  createWardrobeItemsBatch(userId: string, items: CreateWardrobeItemInput[]): Promise<WardrobeItem[]>;
  getWardrobeItem(itemId: string): Promise<WardrobeItem | null>;
  deleteWardrobeItem(itemId: string, mediaAssetId: string | null): Promise<void>;
}

export interface OutfitsRepository {
  createOutfit(userId: string, input: CreateOutfitInput): Promise<Outfit>;
  getOutfit(outfitId: string): Promise<Outfit | null>;
  listOutfits(userId: string, options?: {limit?: number}): Promise<Outfit[]>;
  upsertOutfitFeedback(userId: string, outfitId: string, input: UpsertOutfitFeedbackInput): Promise<OutfitFeedback>;
  getWardrobeAffinity(userId: string): Promise<WardrobeAffinity>;
}

export interface TryOnRepository {
  createTryOnRequest(userId: string, input: CreateTryOnRequestInput): Promise<TryOnRequest>;
  getTryOnRequest(tryOnId: string): Promise<TryOnRequest | null>;
  markTryOnSaved(tryOnId: string): Promise<TryOnRequest | null>;
  listSavedTryOns(userId: string): Promise<TryOnRequest[]>;
  unsaveTryOn(tryOnId: string): Promise<TryOnRequest | null>;
  listExpiredUnsavedTryOns(beforeIso: string): Promise<TryOnRequest[]>;
  deleteTryOnRequest(tryOnId: string): Promise<void>;
}

export interface GmailRepository {
  getConnectionByUserId(userId: string): Promise<GmailConnection | null>;
  getConnectionById(connectionId: string): Promise<GmailConnection | null>;
  upsertConnection(userId: string, input: CreateGmailConnectionInput): Promise<GmailConnection>;
  updateConnection(connectionId: string, input: UpdateGmailConnectionInput): Promise<GmailConnection | null>;
  disconnectConnection(connectionId: string): Promise<void>;
}

export interface PurchaseImportsRepository {
  // `allowCreate` gates only the creation of a brand-new row (the caller's
  // fashion-keyword filter — see PurchaseImportService.recordParsedOrder):
  // an update to an existing row always proceeds regardless, since a later
  // lifecycle email (e.g. a bare "order cancelled" notice) often carries
  // far less product detail than the original email that earned the row's
  // place, and must still be able to update its status. Returns null only
  // when no existing row matched and allowCreate was false.
  upsertParsedOrder(userId: string, connectionId: string, input: RecordParsedOrderInput, options: {allowCreate: boolean}): Promise<PurchaseImport | null>;
  listPending(userId: string): Promise<PurchaseImport[]>;
  getById(purchaseId: string): Promise<PurchaseImport | null>;
  markImported(purchaseId: string, wardrobeItemId: string): Promise<PurchaseImport | null>;
  markIgnored(purchaseId: string): Promise<PurchaseImport | null>;
  isMessageProcessed(connectionId: string, messageId: string): Promise<boolean>;
  markMessageProcessed(connectionId: string, messageId: string, marketplace: string | null): Promise<void>;
}

export interface DatabaseHealth {
  status: string;
  adapter: string;
  database?: string;
  latencyMs?: number;
}

export interface Repositories {
  users: UsersRepository;
  sessions: SessionsRepository;
  otp: OtpRepository;
  assets: AssetsRepository;
  profiles: ProfilesRepository;
  wardrobe: WardrobeRepository;
  outfits: OutfitsRepository;
  tryon: TryOnRepository;
  security: SecurityRepository;
  gmail: GmailRepository;
  purchaseImports: PurchaseImportsRepository;
  health(): Promise<DatabaseHealth>;
  close(): Promise<void>;
}
