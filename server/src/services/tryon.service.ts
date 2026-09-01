import {ApiError, assert} from "../utils/api-error";
import {cleanupOrphanedAsset} from "../utils/asset-cleanup";
import {processUploadedFile} from "../utils/image-processing";
import {MAX_FETCHED_ASSET_BYTES} from "../config/constants";
import {text} from "../validators/common.validators";
import {wardrobeItemIdList} from "../validators/wardrobe.validators";
import type {AppConfig} from "../config/env";
import type {WardrobeRepository, ProfilesRepository, AssetsRepository, TryOnRepository, OutfitsRepository} from "../types/repositories";
import type {AssetStore, TryOnProvider, ReadableAsset} from "../types/provider.types";
import type {TryOnRequest, PublicTryOn} from "../types/tryon.types";

export type TryOnServiceConfig = Pick<AppConfig, "env" | "geminiImageModel">;

function logDevelopment(config: TryOnServiceConfig, message: string): void {
  if (config.env === "development") console.info(`[NERA try-on] ${message}`);
}

async function readTryOnAsset(options: {config: TryOnServiceConfig; assetStore: AssetStore; storageKey: string; description: string; error: ApiError}): Promise<ReadableAsset> {
  const {config, assetStore, storageKey, description, error} = options;
  try {
    const file = await assetStore.readBytes(storageKey);
    logDevelopment(config, `asset fetch success: ${description}`);
    return file;
  } catch (cause) {
    const causeError = cause as {code?: string; name?: string};
    logDevelopment(config, `asset fetch failure: ${description} code=${causeError.code || causeError.name || "UNKNOWN"}`);
    throw error;
  }
}

async function toPublicTryOn(assetStore: AssetStore, tryOn: TryOnRequest, resultStorageKey: string | null | undefined, developmentFallback: boolean): Promise<PublicTryOn> {
  return {
    id: tryOn.id,
    outfitId: tryOn.outfitId || null,
    wardrobeItemIds: tryOn.wardrobeItemIds,
    imageUrl: await assetStore.signedUrl(resultStorageKey),
    status: tryOn.status,
    isSaved: tryOn.isSaved,
    developmentFallback: !!developmentFallback,
    createdAt: tryOn.createdAt,
  };
}

export class TryOnService {
  constructor(
    private readonly tryon: TryOnRepository,
    private readonly wardrobe: WardrobeRepository,
    private readonly profiles: ProfilesRepository,
    private readonly assets: AssetsRepository,
    private readonly outfits: OutfitsRepository,
    private readonly assetStore: AssetStore,
    private readonly tryonProvider: TryOnProvider,
    private readonly config: TryOnServiceConfig,
  ) {}

