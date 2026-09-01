import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import {PassThrough} from "node:stream";
import sharp from "sharp";
import {LocalAssetStore} from "../src/providers/storage/local.provider";
import {CloudinaryAssetStore, type CloudinaryClient, type CloudinaryConfig} from "../src/providers/cloudinary/cloudinary.provider";
import {processUploadedFile} from "../src/utils/image-processing";
import {ApiError} from "../src/utils/api-error";
import type {UploadedFile} from "../src/types/provider.types";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xd9]);

// A real, decodable, deliberately large/detailed JPEG (random-noise pixels
// compress poorly, closer to a busy real photo than a flat color) so the
// adaptive quality/dimension ladder in processUploadedFile actually has to
// do work to hit each profile's target ceiling.
async function largeNoisyJpeg(size = 2000): Promise<Buffer> {
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < pixels.length; i += 1) pixels[i] = Math.floor(Math.random() * 256);
  return sharp(pixels, {raw: {width: size, height: size, channels: 3}}).jpeg({quality: 95}).toBuffer();
}

async function dimensionsOf(buffer: Buffer): Promise<number> {
  const metadata = await sharp(buffer).metadata();
  return Math.max(metadata.width || 0, metadata.height || 0);
}

function cloudinaryConfig(overrides: Partial<CloudinaryConfig> = {}): CloudinaryConfig {
  return {cloudinaryCloudName: "test-cloud", cloudinaryApiKey: "test-key", cloudinaryApiSecret: "test-secret", cloudinaryFolder: "nera", cloudinaryAuthTokenKey: "", cloudinarySignedUrlTtlSeconds: 300, ...overrides};
}

interface FakeCloudinaryClient {
  calls: {
    config: unknown[];
    uploads: {options: Record<string, unknown>; buffer: Buffer}[];
    destroys: {publicId: string; options: Record<string, unknown>}[];
    urls: {publicId: string; options: Record<string, unknown>}[];
  };
  config: (options: unknown) => void;
  uploader: {
    upload_stream: (options: Record<string, unknown>, callback: (error: Error | null, result: {public_id: string; format: string; resource_type: string; bytes: number} | null) => void) => PassThrough;
    destroy: (publicId: string, options: Record<string, unknown>) => Promise<{result: string}>;
  };
  url: (publicId: string, options: Record<string, unknown>) => string;
}

// A fake of the Cloudinary SDK surface CloudinaryAssetStore relies on. It
// never touches the network: upload_stream buffers whatever is piped to it
// and resolves synchronously, matching the real SDK's stream contract
// without requiring live Cloudinary credentials in tests.
function fakeCloudinaryClient(): FakeCloudinaryClient {
  const calls: FakeCloudinaryClient["calls"] = {config: [], uploads: [], destroys: [], urls: []};
  return {
    calls,
    config: (options) => {
      calls.config.push(options);
    },
    uploader: {
      upload_stream(options, callback) {
        const stream = new PassThrough();
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          const buffer = Buffer.concat(chunks);
          calls.uploads.push({options, buffer});
          callback(null, {public_id: options.public_id as string, format: "jpg", resource_type: "image", bytes: buffer.length});
        });
        return stream;
      },
      async destroy(publicId, options) {
        calls.destroys.push({publicId, options});
        return {result: "ok"};
      },
    },
    url(publicId, options) {
      calls.urls.push({publicId, options});
      const format = options.format ? `.${options.format as string}` : "";
      return `https://res.cloudinary.com/test-cloud/image/authenticated/s--fakesig--/${publicId}${format}`;
    },
  };
}

const file = (): UploadedFile => ({buffer: jpeg, mimetype: "image/jpeg", originalname: "photo.jpg", size: jpeg.length});

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

test("CloudinaryAssetStore configures the SDK client from the given credentials", () => {
  const client = fakeCloudinaryClient();
  new CloudinaryAssetStore(cloudinaryConfig(), client as unknown as CloudinaryClient);
  assert.deepEqual(client.calls.config, [{cloud_name: "test-cloud", api_key: "test-key", api_secret: "test-secret", secure: true}]);
});

test("CloudinaryAssetStore.save uploads the processed image bytes under an authenticated, per-user public id and never returns a public URL", async () => {
  const client = fakeCloudinaryClient();
  const store = new CloudinaryAssetStore(cloudinaryConfig(), client as unknown as CloudinaryClient);

  const stored = await store.save("user-42", {buffer: jpeg, mimetype: "image/jpeg", originalname: "blazer.jpg", size: jpeg.length}, "wardrobe_item");

  assert.equal(client.calls.uploads.length, 1);
  const [upload] = client.calls.uploads;
  assert.equal(upload!.options.type, "authenticated");
  assert.equal(upload!.options.resource_type, "image");
  assert.match(upload!.options.public_id as string, /^nera\/wardrobe\/user-42\/[0-9a-f-]+$/);
  assert.equal(upload!.options.asset_folder, "nera/wardrobe");
  assert.deepEqual(upload!.buffer, jpeg);

  assert.equal(stored.storageProvider, "cloudinary");
  assert.equal(stored.storageKey, upload!.options.public_id);
  assert.equal(stored.mimeType, "image/jpeg");
  assert.equal("publicUrl" in stored, false);
});

