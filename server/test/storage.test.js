const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const {S3Client, PutObjectCommand, DeleteObjectCommand} = require("@aws-sdk/client-s3");
const {LocalAssetStore, R2AssetStore} = require("../src/storage");

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xd9]);

function r2Config(overrides = {}) {
  return {r2AccountId: "test-account", r2AccessKeyId: "test-key", r2SecretAccessKey: "test-secret", r2Bucket: "nera-images", r2SignedUrlTtlSeconds: 300, ...overrides};
}

test("LocalAssetStore.signedUrl returns the direct static /uploads URL", async () => {
  const store = new LocalAssetStore({uploadDir: "/tmp/does-not-matter", publicBaseUrl: "http://test"});
  assert.equal(await store.signedUrl("user-1/abc.jpg"), "http://test/uploads/user-1/abc.jpg");
  assert.equal(await store.signedUrl(null), "");
  assert.equal(await store.signedUrl(""), "");
});

test("LocalAssetStore saves a valid image to disk and removes it again", async () => {
  const uploadDir = await fs.mkdtemp(path.join(__dirname, ".tmp-"));
  const store = new LocalAssetStore({uploadDir, publicBaseUrl: "http://test"});
  const stored = await store.save("user-1", {buffer: jpeg, mimetype: "image/jpeg", originalname: "shoe.jpg", size: jpeg.length});
  assert.equal(stored.storageProvider, "local");
  assert.match(stored.storageKey, /^user-1\//);
  await fs.access(path.join(uploadDir, stored.storageKey));
  await store.remove(stored.storageKey);
  await assert.rejects(() => fs.access(path.join(uploadDir, stored.storageKey)));
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("R2AssetStore builds an S3-compatible client for the configured bucket", () => {
  const store = new R2AssetStore(r2Config());
  assert.equal(store.bucket, "nera-images");
  assert.equal(store.signedUrlTtlSeconds, 300);
  assert.ok(store.client instanceof S3Client);
});

test("R2AssetStore.save uploads the processed image bytes under a per-user key and never returns a public URL", async () => {
  const store = new R2AssetStore(r2Config());
  const calls = [];
  store.client.send = async (command) => {
    calls.push(command);
    return {};
  };

  const stored = await store.save("user-42", {buffer: jpeg, mimetype: "image/jpeg", originalname: "blazer.jpg", size: jpeg.length});

  assert.equal(calls.length, 1);
  assert.ok(calls[0] instanceof PutObjectCommand);
  assert.equal(calls[0].input.Bucket, "nera-images");
  assert.match(calls[0].input.Key, /^user-42\/.+\.jpg$/);
  assert.equal(calls[0].input.Body, jpeg);
  assert.equal(calls[0].input.ContentType, "image/jpeg");

  assert.equal(stored.storageProvider, "r2");
  assert.equal(stored.storageKey, calls[0].input.Key);
  assert.equal(stored.mimeType, "image/jpeg");
  assert.equal("publicUrl" in stored, false);
});

test("R2AssetStore.save rejects a file that fails signature validation", async () => {
  const store = new R2AssetStore(r2Config());
  store.client.send = async () => { throw new Error("should not be called"); };
  await assert.rejects(
    () => store.save("user-1", {buffer: Buffer.from("not an image"), mimetype: "image/jpeg", originalname: "fake.jpg", size: 12}),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.code, "INVALID_IMAGE");
      return true;
    },
  );
});

test("R2AssetStore.remove deletes the object by key and is a no-op for an empty key", async () => {
  const store = new R2AssetStore(r2Config());
  const calls = [];
  store.client.send = async (command) => { calls.push(command); return {}; };

  await store.remove("user-1/blazer.jpg");
  assert.equal(calls.length, 1);
  assert.ok(calls[0] instanceof DeleteObjectCommand);
  assert.equal(calls[0].input.Bucket, "nera-images");
  assert.equal(calls[0].input.Key, "user-1/blazer.jpg");

  await store.remove(null);
  assert.equal(calls.length, 1);
});

test("R2AssetStore.signedUrl mints a time-limited GetObject URL and returns empty for no key", async () => {
  const store = new R2AssetStore(r2Config({r2SignedUrlTtlSeconds: 600}));
  const url = await store.signedUrl("user-1/blazer.jpg");
  const parsed = new URL(url);
  assert.equal(parsed.hostname, "test-account.r2.cloudflarestorage.com");
  assert.match(parsed.pathname, /\/nera-images\/user-1\/blazer\.jpg$/);
  assert.equal(parsed.searchParams.get("X-Amz-Expires"), "600");
  assert.ok(parsed.searchParams.get("X-Amz-Signature"));

  assert.equal(await store.signedUrl(""), "");
  assert.equal(await store.signedUrl(null), "");
});

test("R2AssetStore honors an explicit R2_ENDPOINT override", async () => {
  const store = new R2AssetStore(r2Config({r2Endpoint: "https://custom.example.com"}));
  const url = await store.signedUrl("user-1/x.jpg");
  assert.equal(new URL(url).hostname, "custom.example.com");
});
