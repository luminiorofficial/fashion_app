const test = require("node:test");
const assert = require("node:assert/strict");
const {loadConfig} = require("../src/config");

const r2 = {
  r2AccountId: "account",
  r2AccessKeyId: "access-key",
  r2SecretAccessKey: "secret-key",
  r2Bucket: "private-images",
};

const cloudinary = {
  cloudinaryCloudName: "nera-cloud",
  cloudinaryApiKey: "api-key",
  cloudinaryApiSecret: "api-secret",
};

const databaseUrl = "postgresql://postgres:secret@localhost:5432/nera";

test("uses local image storage by default outside production", () => {
  const config = loadConfig({env: "test"});
  assert.equal(config.imageStorageProvider, "local");
});

test("selects R2 when all private storage credentials are configured", () => {
  const config = loadConfig({env: "production", ...r2, databaseUrl});
  assert.equal(config.imageStorageProvider, "r2");
});

test("selects Cloudinary when all private storage credentials are configured and R2 is not", () => {
  const config = loadConfig({env: "production", ...cloudinary, databaseUrl});
  assert.equal(config.imageStorageProvider, "cloudinary");
});

test("prefers R2 over Cloudinary when both are fully configured and no provider is set explicitly", () => {
  const config = loadConfig({env: "production", ...r2, ...cloudinary, databaseUrl});
  assert.equal(config.imageStorageProvider, "r2");
});

test("rejects partially configured R2 credentials", () => {
  assert.throws(
    () => loadConfig({env: "development", r2Bucket: "private-images"}),
    /R2 image storage requires/,
  );
});

test("rejects partially configured Cloudinary credentials", () => {
  assert.throws(
    () => loadConfig({env: "development", cloudinaryCloudName: "nera-cloud"}),
    /Cloudinary image storage requires/,
  );
});

test("rejects local image storage in production", () => {
  assert.throws(
    () => loadConfig({env: "production", imageStorageProvider: "local", r2AccountId: "", r2AccessKeyId: "", r2SecretAccessKey: "", r2Bucket: "", databaseUrl}),
    /Production image storage must use private Cloudflare R2 or Cloudinary storage/,
  );
});

test("rejects an unknown image storage provider", () => {
  assert.throws(
    () => loadConfig({env: "test", imageStorageProvider: "public"}),
    /IMAGE_STORAGE_PROVIDER must be one of/,
  );
});

test("rejects production without DATABASE_URL, refusing to fall back to the in-memory repository", () => {
  assert.throws(
    () => loadConfig({env: "production", ...r2, databaseUrl: ""}),
    /Production requires DATABASE_URL/,
  );
});

test("allows production with DATABASE_URL configured", () => {
  const config = loadConfig({env: "production", ...cloudinary, databaseUrl});
  assert.equal(config.databaseUrl, databaseUrl);
});