test("CloudinaryAssetStore.save routes each purpose into its own sub-folder, keyed only by userId (never a hardcoded id), and sets asset_folder to match for Dynamic Folder Media Library visibility", async () => {
  const client = fakeCloudinaryClient();
  const store = new CloudinaryAssetStore(cloudinaryConfig(), client as unknown as CloudinaryClient);

  const profile = await store.save("user-7", file(), "profile_analysis");
  const wardrobe = await store.save("user-7", file(), "wardrobe_item");
  const tryon = await store.save("user-9", file(), "tryon_result");

  assert.match(profile.storageKey, /^nera\/profiles\/user-7\/[0-9a-f-]+$/);
  assert.match(wardrobe.storageKey, /^nera\/wardrobe\/user-7\/[0-9a-f-]+$/);
  assert.match(tryon.storageKey, /^nera\/tryons\/user-9\/[0-9a-f-]+$/);

  const [profileUpload, wardrobeUpload, tryonUpload] = client.calls.uploads;
  assert.equal(profileUpload!.options.public_id, profile.storageKey);
  assert.equal(profileUpload!.options.asset_folder, "nera/profiles");
  assert.equal(wardrobeUpload!.options.public_id, wardrobe.storageKey);
  assert.equal(wardrobeUpload!.options.asset_folder, "nera/wardrobe");
  assert.equal(tryonUpload!.options.public_id, tryon.storageKey);
  assert.equal(tryonUpload!.options.asset_folder, "nera/tryons");
});

test("CloudinaryAssetStore.save falls back to the flat per-user layout (and flat asset_folder) for an unmapped or missing purpose", async () => {
  const client = fakeCloudinaryClient();
  const store = new CloudinaryAssetStore(cloudinaryConfig(), client as unknown as CloudinaryClient);

  const noPurpose = await store.save("user-1", file());
  const unknownPurpose = await store.save("user-1", file(), "something_else");

  assert.match(noPurpose.storageKey, /^nera\/user-1\/[0-9a-f-]+$/);
  assert.match(unknownPurpose.storageKey, /^nera\/user-1\/[0-9a-f-]+$/);

  const [noPurposeUpload, unknownPurposeUpload] = client.calls.uploads;
  assert.equal(noPurposeUpload!.options.asset_folder, "nera");
  assert.equal(unknownPurposeUpload!.options.asset_folder, "nera");
});

test("CloudinaryAssetStore.save rejects a file that fails signature validation", async () => {
  const client = fakeCloudinaryClient();
  const store = new CloudinaryAssetStore(cloudinaryConfig(), client as unknown as CloudinaryClient);
  await assert.rejects(
    () => store.save("user-1", {buffer: Buffer.from("not an image"), mimetype: "image/jpeg", originalname: "fake.jpg", size: 12}),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 400);
      assert.equal(error.code, "INVALID_IMAGE");
      return true;
    },
  );
  assert.equal(client.calls.uploads.length, 0);
});

test("CloudinaryAssetStore.save propagates an upload failure from the SDK", async () => {
  const client = fakeCloudinaryClient();
  client.uploader.upload_stream = (_options, callback) => {
    const stream = new PassThrough();
    stream.on("data", () => {});
    stream.on("end", () => callback(new Error("cloudinary is down"), null));
    return stream;
  };
  const store = new CloudinaryAssetStore(cloudinaryConfig(), client as unknown as CloudinaryClient);
  await assert.rejects(
    () => store.save("user-1", {buffer: jpeg, mimetype: "image/jpeg", originalname: "blazer.jpg", size: jpeg.length}),
    /cloudinary is down/,
  );
});

test("CloudinaryAssetStore.remove destroys the object by public id under the authenticated type and is a no-op for an empty key", async () => {
  const client = fakeCloudinaryClient();
  const store = new CloudinaryAssetStore(cloudinaryConfig(), client as unknown as CloudinaryClient);

  await store.remove("nera/user-1/blazer");
  assert.equal(client.calls.destroys.length, 1);
  assert.equal(client.calls.destroys[0]!.publicId, "nera/user-1/blazer");
  assert.equal(client.calls.destroys[0]!.options.type, "authenticated");
  assert.equal(client.calls.destroys[0]!.options.resource_type, "image");

  await store.remove(null as unknown as string);
  assert.equal(client.calls.destroys.length, 1);
});

