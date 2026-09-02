import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type {Pool} from "pg";
import {wardrobeCategories} from "../src/config/constants";
import {createMemoryRepositories} from "../src/database/repositories/memory";
import {assertRepositoriesContract} from "../src/database/repositories/contract";
import {
  PostgresUsersRepository, PostgresSessionsRepository, PostgresOtpRepository, PostgresAssetsRepository,
  PostgresProfilesRepository, PostgresWardrobeRepository, PostgresOutfitsRepository, PostgresTryOnRepository,
  PostgresSecurityRepository, PostgresGmailRepository, PostgresPurchaseImportsRepository,
} from "../src/database/repositories/postgres";

const migrationsDirectory = path.resolve(__dirname, "../../database/migrations");
const initialSchema = fs.readFileSync(path.join(migrationsDirectory, "001_initial_schema.sql"), "utf8");
const roles = fs.readFileSync(path.join(migrationsDirectory, "002_database_roles.sql"), "utf8");
const feedbackAndTryon = fs.readFileSync(path.join(migrationsDirectory, "003_feedback_and_tryon.sql"), "utf8");
const productionHardening = fs.readFileSync(path.join(migrationsDirectory, "005_production_hardening.sql"), "utf8");
const gmailCommerceIntegration = fs.readFileSync(path.join(migrationsDirectory, "006_gmail_commerce_integration.sql"), "utf8");

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

test("production hardening migration adds distributed limits, AI usage, and cleanup indexes", () => {
  assert.match(productionHardening, /CREATE TABLE rate_limit_buckets/);
  assert.match(productionHardening, /CREATE TABLE ai_usage_events/);
  assert.match(productionHardening, /ai_usage_idempotency_uk/);
  assert.match(productionHardening, /auth_sessions_expiry_idx/);
  assert.match(productionHardening, /media_assets_orphan_scan_idx/);
  assert.match(productionHardening, /tryon_unsaved_cleanup_idx/);
  assert.match(productionHardening, /GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_buckets, ai_usage_events TO nera_app/);
  assert.match(productionHardening, /^BEGIN;[\s\S]*COMMIT;\s*$/);
});

test("Gmail commerce migration adds gmail_connections, purchase_imports, and gmail_processed_messages inside a single transaction", () => {
  const tables = [...gmailCommerceIntegration.matchAll(/CREATE TABLE\s+([a-z_]+)/g)].map((match) => match[1]);
  assert.deepEqual(tables, ["gmail_connections", "purchase_imports", "gmail_processed_messages"]);
  assert.match(gmailCommerceIntegration, /purchase_import_connection_owner_fk/);
  assert.match(gmailCommerceIntegration, /purchase_import_wardrobe_owner_fk/);
  assert.match(gmailCommerceIntegration, /REFERENCES wardrobe_items\(id, user_id\) ON DELETE SET NULL/);
  assert.match(gmailCommerceIntegration, /CREATE UNIQUE INDEX purchase_imports_order_uk ON purchase_imports \(user_id, marketplace, order_id, product_identity\) WHERE order_id IS NOT NULL/);
  assert.match(gmailCommerceIntegration, /CREATE UNIQUE INDEX purchase_imports_no_order_uk ON purchase_imports \(user_id, marketplace, product_identity\) WHERE order_id IS NULL/);
  assert.match(gmailCommerceIntegration, /GRANT SELECT, INSERT, UPDATE, DELETE ON gmail_connections, purchase_imports, gmail_processed_messages TO nera_app/);
  assert.match(gmailCommerceIntegration, /^BEGIN;[\s\S]*COMMIT;\s*$/);
});

test("in-memory development adapter satisfies the checked repository contract", () => {
  assert.doesNotThrow(() => assertRepositoriesContract(createMemoryRepositories()));
});

test("PostgreSQL adapter satisfies the checked repository contract", () => {
  const pool = {query() { throw new Error("not used by this contract test"); }} as unknown as Pool;
  assert.doesNotThrow(() =>
    assertRepositoriesContract({
      users: new PostgresUsersRepository(pool),
      sessions: new PostgresSessionsRepository(pool),
      otp: new PostgresOtpRepository(pool),
      assets: new PostgresAssetsRepository(pool),
      profiles: new PostgresProfilesRepository(pool),
      wardrobe: new PostgresWardrobeRepository(pool),
      outfits: new PostgresOutfitsRepository(pool),
      tryon: new PostgresTryOnRepository(pool),
      security: new PostgresSecurityRepository(pool),
      gmail: new PostgresGmailRepository(pool),
      purchaseImports: new PostgresPurchaseImportsRepository(pool),
      health: async () => ({status: "ok", adapter: "postgresql"}),
      close: async () => {},
    }),
  );
});
