const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {wardrobeCategories} = require("../src/validation");
const {InMemoryRepository, assertRepositoryContract} = require("../src/repository");
const {PostgresRepository} = require("../src/postgres_repository");

const migrationsDirectory = path.resolve(__dirname, "../../database/migrations");
const initialSchema = fs.readFileSync(path.join(migrationsDirectory, "001_initial_schema.sql"), "utf8");
const roles = fs.readFileSync(path.join(migrationsDirectory, "002_database_roles.sql"), "utf8");
const feedbackAndTryon = fs.readFileSync(path.join(migrationsDirectory, "003_feedback_and_tryon.sql"), "utf8");

test("initial migration contains the complete phase-one data model", () => {
  const tables = [...initialSchema.matchAll(/CREATE TABLE\s+([a-z_]+)/g)].map((match) => match[1]);
  assert.deepEqual(tables, [
    "schema_migrations", "users", "otp_challenges", "auth_sessions", "media_assets",
    "analysis_jobs", "user_style_profiles", "user_measurements", "wardrobe_categories",
    "wardrobe_items", "wardrobe_item_media", "tags", "wardrobe_item_tags", "outfits",
    "outfit_items", "audit_events",
  ]);
  for (const category of wardrobeCategories) assert.match(initialSchema, new RegExp(`'${category}'`));
  assert.match(initialSchema, /analysis_asset_owner_fk/);
  assert.match(initialSchema, /wardrobe_media_asset_owner_fk/);
  assert.match(initialSchema, /outfit_item_wardrobe_owner_fk/);
  assert.match(initialSchema, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(initialSchema, /^BEGIN;[\s\S]*COMMIT;\s*$/);
});

test("feedback and try-on migration adds the new tables inside a single transaction", () => {
  const tables = [...feedbackAndTryon.matchAll(/CREATE TABLE\s+([a-z_]+)/g)].map((match) => match[1]);
  assert.deepEqual(tables, ["outfit_feedback", "tryon_requests"]);
  assert.match(feedbackAndTryon, /ALTER TYPE media_purpose ADD VALUE IF NOT EXISTS 'tryon_result'/);
  assert.match(feedbackAndTryon, /outfit_feedback_outfit_owner_fk/);
  assert.match(feedbackAndTryon, /tryon_profile_asset_owner_fk/);
  assert.match(feedbackAndTryon, /tryon_wardrobe_items_context/);
  assert.match(feedbackAndTryon, /GRANT SELECT, INSERT, UPDATE ON outfit_feedback, tryon_requests TO nera_app/);
  assert.match(feedbackAndTryon, /^BEGIN;[\s\S]*COMMIT;\s*$/);
});

test("application role is explicit and cannot access all tables by default", () => {
  assert.doesNotMatch(roles, /ALL TABLES[\s\S]*TO nera_app/);
  assert.doesNotMatch(roles, /schema_migrations[\s\S]*TO nera_app/);
  assert.match(roles, /GRANT SELECT ON wardrobe_categories TO nera_app/);
});

test("in-memory development adapter satisfies the checked repository contract", () => {
  assert.equal(assertRepositoryContract(new InMemoryRepository()) instanceof InMemoryRepository, true);
});

test("PostgreSQL adapter satisfies the checked repository contract", () => {
  const pool = {query() { throw new Error("not used by this contract test"); }};
  assert.equal(assertRepositoryContract(new PostgresRepository(pool)) instanceof PostgresRepository, true);
});
