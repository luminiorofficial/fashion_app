import type {WardrobeCategory, GarmentVisibility} from "../types/wardrobe.types";
import type {OutfitEventType, OutfitReaction} from "../types/outfit.types";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FETCHED_ASSET_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 25_000_000;

export const wardrobeCategories: WardrobeCategory[] = ["Top", "Bottom", "Outerwear", "Dress", "Shoes", "Accessory"];
export const garmentVisibilityLevels: GarmentVisibility[] = ["full", "partial", "occluded"];
export const outfitEventTypes: OutfitEventType[] = ["Office", "Meeting", "Casual", "Date", "Party", "Wedding", "Travel", "Dinner", "Other"];
export const outfitReactions: OutfitReaction[] = ["love_it", "would_wear", "not_sure", "not_my_style"];

export const eventGuidance: Record<string, string> = {
  Office: "Polished, professional, and conservative for a business setting.",
  Meeting: "Sharp and put-together, slightly more formal than a normal office day.",
  Casual: "Everyday comfort suitable for running errands or a relaxed day out.",
  Date: "Attractive and confident, thoughtfully put-together without being overdressed.",
  Party: "Fun, expressive, and a little bold — statement pieces are welcome.",
  Wedding: "Elevated, formal attire appropriate for a wedding guest.",
  Travel: "Comfortable, easy to move in, and low-maintenance for a full day of travel.",
  Dinner: "Refined evening wear appropriate for a nice restaurant.",
  Other: "A versatile, well-balanced look appropriate for a general occasion.",
};

// Statuses worth retrying (rate limiting and transient server-side
// failures), shared by both Gemini providers (text analysis + image
// try-on). UNAVAILABLE_STATUSES is the subset that reads as "the AI
// service itself is down" rather than a specific, actionable condition
// (e.g. quota) — that subset gets a friendly message once every model is
// exhausted, instead of the raw provider error.
export const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
export const UNAVAILABLE_STATUSES = new Set([500, 502, 503, 504]);

// The Gemini REST API expects protobuf enum names here, while the
// environment variables intentionally use the shorter, human-readable values.
export const IMAGE_ASPECT_RATIO_ENUMS: Record<string, string> = {
  "1:1": "ASPECT_RATIO_ONE_BY_ONE",
  "2:3": "ASPECT_RATIO_TWO_BY_THREE",
  "3:2": "ASPECT_RATIO_THREE_BY_TWO",
  "3:4": "ASPECT_RATIO_THREE_BY_FOUR",
  "4:3": "ASPECT_RATIO_FOUR_BY_THREE",
  "4:5": "ASPECT_RATIO_FOUR_BY_FIVE",
  "9:16": "ASPECT_RATIO_NINE_BY_SIXTEEN",
  "16:9": "ASPECT_RATIO_SIXTEEN_BY_NINE",
};

export const IMAGE_SIZE_ENUMS: Record<string, string> = {
  "512": "IMAGE_SIZE_FIVE_TWELVE",
  "1K": "IMAGE_SIZE_ONE_K",
  "2K": "IMAGE_SIZE_TWO_K",
  "4K": "IMAGE_SIZE_FOUR_K",
};

// Maps an asset's semantic purpose to the Cloudinary sub-folder new uploads
// are organized under, so images self-sort into
// {CLOUDINARY_FOLDER}/{segment}/{userId}/{uuid} without ever hardcoding a
// user id. A purpose absent from this map falls back to the original flat
// {CLOUDINARY_FOLDER}/{userId}/{uuid} layout.
export const CLOUDINARY_PURPOSE_FOLDERS: Record<string, string> = {
  profile_analysis: "profiles",
  wardrobe_item: "wardrobe",
  tryon_result: "tryons",
};
