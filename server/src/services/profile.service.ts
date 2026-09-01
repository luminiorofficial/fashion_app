import {assert} from "../utils/api-error";
import {cleanupOrphanedAsset} from "../utils/asset-cleanup";
import {processUploadedFile, normalizeUploadedFile} from "../utils/image-processing";
import type {AppConfig} from "../config/env";
import type {AssetsRepository, ProfilesRepository} from "../types/repositories";
import type {AssetStore, TextAnalysisProvider, UploadedFile} from "../types/provider.types";
import type {StyleProfile, PublicProfile} from "../types/profile.types";

export type ProfileServiceConfig = Pick<AppConfig, "geminiTextApiKey" | "geminiModel">;

export interface AnalyzeProfileResult {
  profile: PublicProfile;
}

export async function toPublicProfile(assetStore: AssetStore, profile: StyleProfile): Promise<PublicProfile> {
  return {
    bodyType: profile.bodyType,
    skinTone: profile.skinTone,
    skinUndertone: profile.skinUndertone,
    hairColor: profile.hairColor,
    facialStructure: profile.facialStructure,
    styleAttributes: profile.styleAttributes || [],
    stylingNotes: profile.stylingNotes,
    profileImageUrl: await assetStore.signedUrl(profile.profileImageStorageKey),
    updatedAt: profile.updatedAt,
  };
}

export class ProfileService {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly assets: AssetsRepository,
    private readonly assetStore: AssetStore,
    private readonly analyzer: TextAnalysisProvider,
    private readonly config: ProfileServiceConfig,
  ) {}

  async getProfile(userId: string): Promise<PublicProfile> {
    return toPublicProfile(this.assetStore, await this.profiles.getProfile(userId));
  }

  async analyzeProfile(userId: string, uploadedFile: Express.Multer.File | undefined): Promise<AnalyzeProfileResult> {
    const file = await processUploadedFile(normalizeUploadedFile(uploadedFile as UploadedFile | undefined), "profile_analysis");
    assert(file, 400, "IMAGE_REQUIRED", "A full-body image is required.");

    const stored = await this.assetStore.save(userId, file, "profile_analysis");
    let asset: {id: string} | undefined;
    try {
      const createdAsset = await this.assets.createAsset({userId, purpose: "profile_analysis", ...stored});
      asset = createdAsset;
      const result = await this.analyzer.analyzeProfile(file);
      const job = await this.assets.createAnalysisJob({
        userId,
        mediaAssetId: createdAsset.id,
        analysisType: "style_profile",
        provider: this.config.geminiTextApiKey ? "gemini" : "development_fallback",
        model: this.config.geminiModel,
        result: result as unknown as Record<string, unknown>,
      });
      const previousProfile = await this.profiles.getProfile(userId);
      const profile = await this.profiles.saveProfile(userId, {
        bodyType: result.body_shape,
        skinTone: result.skin_tone,
        skinUndertone: result.skin_undertone,
        hairColor: result.hair_color,
        facialStructure: result.facial_structure,
        styleAttributes: result.style_attributes || [],
        stylingNotes: result.styling_notes,
        profileImageAssetId: createdAsset.id,
        profileImageStorageKey: createdAsset.storageKey,
        profileImageStorageProvider: createdAsset.storageProvider,
        latestAnalysisJobId: job.id,
      });
      if (previousProfile?.profileImageAssetId && previousProfile.profileImageAssetId !== createdAsset.id) {
        await cleanupOrphanedAsset(this.assetStore, this.assets, previousProfile.profileImageStorageKey, {id: previousProfile.profileImageAssetId});
      }
      // The full analysis JSON is only ever needed once, right here, to
      // build the profile above — prune it so analysis_jobs doesn't keep a
      // permanent duplicate of data already normalized into
      // user_style_profiles. Best-effort: a failure here shouldn't turn an
      // otherwise-successful profile save into an error response.
      await this.assets.pruneAnalysisJobResult(job.id).catch(() => {});
      return {profile: await toPublicProfile(this.assetStore, profile)};
    } catch (error) {
      await cleanupOrphanedAsset(this.assetStore, this.assets, stored.storageKey, asset);
      throw error;
    }
  }
}
