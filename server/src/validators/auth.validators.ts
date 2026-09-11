import {assert} from "../utils/api-error";
import {text} from "./common.validators";

export function phone(value: unknown): string {
  const clean = text(value, "phoneNumber", {min: 8, max: 16}).replace(/[\s()-]/g, "");
  assert(/^\+[1-9]\d{7,14}$/.test(clean), 400, "INVALID_PHONE", "Use an E.164 phone number, for example +919876543210.");
  // Indian mobile numbers (the only country code the app's UI offers) must be
  // exactly 10 digits starting with 6, 7, 8, or 9 — this rejects placeholder
  // values like +910000000000 that would otherwise pass the generic E.164
  // shape check above.
  if (clean.startsWith("+91")) {
    assert(/^\+91[6-9]\d{9}$/.test(clean), 400, "INVALID_PHONE", "Please enter a valid 10-digit mobile number.");
  }
  return clean;
}

// Allows genuine names with internal spaces (e.g. "Riya Sharma") and common
// punctuation (apostrophes, hyphens, periods for initials), while rejecting
// empty input, numbers-only input, and special-character-only input. Not
// meant to validate against a strict transliteration/script allowlist —
// only to catch clearly-invalid submissions without overvalidating real
// names.
export function fullName(value: unknown): string {
  const raw = text(value, "name", {min: 1, max: 120});
  const clean = raw.replace(/\s+/g, " ").trim();
  assert(clean.length >= 2, 400, "INVALID_NAME", "Please enter your full name.");
  assert(/[A-Za-z]/.test(clean), 400, "INVALID_NAME", "Please enter a valid name.");
  assert(/^[A-Za-z][A-Za-z '.-]*$/.test(clean), 400, "INVALID_NAME", "Names can only contain letters, spaces, apostrophes, periods, and hyphens.");
  return clean;
}

export function birthDate(value: unknown): string {
  assert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value), 400, "INVALID_DATE_OF_BIRTH", "dateOfBirth must use YYYY-MM-DD.");
  const dateValue = value as string;
  const parsed = new Date(`${dateValue}T00:00:00.000Z`);
  const today = new Date().toISOString().slice(0, 10);
  assert(
    !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === dateValue && dateValue >= "1900-01-01" && dateValue < today,
    400,
    "INVALID_DATE_OF_BIRTH",
    "Enter a valid date of birth.",
  );
  return dateValue;
}
