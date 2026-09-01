import {assert} from "../utils/api-error";
import {cleanupOrphanedAsset} from "../utils/asset-cleanup";
import {processUploadedFile, normalizeUploadedFile} from "../utils/image-processing";
import {resolveVirtualTryOnEligibility} from "../utils/wardrobe-eligibility";
import {garmentVisibilityLevels} from "../config/constants";
import {text} from "../validators/common.validators";
import {wardrobeCategory, productUrl} from "../validators/wardrobe.validators";
import type {AppConfig} from "../config/env";
import type {AssetsRepository, WardrobeRepository} from "../types/repositories";
import type {AssetStore, TextAnalysisProvider, UploadedFile} from "../types/provider.types";
import type {WardrobeItem, PublicWardrobeItem, PublicWardrobeDraft, GarmentVisibility, CreateWardrobeItemInput} from "../types/wardrobe.types";
import {safeOperationalError} from "../utils/safe-logging";

export type WardrobeServiceConfig = Pick<AppConfig, "geminiTextApiKey" | "geminiModel">;

export interface WardrobeItemDraftPayload {
  assetId: unknown;
  analysisJobId: unknown;
  name: unknown;
  category: unknown;
  tags?: unknown;
}

export interface WardrobeLinkPayload {
  name: unknown;
  category: unknown;
  productUrl: unknown;
  tags?: unknown;
}

export const cleanTags = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12)
    : [];

const cleanStringArray = (value: unknown, max = 6): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean))].slice(0, max)
    : [];

const sanitizeGarmentVisibility = (value: unknown): GarmentVisibility =>
  garmentVisibilityLevels.includes(value as GarmentVisibility) ? (value as GarmentVisibility) : "full";

export async function toPublicWardrobeItem(assetStore: AssetStore, item: WardrobeItem): Promise<PublicWardrobeItem> {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    sourceType: item.sourceType,
    imageUrl: await assetStore.signedUrl(item.imageStorageKey),
    imageStorageProvider: item.imageStorageProvider || null,
    productUrl: item.productUrl,
    tags: item.tags,
    primaryColor: item.primaryColor || null,
    secondaryColors: item.secondaryColors || [],
    material: item.material || null,
    pattern: item.pattern || null,
    season: item.season || [],
    occasion: item.occasion || [],
    styleTags: item.styleTags || [],
    containsPerson: !!item.containsPerson,
    garmentVisibility: sanitizeGarmentVisibility(item.garmentVisibility),
    virtualTryOnEligible: item.virtualTryOnEligible !== false,
    createdAt: item.createdAt,
  };
}

interface ResolvedDraft {
  analysisJobId: string;
  payload: CreateWardrobeItemInput;
}

export class WardrobeService {
  constructor(
    private readonly wardrobe: WardrobeRepository,
    private readonly assets: AssetsRepository,
    private readonly assetStore: AssetStore,
    private readonly analyzer: TextAnalysisProvider,
    private readonly config: WardrobeServiceConfig,
  ) {}

  async listWardrobe(userId: string): Promise<PublicWardrobeItem[]> {
    const items = await this.wardrobe.listWardrobe(userId);
    return Promise.all(items.map((item) => toPublicWardrobeItem(this.assetStore, item)));
  }

