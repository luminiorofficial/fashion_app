import {MemoryStore, generateId} from "../../memory-store";
import type {TryOnRepository} from "../../../types/repositories";
import type {TryOnRequest, CreateTryOnRequestInput} from "../../../types/tryon.types";

export class MemoryTryOnRepository implements TryOnRepository {
  constructor(private readonly store: MemoryStore) {}

  async createTryOnRequest(userId: string, request: CreateTryOnRequestInput): Promise<TryOnRequest> {
    const now = new Date().toISOString();
    const value: TryOnRequest = {id: generateId(), userId, isSaved: false, createdAt: now, resultStorageKey: null, errorCode: null, errorMessage: null, ...request};
    this.store.tryOnRequests.set(value.id, value);
    return value;
  }

  async getTryOnRequest(tryOnId: string): Promise<TryOnRequest | null> {
    return this.store.tryOnRequests.get(tryOnId) ?? null;
  }

  async markTryOnSaved(tryOnId: string): Promise<TryOnRequest | null> {
    const value = this.store.tryOnRequests.get(tryOnId);
    if (value) value.isSaved = true;
    return value ?? null;
  }

  async listSavedTryOns(userId: string): Promise<TryOnRequest[]> {
    return [...this.store.tryOnRequests.values()]
      .filter((tryOn) => tryOn.userId === userId && tryOn.isSaved && tryOn.status === "completed")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((tryOn) => ({...tryOn, resultStorageKey: this.store.assets.get(tryOn.resultMediaAssetId || "")?.storageKey || null}));
  }

  async unsaveTryOn(tryOnId: string): Promise<TryOnRequest | null> {
    const value = this.store.tryOnRequests.get(tryOnId);
    if (value) value.isSaved = false;
    return value ?? null;
  }

  async listExpiredUnsavedTryOns(beforeIso: string): Promise<TryOnRequest[]> {
    return [...this.store.tryOnRequests.values()]
      .filter((tryOn) => !tryOn.isSaved && tryOn.createdAt < beforeIso)
      .map((tryOn) => ({...tryOn, resultStorageKey: this.store.assets.get(tryOn.resultMediaAssetId || "")?.storageKey || null}));
  }

  async deleteTryOnRequest(tryOnId: string): Promise<void> {
    this.store.tryOnRequests.delete(tryOnId);
  }
}
