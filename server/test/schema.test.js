const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {wardrobeCategories} = require("../src/validation");
const {InMemoryRepository, assertRepositoryContract} = require("../src/repository");

const migrationsDirectory = path.resolve(__dirname, "../../database/migrations");
const initialSchema = fs.readFileSync(path.join(migrationsDirectory, "001_initial_schema.sql"), "utf8");
const roles = fs.readFileSync(path.join(migrationsDirectory, "002_database_roles.sql"), "utf8");

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

test("application role is explicit and cannot access all tables by default", () => {
  assert.doesNotMatch(roles, /ALL TABLES[\s\S]*TO nera_app/);
  assert.doesNotMatch(roles, /schema_migrations[\s\S]*TO nera_app/);
  assert.match(roles, /GRANT SELECT ON wardrobe_categories TO nera_app/);
});

test("in-memory development adapter satisfies the checked repository contract", () => {
  assert.equal(assertRepositoryContract(new InMemoryRepository()) instanceof InMemoryRepository, true);
});
