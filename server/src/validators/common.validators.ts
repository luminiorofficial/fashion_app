import {assert} from "../utils/api-error";

export interface TextOptions {
  min?: number;
  max?: number;
}

export function text(value: unknown, field: string, {min = 1, max = 200}: TextOptions = {}): string {
  assert(typeof value === "string", 400, "VALIDATION_ERROR", `${field} is required.`);
  const clean = (value as string).trim();
  assert(clean.length >= min && clean.length <= max, 400, "VALIDATION_ERROR", `${field} must be between ${min} and ${max} characters.`);
  return clean;
}