test("CloudinaryAssetStore.signedUrl mints a private, authenticated delivery URL and returns empty for no key", async () => {
  const client = fakeCloudinaryClient();
  const store = new CloudinaryAssetStore(cloudinaryConfig(), client as unknown as CloudinaryClient);

  const url = await store.signedUrl("nera/user-1/blazer");
  assert.equal(url, "https://res.cloudinary.com/test-cloud/image/authenticated/s--fakesig--/nera/user-1/blazer.jpg");
  assert.equal(client.calls.urls.length, 1);
  const [call] = client.calls.urls;
  assert.equal(call!.options.type, "authenticated");
  assert.equal(call!.options.sign_url, true);
  assert.equal(call!.options.format, "jpg");
  assert.equal("auth_token" in call!.options, false);

  assert.equal(await store.signedUrl(""), "");
  assert.equal(await store.signedUrl(null), "");
});

test("CloudinaryAssetStore.signedUrl handles extensionless and extension-bearing public IDs", async () => {
  const client = fakeCloudinaryClient();
  const store = new CloudinaryAssetStore(cloudinaryConfig(), client as unknown as CloudinaryClient);

  assert.equal(
    await store.signedUrl("abc/uuid"),
    "https://res.cloudinary.com/test-cloud/image/authenticated/s--fakesig--/abc/uuid.jpg",
  );
  assert.equal(
    await store.signedUrl("abc/uuid.jpg"),
    "https://res.cloudinary.com/test-cloud/image/authenticated/s--fakesig--/abc/uuid.jpg",
  );
  assert.equal(
    await store.signedUrl("abc/uuid.png"),
    "https://res.cloudinary.com/test-cloud/image/authenticated/s--fakesig--/abc/uuid.png",
  );

  assert.equal(client.calls.urls[0]!.options.format, "jpg");
  assert.equal("format" in client.calls.urls[1]!.options, false);
  assert.equal("format" in client.calls.urls[2]!.options, false);
});

test("processUploadedFile compresses a wardrobe_item image to at most 1024px and 150 KB", async () => {
  const original = await largeNoisyJpeg();
  const processed = await processUploadedFile({buffer: original, mimetype: "image/jpeg", originalname: "shoe.jpg", size: original.length}, "wardrobe_item");
  assert.ok(processed!.size <= 150 * 1024, `expected <=150KB, got ${processed!.size}`);
  assert.ok((await dimensionsOf(processed!.buffer)) <= 1024);
});

test("processUploadedFile compresses a profile_analysis image to at most 1280px and 350 KB", async () => {
  const original = await largeNoisyJpeg();
  const processed = await processUploadedFile({buffer: original, mimetype: "image/jpeg", originalname: "profile.jpg", size: original.length}, "profile_analysis");
  assert.ok(processed!.size <= 350 * 1024, `expected <=350KB, got ${processed!.size}`);
  assert.ok((await dimensionsOf(processed!.buffer)) <= 1280);
});

test("processUploadedFile compresses a tryon_result image to at most 1280px and 300 KB", async () => {
  const original = await largeNoisyJpeg();
  const processed = await processUploadedFile({buffer: original, mimetype: "image/jpeg", originalname: "tryon-result.jpg", size: original.length}, "tryon_result");
  assert.ok(processed!.size <= 300 * 1024, `expected <=300KB, got ${processed!.size}`);
  assert.ok((await dimensionsOf(processed!.buffer)) <= 1280);
});

test("processUploadedFile with no purpose keeps today's behavior: 1800px cap, no byte-size target", async () => {
  const original = await largeNoisyJpeg();
  const processed = await processUploadedFile({buffer: original, mimetype: "image/jpeg", originalname: "misc.jpg", size: original.length});
  assert.ok((await dimensionsOf(processed!.buffer)) <= 1800);
  // No profile-specific ceiling applies, so this can legitimately exceed
  // 150/300/350 KB for a large, detailed source image.
});

test("processUploadedFile does not upscale or degrade an image already under a profile's target", async () => {
  const small = await sharp({create: {width: 400, height: 400, channels: 3, background: {r: 200, g: 200, b: 200}}}).jpeg({quality: 80}).toBuffer();
  const processed = await processUploadedFile({buffer: small, mimetype: "image/jpeg", originalname: "small.jpg", size: small.length}, "wardrobe_item");
  assert.equal(await dimensionsOf(processed!.buffer), 400);
});

test("CloudinaryAssetStore.signedUrl includes an expiring auth token when CLOUDINARY_AUTH_TOKEN_KEY is configured", async () => {
  const client = fakeCloudinaryClient();
  const store = new CloudinaryAssetStore(cloudinaryConfig({cloudinaryAuthTokenKey: "token-signing-key", cloudinarySignedUrlTtlSeconds: 600}), client as unknown as CloudinaryClient);

  await store.signedUrl("nera/user-1/blazer");
  const [call] = client.calls.urls;
  assert.deepEqual(call!.options.auth_token, {key: "token-signing-key", duration: 600});
});
