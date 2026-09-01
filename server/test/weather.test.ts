import test from "node:test";
import assert from "node:assert/strict";
import {WeatherService} from "../src/services/weather.service";
import {OutfitService} from "../src/services/outfit.service";
import type {WeatherSummary} from "../src/types/weather.types";
import type {SuggestOutfitInput} from "../src/types/outfit.types";

const currentWeather: WeatherSummary = {
  temperatureC: 22,
  feelsLikeC: 21,
  humidityPercent: 64,
  rainProbabilityPercent: 35,
  condition: "Cloudy",
  windKph: 12,
};

test("weather rounds coordinates and reuses a cached reading", async () => {
  const calls: Array<[number, number]> = [];
  const service = new WeatherService({
    getCurrentWeather: async (lat, lng) => {
      calls.push([lat, lng]);
      return currentWeather;
    },
  }, 60_000);

  assert.deepEqual(await service.getWeather(12.3451, 77.6549), currentWeather);
  assert.deepEqual(await service.getWeather(12.3452, 77.6548), currentWeather);
  assert.deepEqual(calls, [[12.35, 77.65]]);
});

test("best-effort weather returns null for missing coordinates and provider failures", async () => {
  let calls = 0;
  const service = new WeatherService({
    getCurrentWeather: async () => {
      calls += 1;
      throw new Error("weather provider unavailable");
    },
  }, 60_000);

  assert.equal(await service.tryGetWeather(undefined, undefined), null);
  assert.equal(calls, 0);
  assert.equal(await service.tryGetWeather(12.34, 77.65), null);
  assert.equal(calls, 1);
});

test("outfit generation continues without weather when its provider fails", async () => {
  let receivedWeatherContext: string | null | undefined;
  const weather = new WeatherService({
    getCurrentWeather: async () => { throw new Error("weather provider unavailable"); },
  }, 60_000);
  const outfit = new OutfitService(
    {
      getWardrobeAffinity: async () => ({}),
      createOutfit: async (userId: string, input: Record<string, unknown>) => ({
        id: "outfit-1",
        userId,
        eventType: input.eventType as string,
        rationale: input.rationale as string,
        wardrobeItemIds: input.wardrobeItemIds as string[],
        suggestedPurchaseItem: null,
        createdAt: "2026-09-01T00:00:00.000Z",
      }),
    } as never,
    {
      listWardrobe: async () => [
        {id: "top-1", name: "Top", category: "Top"},
        {id: "bottom-1", name: "Trousers", category: "Bottom"},
      ],
    } as never,
    {getProfile: async () => ({bodyShape: "Rectangle"})} as never,
    {
      suggestOutfit: async (input: SuggestOutfitInput) => {
        receivedWeatherContext = input.weatherContext;
        return {
          wardrobe_item_ids: ["top-1", "bottom-1"],
          rationale: "A weather-independent outfit",
          suggested_purchase_item: null,
        };
      },
    } as never,
    weather,
  );

  const generated = await outfit.generateOutfit("user-1", "Casual", {lat: 12.34, lng: 77.65});

  assert.equal(generated.id, "outfit-1");
  assert.equal(receivedWeatherContext, null);
});
