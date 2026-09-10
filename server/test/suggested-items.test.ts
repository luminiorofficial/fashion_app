import test from "node:test";
import assert from "node:assert/strict";
import type {Pool} from "pg";
import {PostgresOutfitsRepository} from "../src/database/repositories/postgres/outfits.repository";
import {GeminiTextAnalyzerProvider} from "../src/providers/gemini/text-analyzer.provider";
import {normalizeSuggestedItems} from "../src/utils/suggested-items";
import type {WardrobeItem} from "../src/types/wardrobe.types";

test("normalizes null, legacy objects, and current arrays", () => {
  assert.deepEqual(normalizeSuggestedItems(null), []);
  assert.deepEqual(normalizeSuggestedItems({name: "Legacy bag", type: "Accessory"}), [
    {name: "Legacy bag", type: "Accessory"},
  ]);
  assert.deepEqual(normalizeSuggestedItems([
    {name: " Earrings ", type: " Accessory ", role: "accessory", buyUrl: "https://invalid.example"},
    {name: "Shoes", type: "Shoes", role: "essential", price: 100},
    {name: "Belt", type: "Accessory", role: "accessory"},
    {name: "Watch", type: "Accessory", role: "accessory"},
  ]), [
    {name: "Earrings", type: "Accessory", role: "accessory"},
    {name: "Shoes", type: "Shoes", role: "essential"},
    {name: "Belt", type: "Accessory", role: "accessory"},
  ]);
});

test("Postgres outfit history loads a legacy single suggested_purchase object", async () => {
  let call = 0;
  const pool = {
    async query() {
      call += 1;
      if (call === 1) {
        return {rows: [{
          id: "outfit-1", user_id: "user-1", event_type: "Casual", status: "completed",
          rationale: "Legacy outfit", suggested_purchase: {name: "Loafers", type: "Shoes"},
          created_at: "2026-01-01T00:00:00.000Z", completed_at: null,
        }]};
      }
      return {rows: [{wardrobe_item_id: "top-1"}]};
    },
  } as unknown as Pool;

  const outfit = await new PostgresOutfitsRepository(pool).getOutfit("outfit-1");
  assert.deepEqual(outfit?.suggestedItems, [{name: "Loafers", type: "Shoes"}]);
});

test("fallback recommends essential shoes only when shoes are missing", async () => {
  const analyzer = new GeminiTextAnalyzerProvider({geminiApiKey: ""});
  const common: Omit<WardrobeItem, "id" | "name" | "category"> = {
    userId: "user-1", sourceType: "upload", imageStorageKey: null, imageStorageProvider: null,
    productUrl: null, mediaAssetId: null, analysisJobId: null, tags: [], primaryColor: null,
    secondaryColors: [], material: null, pattern: null, season: [], occasion: [], styleTags: [],
    containsPerson: false, garmentVisibility: "full", virtualTryOnEligible: true,
    sourceMarketplace: null, isNew: false, createdAt: "", updatedAt: "", deletedAt: null,
  };
  const base: WardrobeItem[] = [
    {...common, id: "top-1", name: "Top", category: "Top"},
    {...common, id: "bottom-1", name: "Bottom", category: "Bottom"},
  ];
  const input = {eventType: "Casual", profile: undefined, affinityNotes: null, weatherContext: null};

  const missing = await analyzer.suggestOutfit({...input, wardrobe: base});
  assert.deepEqual(missing.suggested_items, [{name: "Complementary shoes", type: "Shoes", role: "essential"}]);

  const complete = await analyzer.suggestOutfit({...input, wardrobe: [
    ...base,
    {...base[0]!, id: "shoes-1", name: "Loafers", category: "Shoes"},
  ]});
  assert.deepEqual(complete.suggested_items, []);
});
