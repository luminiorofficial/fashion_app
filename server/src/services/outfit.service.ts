import {assert} from "../utils/api-error";
import {outfitEventType, outfitReaction} from "../validators/outfit.validators";
import type {OutfitsRepository, WardrobeRepository, ProfilesRepository} from "../types/repositories";
import type {TextAnalysisProvider} from "../types/provider.types";
import type {Outfit, PublicOutfit, PublicFeedback, SuggestedPurchaseItem, WardrobeAffinity, AffinityNote} from "../types/outfit.types";
import type {WardrobeItem} from "../types/wardrobe.types";

export interface GeneratedOutfit extends PublicOutfit {
  matchScore: number | null;
}

export interface ListedOutfit extends PublicOutfit {
  feedback: unknown;
}

function toPublicOutfit(outfit: Outfit): PublicOutfit {
  return {id: outfit.id, eventType: outfit.eventType, wardrobeItemIds: outfit.wardrobeItemIds, rationale: outfit.rationale, suggestedPurchaseItem: outfit.suggestedPurchaseItem || null, createdAt: outfit.createdAt};
}

function toPublicFeedback(feedback: {outfitId: string; reaction: string | null; wornAt: string | null; updatedAt: string}): PublicFeedback {
  return {outfitId: feedback.outfitId, reaction: feedback.reaction as PublicFeedback["reaction"], wornAt: feedback.wornAt || null, updatedAt: feedback.updatedAt};
}

// Surfaces a compact preference summary (not the whole history) to the
// styling AI so it can lean toward previously liked/worn items; this is a
// hint, not a hard filter — the local computeMatchScore below is the
// source of truth for the "personalized score" shown to the user.
function buildAffinityNotes(wardrobe: WardrobeItem[], affinity: WardrobeAffinity): AffinityNote[] | null {
  const entries = wardrobe
    .map((item) => ({id: item.id, name: item.name, score: affinity[item.id] || 0}))
    .filter((entry) => entry.score !== 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((entry) => ({id: entry.id, name: entry.name, affinity: (entry.score > 0 ? "positive" : "negative") as AffinityNote["affinity"]}));
  return entries.length ? entries : null;
}

// A simple, local (non-AI) 0-100 personalization score for a chosen
// outfit: items with no feedback history sit at a neutral baseline, and
// each past reaction/wear nudges their contribution up or down.
function computeMatchScore(wardrobeItemIds: string[], affinity: WardrobeAffinity): number | null {
  if (!wardrobeItemIds.length) return null;
  const neutral = 60;
  const scores = wardrobeItemIds.map((id) => Math.max(0, Math.min(100, neutral + (affinity[id] || 0) * 8)));
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

// The suggested purchase comes from the styling AI, not a trusted product
// catalog: keep only a plain name/type pair (never a URL) so nothing it
// hallucinates can be surfaced as a clickable link to the client.
function sanitizeSuggestedPurchase(value: unknown): SuggestedPurchaseItem | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {name?: unknown; type?: unknown};
  const name = typeof candidate.name === "string" ? candidate.name.trim().slice(0, 160) : "";
  const type = typeof candidate.type === "string" ? candidate.type.trim().slice(0, 80) : "";
  return name && type ? {name, type} : null;
}

export class OutfitService {
  constructor(
    private readonly outfits: OutfitsRepository,
    private readonly wardrobe: WardrobeRepository,
    private readonly profiles: ProfilesRepository,
    private readonly analyzer: TextAnalysisProvider,
  ) {}

  async generateOutfit(userId: string, rawEventType: unknown): Promise<GeneratedOutfit> {
    const eventType = outfitEventType(rawEventType);
    const wardrobe = await this.wardrobe.listWardrobe(userId);
    assert(wardrobe.length >= 2, 400, "WARDROBE_TOO_SMALL", "Add at least 2 wardrobe items before generating an outfit.");
    const profile = await this.profiles.getProfile(userId);
    const affinity = await this.outfits.getWardrobeAffinity(userId);
    const suggestion = await this.analyzer.suggestOutfit({eventType, profile, wardrobe, affinityNotes: buildAffinityNotes(wardrobe, affinity)});
    const wardrobeIds = new Set(wardrobe.map((item) => item.id));
    const wardrobeItemIds = [...new Set(suggestion.wardrobe_item_ids || [])].filter((id) => wardrobeIds.has(id));
    assert(wardrobeItemIds.length > 0, 502, "INVALID_OUTFIT_SELECTION", "The styling AI did not return a valid outfit from your wardrobe.");
    const suggestedPurchaseItem = sanitizeSuggestedPurchase(suggestion.suggested_purchase_item);
    const outfit = await this.outfits.createOutfit(userId, {
      eventType,
      rationale: suggestion.rationale,
      wardrobeItemIds,
      suggestedPurchaseItem,
      analysisContext: {wardrobeItemCount: wardrobe.length},
    });
    return {...toPublicOutfit(outfit), matchScore: computeMatchScore(wardrobeItemIds, affinity)};
  }

  async listOutfits(userId: string): Promise<ListedOutfit[]> {
    const outfits = await this.outfits.listOutfits(userId, {limit: 30});
    return outfits.map((outfit) => ({...toPublicOutfit(outfit), feedback: outfit.feedback || null}));
  }

  async recordFeedback(userId: string, outfitId: string, rawReaction: unknown): Promise<PublicFeedback> {
    const outfit = await this.outfits.getOutfit(outfitId);
    assert(outfit && outfit.userId === userId, 404, "OUTFIT_NOT_FOUND", "The outfit was not found.");
    const reaction = outfitReaction(rawReaction);
    const feedback = await this.outfits.upsertOutfitFeedback(userId, outfit.id, {reaction: reaction as PublicFeedback["reaction"]});
    return toPublicFeedback(feedback);
  }

  async markWorn(userId: string, outfitId: string): Promise<PublicFeedback> {
    const outfit = await this.outfits.getOutfit(outfitId);
    assert(outfit && outfit.userId === userId, 404, "OUTFIT_NOT_FOUND", "The outfit was not found.");
    const feedback = await this.outfits.upsertOutfitFeedback(userId, outfit.id, {wornAt: new Date().toISOString()});
    return toPublicFeedback(feedback);
  }
}
