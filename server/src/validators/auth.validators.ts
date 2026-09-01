import {assert} from "../utils/api-error";
import {text} from "./common.validators";

export function phone(value: unknown): string {
  const clean = text(value, "phoneNumber", {min: 8, max: 16}).replace(/[\s()-]/g, "");
  assert(/^\+[1-9]\d{7,14}$/.test(clean), 400, "INVALID_PHONE", "Use an E.164 phone number, for example +919876543210.");
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