  async analyzeDraft(userId: string, uploadedFile: Express.Multer.File | undefined): Promise<PublicWardrobeDraft> {
    const file = await processUploadedFile(normalizeUploadedFile(uploadedFile as UploadedFile | undefined), "wardrobe_item");
    assert(file, 400, "IMAGE_REQUIRED", "A clothing or accessory image is required.");

    const stored = await this.assetStore.save(userId, file, "wardrobe_item");
    let asset: {id: string} | undefined;
    try {
      const createdAsset = await this.assets.createAsset({userId, purpose: "wardrobe_item", ...stored});
      asset = createdAsset;
      const result = await this.analyzer.analyzeWardrobe(file);
      const job = await this.assets.createAnalysisJob({
        userId,
        mediaAssetId: createdAsset.id,
        analysisType: "wardrobe_item",
        provider: this.config.geminiTextApiKey ? "gemini" : "development_fallback",
        model: this.config.geminiModel,
        result: result as unknown as Record<string, unknown>,
      });
      return {
        assetId: createdAsset.id,
        imageUrl: await this.assetStore.signedUrl(createdAsset.storageKey),
        name: result.item_name,
        category: result.category,
        tags: result.tags,
        color: result.color ?? null,
        material: result.material ?? null,
        pattern: result.pattern ?? null,
        season: result.season || [],
        occasion: result.occasion || [],
        style: result.style || [],
        containsPerson: !!result.contains_person,
        garmentVisibility: sanitizeGarmentVisibility(result.garment_visibility),
        virtualTryOnEligible: resolveVirtualTryOnEligibility(result),
        analysisJobId: job.id,
      };
    } catch (error) {
      await cleanupOrphanedAsset(this.assetStore, this.assets, stored.storageKey, asset);
      throw error;
    }
  }

  async discardDraft(userId: string, assetId: string): Promise<void> {
    const asset = await this.assets.getAsset(assetId);
    assert(asset && asset.userId === userId, 404, "ASSET_NOT_FOUND", "The wardrobe draft was not found.");
    const inUse = (await this.wardrobe.listWardrobe(userId)).some((item) => item.mediaAssetId === asset.id);
    assert(!inUse, 409, "ASSET_IN_USE", "The image already belongs to a wardrobe item.");
    await this.assetStore.remove(asset.storageKey);
    await this.assets.archiveAsset(asset.id);
  }

  async createWardrobeItem(userId: string, raw: WardrobeItemDraftPayload): Promise<PublicWardrobeItem> {
    const inUseAssetIds = new Set((await this.wardrobe.listWardrobe(userId)).map((item) => item.mediaAssetId));
    const resolved = await this.resolveWardrobeDraft(userId, raw, inUseAssetIds);
    const item = await this.wardrobe.createWardrobeItem(userId, resolved.payload);
    // See the matching comment in analyzeDraft/createWardrobeItemsBatch: the
    // full analysis JSON is redundant the moment it's normalized into
    // wardrobe_items columns.
    await this.assets.pruneAnalysisJobResult(resolved.analysisJobId).catch(() => {});
    return toPublicWardrobeItem(this.assetStore, item);
  }

  async createWardrobeItemsBatch(userId: string, rawItems: WardrobeItemDraftPayload[]): Promise<PublicWardrobeItem[]> {
    assert(rawItems.length > 0 && rawItems.length <= 20, 400, "INVALID_BATCH", "Provide 1 to 20 wardrobe items.");
    const inUseAssetIds = new Set((await this.wardrobe.listWardrobe(userId)).map((item) => item.mediaAssetId));
    const resolvedItems: ResolvedDraft[] = [];
    for (const raw of rawItems) resolvedItems.push(await this.resolveWardrobeDraft(userId, raw, inUseAssetIds));
    // One transaction for every item in the batch: either the whole
    // reviewed batch is saved, or none of it is.
    const items = await this.wardrobe.createWardrobeItemsBatch(userId, resolvedItems.map((entry) => entry.payload));
    await Promise.all(resolvedItems.map((entry) => this.assets.pruneAnalysisJobResult(entry.analysisJobId).catch(() => {})));
    return Promise.all(items.map((item) => toPublicWardrobeItem(this.assetStore, item)));
  }

  async createWardrobeLink(userId: string, raw: WardrobeLinkPayload): Promise<PublicWardrobeItem> {
    const item = await this.wardrobe.createWardrobeItem(userId, {
      sourceType: "product_link",
      name: text(raw?.name, "name", {max: 160}),
      category: wardrobeCategory(raw?.category),
      tags: cleanTags(raw?.tags),
      mediaAssetId: null,
      imageStorageKey: null,
      productUrl: productUrl(raw?.productUrl),
      containsPerson: false,
      garmentVisibility: "full",
      virtualTryOnEligible: false,
    });
    return toPublicWardrobeItem(this.assetStore, item);
  }

