import {MemoryStore, generateId} from "../../memory-store";
import type {WardrobeRepository} from "../../../types/repositories";
import type {WardrobeItem, CreateWardrobeItemInput} from "../../../types/wardrobe.types";

export class MemoryWardrobeRepository implements WardrobeRepository {
  constructor(private readonly store: MemoryStore) {}

  async listWardrobe(userId: string): Promise<WardrobeItem[]> {
    return [...this.store.wardrobe.values()]
      .filter((item) => item.userId === userId && !item.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createWardrobeItem(userId: string, item: CreateWardrobeItemInput): Promise<WardrobeItem> {
    const now = new Date().toISOString();
    const value: WardrobeItem = {
      imageStorageProvider: null,
      analysisJobId: null,
      primaryColor: null,
      material: null,
      pattern: null,
      secondaryColors: [],
      season: [],
      occasion: [],
      styleTags: [],
      ...item,
      id: generateId(),
      userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.store.wardrobe.set(value.id, value);
    return value;
  }

  async createWardrobeItemsBatch(userId: string, items: CreateWardrobeItemInput[]): Promise<WardrobeItem[]> {
    const created: WardrobeItem[] = [];
    for (const item of items) created.push(await this.createWardrobeItem(userId, item));
    return created;
  }

  async getWardrobeItem(itemId: string): Promise<WardrobeItem | null> {
    return this.store.wardrobe.get(itemId) ?? null;
  }

  // Soft-deletes the item but also drops its now-useless AI analysis
  // result, and archives the linked media asset in the same step, so the
  // in-memory store never has a soft-deleted item pointing at an active
  // media asset (mirrors the Postgres transaction in the Postgres adapter).
  async deleteWardrobeItem(itemId: string, mediaAssetId: string | null): Promise<void> {
    const item = this.store.wardrobe.get(itemId);
    if (!item) return;
    item.deletedAt = new Date().toISOString();
    if (item.analysisJobId) this.store.analysisJobs.delete(item.analysisJobId);
    if (mediaAssetId) {
      const asset = this.store.assets.get(mediaAssetId);
      if (asset) Object.assign(asset, {status: "deleted", deletedAt: new Date().toISOString()});
    }
  }
}
