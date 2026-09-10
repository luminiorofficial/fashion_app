import type {SuggestedPurchaseItem} from "../types/outfit.types";

const SUGGESTED_ITEM_LIMIT = 3;

/**
 * Converts both current arrays and legacy single-object JSONB values into the
 * public suggested-items contract. Unknown fields (including shopping links
 * and prices) are intentionally discarded.
 */
export function normalizeSuggestedItems(value: unknown): SuggestedPurchaseItem[] {
  const values = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  const items: SuggestedPurchaseItem[] = [];

  for (const raw of values) {
    if (items.length >= SUGGESTED_ITEM_LIMIT) break;
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as {name?: unknown; type?: unknown; role?: unknown};
    const name = typeof candidate.name === "string" ? candidate.name.trim().slice(0, 160) : "";
    const type = typeof candidate.type === "string" ? candidate.type.trim().slice(0, 80) : "";
    if (!name || !type) continue;

    const role = candidate.role === "essential" || candidate.role === "accessory" ? candidate.role : undefined;
    items.push(role ? {name, type, role} : {name, type});
  }

  return items;
}
