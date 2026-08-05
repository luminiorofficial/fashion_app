const {assert} = require("./errors");

function text(value, field, {min = 1, max = 200} = {}) {
  assert(typeof value === "string", 400, "VALIDATION_ERROR", `${field} is required.`);
  const clean = value.trim();
  assert(clean.length >= min && clean.length <= max, 400, "VALIDATION_ERROR", `${field} must be between ${min} and ${max} characters.`);
  return clean;
}

function phone(value) {
  const clean = text(value, "phoneNumber", {min: 8, max: 16}).replace(/[\s()-]/g, "");
  assert(/^\+[1-9]\d{7,14}$/.test(clean), 400, "INVALID_PHONE", "Use an E.164 phone number, for example +919876543210.");
  return clean;
}

function birthDate(value) {
  assert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value), 400, "INVALID_DATE_OF_BIRTH", "dateOfBirth must use YYYY-MM-DD.");
  const parsed = new Date(`${value}T00:00:00Z`);
  const today = new Date();
  assert(!Number.isNaN(parsed.valueOf()) && parsed < today && parsed.getUTCFullYear() >= 1900, 400, "INVALID_DATE_OF_BIRTH", "Enter a valid date of birth.");
  return value;
}

function productUrl(value) {
  const clean = text(value, "productUrl", {max: 2048});
  let parsed;
  try { parsed = new URL(clean); } catch (_) { parsed = null; }
  assert(parsed && ["http:", "https:"].includes(parsed.protocol), 400, "INVALID_PRODUCT_URL", "productUrl must be a valid HTTP or HTTPS URL.");
  return clean;
}

module.exports = {text, phone, birthDate, productUrl};
