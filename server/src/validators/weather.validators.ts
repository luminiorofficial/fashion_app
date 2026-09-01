import {assert} from "../utils/api-error";

function parseCoordinate(value: unknown, field: string, min: number, max: number): number {
  const num = typeof value === "string" ? Number(value) : NaN;
  assert(Number.isFinite(num) && num >= min && num <= max, 400, "VALIDATION_ERROR", `${field} must be a number between ${min} and ${max}.`);
  return num;
}

export function latitude(value: unknown): number {
  return parseCoordinate(value, "lat", -90, 90);
}

export function longitude(value: unknown): number {
  return parseCoordinate(value, "lng", -180, 180);
}

// Optional coordinates for outfit generation: unlike latitude()/longitude()
// above, this never throws — weather is optional context, so a missing or
// malformed lat/lng must fall through to outfit generation without it
// rather than fail the whole request.
export function optionalCoordinates(rawLat: unknown, rawLng: unknown): {lat: number; lng: number} | null {
  const lat = typeof rawLat === "number" ? rawLat : NaN;
  const lng = typeof rawLng === "number" ? rawLng : NaN;
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  return valid ? {lat, lng} : null;
}