  async generate(userId: string, rawWardrobeItemIds: unknown, rawOutfitId: unknown): Promise<PublicTryOn> {
    const wardrobeItemIds = wardrobeItemIdList(rawWardrobeItemIds);
    logDevelopment(this.config, `try-on selected wardrobe IDs: ${wardrobeItemIds.join(", ")}`);
    const outfitId = rawOutfitId ? text(rawOutfitId, "outfitId", {max: 100}) : null;
    if (outfitId) {
      const outfit = await this.outfits.getOutfit(outfitId);
      assert(outfit && outfit.userId === userId, 404, "OUTFIT_NOT_FOUND", "The outfit was not found.");
    }

    const wardrobe = await this.wardrobe.listWardrobe(userId);
    const wardrobeById = new Map(wardrobe.map((item) => [item.id, item]));
    const garmentItems = wardrobeItemIds.map((itemId) => wardrobeById.get(itemId));
    assert(garmentItems.every(Boolean), 404, "WARDROBE_ITEM_NOT_FOUND", "One or more wardrobe items were not found.");
    for (const item of garmentItems) {
      const garment = item!;
      logDevelopment(this.config, `try-on wardrobe asset: id=${garment.id} provider=${garment.imageStorageProvider || "missing"}`);
      assert(garment.mediaAssetId && garment.imageStorageKey, 400, "WARDROBE_ITEM_HAS_NO_IMAGE", `Re-upload photo for ${garment.name} (${garment.id}) to use Virtual Try-On.`);
      assert(garment.imageStorageProvider === "cloudinary", 400, "WARDROBE_ASSET_UNAVAILABLE", `Re-upload photo for ${garment.name} (${garment.id}); its image is not available in Cloudinary.`);
      // Defense in depth: the client is expected to filter these out
      // already (see WardrobeItem.canUseVirtualTryOn), but the server
      // independently refuses to composite a photo that shows a person
      // wearing the item — there's no garment-isolation step, so that
      // photo can't be trusted as a clean product shot.
      assert(
        garment.virtualTryOnEligible !== false,
        400,
        "WARDROBE_ITEM_NOT_TRYON_ELIGIBLE",
        `${garment.name} shows a person wearing it, so it can't be used directly for Virtual Try-On. Add a product-only photo of this item to use it for Virtual Try-On.`,
      );
    }

    const profile = await this.profiles.getProfile(userId);
    assert(profile?.profileImageAssetId && profile.profileImageStorageKey, 400, "PROFILE_PHOTO_REQUIRED", "Analyze your style profile with a full-body photo before using virtual try-on.");
    logDevelopment(this.config, `try-on profile asset: id=${profile.profileImageAssetId} provider=${profile.profileImageStorageProvider || "missing"}`);
    assert(profile.profileImageStorageProvider === "cloudinary", 400, "PROFILE_ASSET_UNAVAILABLE", "Re-upload your full-body profile photo; it is not available in Cloudinary.");

    // Fetch the profile photo and every garment photo from Cloudinary
    // concurrently rather than one at a time, since they're independent
    // reads — this is the dominant latency cost before the Gemini call.
    const [profileFile, garmentFiles] = await Promise.all([
      readTryOnAsset({
        config: this.config,
        assetStore: this.assetStore,
        storageKey: profile.profileImageStorageKey as string,
        description: `profile id=${profile.profileImageAssetId}`,
        error: new ApiError(422, "PROFILE_ASSET_FETCH_FAILED", "Re-upload your full-body profile photo; the stored Cloudinary image could not be retrieved."),
      }),
      Promise.all(
        garmentItems.map((item) => {
          const garment = item!;
          return readTryOnAsset({
            config: this.config,
            assetStore: this.assetStore,
            storageKey: garment.imageStorageKey as string,
            description: `wardrobe id=${garment.id} name=${JSON.stringify(garment.name)}`,
            error: new ApiError(422, "WARDROBE_ASSET_FETCH_FAILED", `Re-upload photo for ${garment.name} (${garment.id}); the stored Cloudinary image could not be retrieved.`),
          });
        }),
      ),
    ]);
    for (const file of [profileFile, ...garmentFiles]) {
      assert(file.buffer.length <= MAX_FETCHED_ASSET_BYTES, 502, "ASSET_TOO_LARGE", "A stored image is too large to process.");
    }

    const generation = await this.tryonProvider.generate({
      profileFile,
      garmentFiles,
      notes: garmentItems.map((item) => `${item!.category}: ${item!.name}`).join("; "),
    });
    const processed = await processUploadedFile({buffer: generation.buffer, mimetype: generation.mimeType, originalname: "tryon-result.jpg", size: generation.buffer.length}, "tryon_result");
    const stored = await this.assetStore.save(userId, processed!, "tryon_result");
    let resultAsset: {id: string} | undefined;
    try {
      const createdAsset = await this.assets.createAsset({userId, purpose: "tryon_result", ...stored});
      resultAsset = createdAsset;
      const tryOn = await this.tryon.createTryOnRequest(userId, {
        outfitId,
        wardrobeItemIds,
        profileMediaAssetId: profile.profileImageAssetId as string,
        resultMediaAssetId: createdAsset.id,
        status: "completed",
        provider: generation.developmentFallback ? "development_fallback" : "gemini",
        model: generation.developmentFallback ? null : this.config.geminiImageModel,
        completedAt: new Date().toISOString(),
      });
      return toPublicTryOn(this.assetStore, tryOn, stored.storageKey, Boolean(generation.developmentFallback));
    } catch (error) {
      await cleanupOrphanedAsset(this.assetStore, this.assets, stored.storageKey, resultAsset);
      throw error;
    }
  }

  async saveTryOn(userId: string, tryOnId: string): Promise<PublicTryOn> {
    const tryOn = await this.tryon.getTryOnRequest(tryOnId);
    assert(tryOn && tryOn.userId === userId, 404, "TRYON_NOT_FOUND", "The try-on result was not found.");
    const saved = await this.tryon.markTryOnSaved(tryOn.id) as TryOnRequest;
    const resultAsset = saved.resultMediaAssetId ? await this.assets.getAsset(saved.resultMediaAssetId) : null;
    return toPublicTryOn(this.assetStore, saved, resultAsset?.storageKey || "", false);
  }

  async listSaved(userId: string): Promise<PublicTryOn[]> {
    const items = await this.tryon.listSavedTryOns(userId);
    return Promise.all(items.map((tryOn) => toPublicTryOn(this.assetStore, tryOn, tryOn.resultStorageKey || "", false)));
  }

  async unsaveTryOn(userId: string, tryOnId: string): Promise<PublicTryOn> {
    const tryOn = await this.tryon.getTryOnRequest(tryOnId);
    assert(tryOn && tryOn.userId === userId, 404, "TRYON_NOT_FOUND", "The try-on result was not found.");
    const unsaved = await this.tryon.unsaveTryOn(tryOn.id) as TryOnRequest;
    const resultAsset = unsaved.resultMediaAssetId ? await this.assets.getAsset(unsaved.resultMediaAssetId) : null;
    return toPublicTryOn(this.assetStore, unsaved, resultAsset?.storageKey || "", false);
  }
}
