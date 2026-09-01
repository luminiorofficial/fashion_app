import type {User, UserRegistrationInput} from "./user.types";
import type {OtpChallenge, CreateChallengeInput, Session} from "./auth.types";
import type {MediaAsset, CreateAssetInput, AnalysisJob, CreateAnalysisJobInput} from "./asset.types";
import type {StyleProfile, SaveProfileInput} from "./profile.types";
import type {WardrobeItem, CreateWardrobeItemInput} from "./wardrobe.types";
import type {Outfit, CreateOutfitInput, OutfitFeedback, UpsertOutfitFeedbackInput, WardrobeAffinity} from "./outfit.types";
import type {TryOnRequest, CreateTryOnRequestInput} from "./tryon.types";

export interface UsersRepository {
  findUserByPhone(phoneNumber: string): Promise<User | null>;
  findOrCreateUser(registration: UserRegistrationInput): Promise<User>;
  findUserById(userId: string): Promise<User | null>;
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
  health(): Promise<DatabaseHealth>;
  close(): Promise<void>;
}
