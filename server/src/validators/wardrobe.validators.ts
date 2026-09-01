import {assert} from "../utils/api-error";
import {text} from "./common.validators";
import {wardrobeCategories} from "../config/constants";

export function wardrobeCategory(value: unknown): string {
  const clean = text(value, "category", {max: 40});
  assert(wardrobeCategories.includes(clean as (typeof wardrobeCategories)[number]), 400, "INVALID_CATEGORY", `category must be one of: ${wardrobeCategories.join(", ")}.`);
  return clean;
}

export function productUrl(value: unknown): string {
  const clean = text(value, "productUrl", {max: 2048});
  let parsed: URL | null;
  try {
    parsed = new URL(clean);
  } catch {
    parsed = null;
  }
  assert(parsed !== null && ["http:", "https:"].includes(parsed.protocol), 400, "INVALID_PRODUCT_URL", "productUrl must be a valid HTTP or HTTPS URL.");
  return clean;
}

export function wardrobeItemIdList(value: unknown): string[] {
  assert(Array.isArray(value) && value.length >= 1 && value.length <= 6, 400, "INVALID_WARDROBE_ITEM_IDS", "wardrobeItemIds must be an array of 1 to 6 item ids.");
  const ids = (value as unknown[]).map((id) => text(id, "wardrobeItemIds[]", {max: 100}));
  assert(new Set(ids).size === ids.length, 400, "INVALID_WARDROBE_ITEM_IDS", "wardrobeItemIds must not contain duplicates.");
  return ids;
}
