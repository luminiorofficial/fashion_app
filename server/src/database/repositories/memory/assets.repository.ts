import {MemoryStore, generateId} from "../../memory-store";
import type {AssetsRepository} from "../../../types/repositories";
import type {MediaAsset, CreateAssetInput, AnalysisJob, CreateAnalysisJobInput} from "../../../types/asset.types";

export class MemoryAssetsRepository implements AssetsRepository {
  constructor(private readonly store: MemoryStore) {}

  async createAsset(asset: CreateAssetInput): Promise<MediaAsset> {
    const value: MediaAsset = {id: generateId(), status: "ready", createdAt: new Date().toISOString(), deletedAt: null, publicUrl: null, ...asset};
    this.store.assets.set(value.id, value);
    return value;
  }

  async getAsset(assetId: string): Promise<MediaAsset | null> {
    const asset = this.store.assets.get(assetId);
    return asset && !asset.deletedAt ? asset : null;
  }

  async archiveAsset(assetId: string): Promise<void> {
    const asset = this.store.assets.get(assetId);
    if (asset) Object.assign(asset, {status: "deleted", deletedAt: new Date().toISOString()});
  }

  async createAnalysisJob(job: CreateAnalysisJobInput): Promise<AnalysisJob> {
    const value: AnalysisJob = {id: generateId(), createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), status: "completed", ...job};
    this.store.analysisJobs.set(value.id, value);
    return value;
  }

  async getAnalysisJob(jobId: string): Promise<AnalysisJob | null> {
    return this.store.analysisJobs.get(jobId) ?? null;
  }

  async pruneAnalysisJobResult(jobId: string): Promise<void> {
    const job = this.store.analysisJobs.get(jobId);
    if (job) job.result = null;
  }

  async deleteOrphanedAnalysisJobs(beforeIso: string): Promise<number> {
    const referenced = new Set<string>();
    for (const item of this.store.wardrobe.values()) if (item.analysisJobId) referenced.add(item.analysisJobId);
    for (const profile of this.store.profiles.values()) if (profile.latestAnalysisJobId) referenced.add(profile.latestAnalysisJobId);
    let count = 0;
    for (const [id, job] of this.store.analysisJobs) {
      if (!referenced.has(id) && job.createdAt < beforeIso) {
        this.store.analysisJobs.delete(id);
        count += 1;
      }
    }
    return count;
  }

  async listPurgeableMediaAssets(beforeIso: string): Promise<MediaAsset[]> {
    const referenced = new Set<string>();
    for (const item of this.store.wardrobe.values()) if (item.mediaAssetId) referenced.add(item.mediaAssetId);
    for (const job of this.store.analysisJobs.values()) if (job.mediaAssetId) referenced.add(job.mediaAssetId);
    for (const profile of this.store.profiles.values()) if (profile.profileImageAssetId) referenced.add(profile.profileImageAssetId);
    for (const tryOn of this.store.tryOnRequests.values()) {
      if (tryOn.profileMediaAssetId) referenced.add(tryOn.profileMediaAssetId);
      if (tryOn.resultMediaAssetId) referenced.add(tryOn.resultMediaAssetId);
    }
    return [...this.store.assets.values()].filter((asset) => Boolean(asset.deletedAt) && (asset.deletedAt as string) < beforeIso && !referenced.has(asset.id));
  }

  async archiveOrphanedMediaAssets(beforeIso: string): Promise<number> {
    const referenced = new Set<string>();
    for (const item of this.store.wardrobe.values()) if (!item.deletedAt && item.mediaAssetId) referenced.add(item.mediaAssetId);
    for (const job of this.store.analysisJobs.values()) if (job.mediaAssetId) referenced.add(job.mediaAssetId);
    for (const profile of this.store.profiles.values()) if (profile.profileImageAssetId) referenced.add(profile.profileImageAssetId);
    for (const tryOn of this.store.tryOnRequests.values()) {
      if (tryOn.profileMediaAssetId) referenced.add(tryOn.profileMediaAssetId);
      if (tryOn.resultMediaAssetId) referenced.add(tryOn.resultMediaAssetId);
    }
    let count = 0;
    for (const asset of this.store.assets.values()) {
      if (!asset.deletedAt && asset.createdAt < beforeIso && !referenced.has(asset.id)) {
        Object.assign(asset, {status: "deleted", deletedAt: new Date().toISOString()});
        count += 1;
      }
    }
    return count;
  }

  async deleteMediaAssetRow(assetId: string): Promise<void> {
    this.store.assets.delete(assetId);
  }
}
