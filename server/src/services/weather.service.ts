import {ApiError} from "../utils/api-error";
import type {WeatherProvider} from "../types/provider.types";
import type {WeatherSummary} from "../types/weather.types";

interface CacheEntry {
  value: WeatherSummary;
  expiresAt: number;
}

// Coordinates are rounded to two decimal degrees (~1.1km) before being used
// as a cache key or sent to the provider: plenty precise for weather, and
// this is the only "location" this service ever handles — the rounded
// value lives in an in-process cache only, is never persisted to the
// database, and is never linked to a user.
function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

function assertValidCoordinates(lat: number, lng: number): void {
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  if (!valid) throw new ApiError(400, "INVALID_COORDINATES", "lat must be between -90 and 90 and lng between -180 and 180.");
}

export class WeatherService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly provider: WeatherProvider,
    private readonly ttlMs: number,
  ) {}

  async getWeather(rawLat: number, rawLng: number): Promise<WeatherSummary> {
    assertValidCoordinates(rawLat, rawLng);
    const lat = roundCoordinate(rawLat);
    const lng = roundCoordinate(rawLng);
    const key = `${lat},${lng}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const value = await this.provider.getCurrentWeather(lat, lng);
    this.cache.set(key, {value, expiresAt: now + this.ttlMs});
    this.pruneExpired(now);
    return value;
  }

  // Best-effort variant for the outfit-generation flow: missing
  // coordinates or any provider failure resolve to null instead of
  // throwing, so weather never blocks styling.
  async tryGetWeather(lat: number | null | undefined, lng: number | null | undefined): Promise<WeatherSummary | null> {
    if (lat == null || lng == null) return null;
    try {
      return await this.getWeather(lat, lng);
    } catch {
      return null;
    }
  }

  private pruneExpired(now: number): void {
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
  }
}
