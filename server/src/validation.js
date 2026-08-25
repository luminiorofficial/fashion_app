const {assert} = require("./errors");

const wardrobeCategories = ["Top", "Bottom", "Outerwear", "Dress", "Shoes", "Accessory"];
const garmentVisibilityLevels = ["full", "partial", "occluded"];

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
  const parsed = new Date(`${value}T00:00:00.000Z`);
  const today = new Date().toISOString().slice(0, 10);
  assert(!Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value && value >= "1900-01-01" && value < today, 400, "INVALID_DATE_OF_BIRTH", "Enter a valid date of birth.");
  return value;
}

function wardrobeCategory(value) {
  const clean = text(value, "category", {max: 40});
  assert(wardrobeCategories.includes(clean), 400, "INVALID_CATEGORY", `category must be one of: ${wardrobeCategories.join(", ")}.`);
  return clean;
}

function productUrl(value) {
  const clean = text(value, "productUrl", {max: 2048});
  let parsed;
  try { parsed = new URL(clean); } catch (_) { parsed = null; }
  assert(parsed && ["http:", "https:"].includes(parsed.protocol), 400, "INVALID_PRODUCT_URL", "productUrl must be a valid HTTP or HTTPS URL.");
  return clean;
}

const outfitEventTypes = ["Office", "Meeting", "Casual", "Date", "Party", "Wedding", "Travel", "Dinner", "Other"];

function outfitEventType(value) {
  const clean = text(value, "eventType", {max: 40});
  assert(outfitEventTypes.includes(clean), 400, "INVALID_EVENT_TYPE", `eventType must be one of: ${outfitEventTypes.join(", ")}.`);
  return clean;
}

const outfitReactions = ["love_it", "would_wear", "not_sure", "not_my_style"];

function outfitReaction(value) {
  const clean = text(value, "reaction", {max: 20});
  assert(outfitReactions.includes(clean), 400, "INVALID_REACTION", `reaction must be one of: ${outfitReactions.join(", ")}.`);
  return clean;
}

function wardrobeItemIdList(value) {
  assert(Array.isArray(value) && value.length >= 1 && value.length <= 6, 400, "INVALID_WARDROBE_ITEM_IDS", "wardrobeItemIds must be an array of 1 to 6 item ids.");
  const ids = value.map((id) => text(id, "wardrobeItemIds[]", {max: 100}));
  assert(new Set(ids).size === ids.length, 400, "INVALID_WARDROBE_ITEM_IDS", "wardrobeItemIds must not contain duplicates.");
  return ids;
}

module.exports = {text, phone, birthDate, productUrl, wardrobeCategory, wardrobeCategories, garmentVisibilityLevels, outfitEventType, outfitEventTypes, outfitReaction, outfitReactions, wardrobeItemIdList};