  async deleteWardrobeItem(userId: string, itemId: string): Promise<void> {
    const item = await this.wardrobe.getWardrobeItem(itemId);
    assert(item && item.userId === userId && !item.deletedAt, 404, "WARDROBE_ITEM_NOT_FOUND", "The wardrobe item was not found.");
    // The DB side (wardrobe_items soft-delete + media_assets archive + tag/
    // analysis cleanup) commits as one transaction, so it can never diverge
    // from what Cloudinary ends up holding. Cloudinary removal is therefore
    // best-effort here — a failure doesn't error the request or leave the
    // item stuck; the periodic cleanup sweep retries it (see
    // maintenance.service.ts).
    await this.wardrobe.deleteWardrobeItem(item.id, item.mediaAssetId);
    if (item.imageStorageKey) {
      await this.assetStore.remove(item.imageStorageKey).catch((error) => safeOperationalError("Wardrobe media cleanup failed", error));
    }
  }

  // Shared by createWardrobeItem and createWardrobeItemsBatch: resolves a
  // draft's asset + analysis job, checks it isn't already saved (including
  // against other items already resolved earlier in the same batch, via
  // the shared inUseAssetIds set), and builds the createWardrobeItem
  // payload from the analysis JSON.
  private async resolveWardrobeDraft(userId: string, raw: WardrobeItemDraftPayload, inUseAssetIds: Set<string | null>): Promise<ResolvedDraft> {
    const assetId = text(raw?.assetId, "assetId", {max: 100});
    const analysisJobId = text(raw?.analysisJobId, "analysisJobId", {max: 100});
    const asset = await this.assets.getAsset(assetId);
    assert(asset && asset.userId === userId && asset.purpose === "wardrobe_item", 404, "ASSET_NOT_FOUND", "The wardrobe image was not found.");
    const analysisJob = await this.assets.getAnalysisJob(analysisJobId);
    assert(
      analysisJob && analysisJob.userId === userId && analysisJob.mediaAssetId === asset.id && analysisJob.analysisType === "wardrobe_item",
      404,
      "ANALYSIS_NOT_FOUND",
      "The wardrobe analysis was not found.",
    );
    assert(!inUseAssetIds.has(asset.id), 409, "ASSET_IN_USE", "The image already belongs to a wardrobe item.");
    inUseAssetIds.add(asset.id);
    const metadata = (analysisJob.result || {}) as Record<string, unknown>;
    return {
      analysisJobId: analysisJob.id,
      payload: {
        sourceType: "upload",
        name: text(raw?.name, "name", {max: 160}),
        category: wardrobeCategory(raw?.category),
        tags: cleanTags(raw?.tags),
        mediaAssetId: asset.id,
        analysisJobId: analysisJob.id,
        imageStorageKey: asset.storageKey,
        imageStorageProvider: asset.storageProvider,
        productUrl: null,
        primaryColor: typeof metadata.color === "string" ? metadata.color.trim().slice(0, 100) || null : null,
        material: typeof metadata.material === "string" ? metadata.material.trim().slice(0, 160) || null : null,
        pattern: typeof metadata.pattern === "string" ? metadata.pattern.trim().slice(0, 120) || null : null,
        season: cleanStringArray(metadata.season, 4),
        occasion: cleanStringArray(metadata.occasion, 6),
        styleTags: cleanStringArray(metadata.style),
        containsPerson: !!metadata.contains_person,
        garmentVisibility: sanitizeGarmentVisibility(metadata.garment_visibility),
        virtualTryOnEligible: resolveVirtualTryOnEligibility(metadata as {virtual_tryon_eligible?: boolean; contains_person?: boolean}),
      },
    };
  }
}
