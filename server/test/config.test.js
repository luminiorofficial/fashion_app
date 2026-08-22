const test = require("node:test");
const assert = require("node:assert/strict");
const {loadConfig} = require("../src/config");

const r2 = {
  r2AccountId: "account",
  r2AccessKeyId: "access-key",
  r2SecretAccessKey: "secret-key",
  r2Bucket: "private-images",
};

test("uses local image storage by default outside production", () => {
  const config = loadConfig({env: "test"});
  assert.equal(config.imageStorageProvider, "local");
});

test("selects R2 when all private storage credentials are configured", () => {
  const config = loadConfig({env: "production", ...r2});
  assert.equal(config.imageStorageProvider, "r2");
});

test("rejects partially configured R2 credentials", () => {
  assert.throws(
    () => loadConfig({env: "development", r2Bucket: "private-images"}),
    /R2 image storage requires/,
  );
});

test("rejects local image storage in production", () => {
  assert.throws(
    () => loadConfig({env: "production", imageStorageProvider: "local", r2AccountId: "", r2AccessKeyId: "", r2SecretAccessKey: "", r2Bucket: ""}),
    /Production image storage must use private Cloudflare R2/,
  );
});

test("rejects an unknown image storage provider", () => {
  assert.throws(
    () => loadConfig({env: "test", imageStorageProvider: "public"}),
    /IMAGE_STORAGE_PROVIDER must be either/,
  );
});