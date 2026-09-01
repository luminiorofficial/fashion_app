import {MemoryStore, generateId} from "../../memory-store";
import type {OutfitsRepository} from "../../../types/repositories";
import type {Outfit, CreateOutfitInput, OutfitFeedback, UpsertOutfitFeedbackInput, WardrobeAffinity} from "../../../types/outfit.types";

const REACTION_WEIGHTS: Record<string, number> = {love_it: 3, would_wear: 1, not_sure: 0, not_my_style: -3};

export class MemoryOutfitsRepository implements OutfitsRepository {
  constructor(private readonly store: MemoryStore) {}

  async createOutfit(userId: string, outfit: CreateOutfitInput): Promise<Outfit> {
    const value: Outfit = {id: generateId(), userId, createdAt: new Date().toISOString(), ...outfit};
    this.store.outfits.set(value.id, value);
    return value;
  }

  async getOutfit(outfitId: string): Promise<Outfit | null> {
    return this.store.outfits.get(outfitId) ?? null;
  }

  async listOutfits(userId: string, {limit = 50}: {limit?: number} = {}): Promise<Outfit[]> {
    return [...this.store.outfits.values()]
      .filter((outfit) => outfit.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((outfit) => ({...outfit, feedback: this.store.outfitFeedback.get(outfit.id) ?? null}));
  }

  async upsertOutfitFeedback(userId: string, outfitId: string, {reaction, wornAt}: UpsertOutfitFeedbackInput = {}): Promise<OutfitFeedback> {
    const now = new Date().toISOString();
    const existing = this.store.outfitFeedback.get(outfitId);
    const value: OutfitFeedback = {
      id: existing?.id || generateId(),
      userId,
      outfitId,
      reaction: reaction !== undefined && reaction !== null ? reaction : existing?.reaction ?? null,
      wornAt: wornAt !== undefined && wornAt !== null ? wornAt : existing?.wornAt ?? null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.store.outfitFeedback.set(outfitId, value);
    return value;
  }

  // Weighted sum of past feedback per wardrobe item: positive reactions and
  // wears raise an item's affinity, negative reactions lower it. Items with
  // no signal are simply absent from the returned map.
  async getWardrobeAffinity(userId: string): Promise<WardrobeAffinity> {
    const scores: WardrobeAffinity = {};
    for (const feedback of this.store.outfitFeedback.values()) {
      if (feedback.userId !== userId) continue;
      const outfit = this.store.outfits.get(feedback.outfitId);
      if (!outfit) continue;
      const weight = (feedback.reaction ? REACTION_WEIGHTS[feedback.reaction] || 0 : 0) + (feedback.wornAt ? 2 : 0);
      if (weight === 0) continue;
      for (const itemId of outfit.wardrobeItemIds || []) {
        scores[itemId] = (scores[itemId] || 0) + weight;
      }
    }
    return scores;
  }
}
