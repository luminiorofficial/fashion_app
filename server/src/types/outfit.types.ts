import type {StyleProfile} from "./profile.types";
import type {WardrobeItem} from "./wardrobe.types";

export type OutfitEventType = "Office" | "Meeting" | "Casual" | "Date" | "Party" | "Wedding" | "Travel" | "Dinner" | "Other";
export type OutfitReaction = "love_it" | "would_wear" | "not_sure" | "not_my_style";

export interface SuggestedPurchaseItem {
  name: string;
  type: string;
  // "essential" = the outfit is genuinely incomplete without something in
  // this category (e.g. no shoes at all); "accessory" = optional polish
  // (bag, jewelry, belt) that isn't required to wear the look. Absent on
  // legacy rows persisted before this field existed.
  role?: "essential" | "accessory";
}

export interface OutfitFeedback {
  id?: string;
  userId?: string;
  outfitId: string;
  reaction: OutfitReaction | null;
  wornAt: string | null;
  createdAt?: string;
  updatedAt: string;
}

// listOutfits embeds a lighter-weight feedback summary than the full
// OutfitFeedback record returned by upsertOutfitFeedback. The two backing
// repositories (Postgres, in-memory) have always embedded slightly
// different shapes here (Postgres: reaction/wornAt only; in-memory: the
// full stored record) — this type covers both without changing either's
// existing response shape.
export interface OutfitFeedbackSummary {
  reaction: OutfitReaction | null;
  wornAt: string | null;
}

export interface Outfit {
  id: string;
  userId: string;
  eventType: string;
  status?: string;
  rationale: string;
  suggestedItems: SuggestedPurchaseItem[];
  wardrobeItemIds: string[];
  createdAt: string;
  completedAt?: string | null;
  feedback?: OutfitFeedbackSummary | OutfitFeedback | null;
}

export interface CreateOutfitInput {
  eventType: string;
  rationale: string;
  wardrobeItemIds: string[];
  suggestedItems: SuggestedPurchaseItem[];
  analysisContext: Record<string, unknown>;
}

export interface UpsertOutfitFeedbackInput {
  reaction?: OutfitReaction | null;
  wornAt?: string | null;
}

export interface PublicOutfit {
  id: string;
  eventType: string;
  wardrobeItemIds: string[];
  rationale: string;
  suggestedItems: SuggestedPurchaseItem[];
  createdAt: string;
}

export interface PublicFeedback {
  outfitId: string;
  reaction: OutfitReaction | null;
  wornAt: string | null;
  updatedAt: string;
}

export type WardrobeAffinity = Record<string, number>;

export interface AffinityNote {
  id: string;
  name: string;
  affinity: "positive" | "negative";
}

export interface SuggestOutfitInput {
  eventType: string;
  profile: StyleProfile | undefined;
  wardrobe: WardrobeItem[];
  affinityNotes: AffinityNote[] | null;
  // A short, pre-formatted one-line weather summary (e.g. "22C, feels 20C,
  // Partly cloudy, 30% rain chance, wind 12kph") to keep Gemini token usage
  // low. Null when coordinates weren't provided or the weather lookup
  // failed — the AI is told nothing and styles without weather context.
  weatherContext: string | null;
}

export interface OutfitSuggestion {
  wardrobe_item_ids: string[];
  rationale: string;
  suggested_items: SuggestedPurchaseItem[];
}
