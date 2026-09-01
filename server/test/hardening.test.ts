import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import request from "supertest";
import {loadConfig} from "../src/config/env";
import {createApiApp} from "../src/container";
import {createMemoryRepositories} from "../src/database/repositories/memory";
import {DevelopmentSmsProvider} from "../src/providers/sms";
import {withTransaction} from "../src/database/postgres";
import {isCronAuthorized} from "../api/cron/cleanup";
import {MaintenanceService} from "../src/services/maintenance.service";
import type {AssetStore, StoredFileMetadata, UploadedFile} from "../src/types/provider.types";

const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==", "base64");

class PrivateStore implements AssetStore {
  objects = new Map<string, {buffer: Buffer; mimetype: string}>();
  removed: string[] = [];
  failRemove = false;
  async save(userId: string, file: UploadedFile): Promise<StoredFileMetadata> {
    const storageKey = `private/${userId}/${crypto.randomUUID()}`;
    this.objects.set(storageKey, {buffer: file.buffer, mimetype: file.mimetype});
    return {storageProvider: "test", storageKey, originalFilename: "image.jpg", mimeType: file.mimetype, byteSize: file.buffer.length, checksumSha256: crypto.createHash("sha256").update(file.buffer).digest("hex")};
  }
  async remove(storageKey: string): Promise<void> { this.removed.push(storageKey); if (this.failRemove) throw new Error("storage unavailable"); this.objects.delete(storageKey); }
  async signedUrl(storageKey: string | null | undefined): Promise<string> { return storageKey ? `https://private.invalid/${storageKey}` : ""; }
  async readBytes(storageKey: string) { const value = this.objects.get(storageKey); if (!value) throw new Error("missing"); return value; }
}

function fixture(overrides: Parameters<typeof loadConfig>[0] = {}, assetStore = new PrivateStore()) {
  const repositories = createMemoryRepositories();
  const config = loadConfig({
    env: "test",
    allowedOrigins: ["https://app.example.com"],
    otpHashSecret: "test-secret-long-enough-for-hmac",
    rateLimitAuthMax: 100,
    rateLimitApiMax: 100,
    rateLimitProfileAnalysisMax: 100,
    otpDailyIpLimit: 100,
    otpDailyPhoneLimit: 100,
    ...overrides,
  });
  const app = createApiApp({
    config,
    repositories,
    assetStore,
    smsProvider: new DevelopmentSmsProvider(),
    textAnalyzer: {
      analyzeWardrobe: async () => ({item_name: "Top", category: "Top", tags: [], color: "Blue", material: "Cotton", pattern: "Solid", season: [], occasion: [], style: [], contains_person: false, garment_visibility: "full", virtual_tryon_eligible: true}),
      validateFullLengthPhoto: async () => ({is_full_length: true, reasons: []}),
      analyzeProfile: async () => ({body_shape: "Rectangle", skin_tone: "Medium", skin_undertone: null, hair_color: null, facial_structure: null, style_attributes: [], styling_notes: ""}),
      suggestOutfit: async ({wardrobe}) => ({wardrobe_item_ids: wardrobe.slice(0, 2).map((item) => item.id), rationale: "Test outfit", suggested_purchase_item: null}),
    },
    tryonProvider: {generate: async () => ({buffer: jpeg, mimeType: "image/jpeg"})},
    weatherProvider: {
      getCurrentWeather: async () => ({
        temperatureC: 24,
        feelsLikeC: 25,
        humidityPercent: 60,
        rainProbabilityPercent: 10,
        condition: "Partly cloudy",
        windKph: 8,
      }),
    },
  });
  return {app, repositories, assetStore};
}

async function register(app: ReturnType<typeof fixture>["app"], phoneNumber = "+919876543210") {
  const challenge = await request(app).post("/api/v1/auth/otp/request").send({phoneNumber, name: "Test User", dateOfBirth: "1995-05-05"}).expect(201);
  const verified = await request(app).post("/api/v1/auth/otp/verify").send({challengeId: challenge.body.challengeId, otp: challenge.body.developmentOtp}).expect(200);
  return verified.body.accessToken as string;
}

test("requires authentication and emits tracing/security headers", async () => {
  const {app} = fixture();
  const response = await request(app).get("/api/v1/profile").expect(401);
  assert.match(response.headers["x-request-id"] || "", /^[0-9a-f-]{36}$/);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.body.error.code, "AUTH_REQUIRED");
});

test("allows configured CORS origins and rejects unknown preflights", async () => {
  const {app} = fixture();
  const allowed = await request(app).options("/api/v1/profile").set("origin", "https://app.example.com").expect(204);
  assert.equal(allowed.headers["access-control-allow-origin"], "https://app.example.com");
  const denied = await request(app).options("/api/v1/profile").set("origin", "https://evil.example").expect(403);
  assert.equal(denied.headers["access-control-allow-origin"], undefined);
});

test("enforces OTP resend cooldown and maximum verification attempts", async () => {
  const {app} = fixture({otpResendCooldownSeconds: 3600});
  const body = {phoneNumber: "+919876543210", name: "Test User", dateOfBirth: "1995-05-05"};
  const challenge = await request(app).post("/api/v1/auth/otp/request").send(body).expect(201);
  await request(app).post("/api/v1/auth/otp/request").send(body).expect(429);
  const wrongOtp = challenge.body.developmentOtp === "000000" ? "111111" : "000000";
  for (let attempt = 0; attempt < 5; attempt += 1) await request(app).post("/api/v1/auth/otp/verify").send({challengeId: challenge.body.challengeId, otp: wrongOtp}).expect(401);
  const exhausted = await request(app).post("/api/v1/auth/otp/verify").send({challengeId: challenge.body.challengeId, otp: wrongOtp}).expect(429);
  assert.equal(exhausted.body.error.code, "OTP_ATTEMPTS_EXCEEDED");
});

test("rejects malformed image bytes before analysis", async () => {
  const {app} = fixture();
  const token = await register(app);
  const response = await request(app).post("/api/v1/profile/analyze").set("authorization", `Bearer ${token}`).attach("image", Buffer.from("not an image"), {filename: "fake.jpg", contentType: "image/jpeg"}).expect(400);
  assert.equal(response.body.error.code, "INVALID_IMAGE");
});

test("returns 429 when an AI daily quota is exhausted", async () => {
  const {app} = fixture({aiDailyProfileAnalysisLimit: 1, aiMonthlyProfileAnalysisLimit: 2});
  const token = await register(app);
  const first = await request(app).post("/api/v1/profile/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "profile.jpg", contentType: "image/jpeg"}).expect(201);
  assert.equal(first.body.profile.profileImageAssetId, undefined);
  assert.equal(first.body.profile.profileImageStorageKey, undefined);
  assert.equal(first.body.profile.latestAnalysisJobId, undefined);
  assert.equal(first.body.analysisJobId, undefined);
  const response = await request(app).post("/api/v1/profile/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "profile.jpg", contentType: "image/jpeg"}).expect(429);
  assert.equal(response.body.error.code, "AI_QUOTA_EXCEEDED");
});

test("blocks duplicate paid AI requests with the same idempotency key", async () => {
  const {app} = fixture({aiDailyProfileAnalysisLimit: 3});
  const token = await register(app);
  const submit = () => request(app).post("/api/v1/profile/analyze").set("authorization", `Bearer ${token}`).set("idempotency-key", "profile-upload-0001").attach("image", jpeg, {filename: "profile.jpg", contentType: "image/jpeg"});
  await submit().expect(201);
  const duplicate = await submit().expect(409);
  assert.equal(duplicate.body.error.code, "DUPLICATE_AI_REQUEST");
});

test("does not expose or delete another user's wardrobe resource", async () => {
  const {app, repositories} = fixture();
  const firstToken = await register(app, "+919876543210");
  await register(app, "+919876543211");
  const second = await repositories.users.findUserByPhone("+919876543211");
  const item = await repositories.wardrobe.createWardrobeItem(second!.id, {sourceType: "product_link", name: "Private Bag", category: "Accessory", tags: [], mediaAssetId: null, imageStorageKey: null, productUrl: "https://example.com/bag", containsPerson: false, garmentVisibility: "full", virtualTryOnEligible: false});
  const list = await request(app).get("/api/v1/wardrobe/items").set("authorization", `Bearer ${firstToken}`).expect(200);
  assert.equal(list.body.items.some((entry: {id: string}) => entry.id === item.id), false);
  await request(app).delete(`/api/v1/wardrobe/items/${item.id}`).set("authorization", `Bearer ${firstToken}`).expect(404);
});

test("account deletion revokes access and tolerates storage cleanup failure", async () => {
  const store = new PrivateStore();
  const {app} = fixture({}, store);
  const token = await register(app);
  await request(app).post("/api/v1/profile/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "profile.jpg", contentType: "image/jpeg"}).expect(201);
  store.failRemove = true;
  await request(app).delete("/api/v1/account").set("authorization", `Bearer ${token}`).expect(204);
  assert.ok(store.removed.length > 0);
  await request(app).get("/api/v1/me").set("authorization", `Bearer ${token}`).expect(401);
});

test("production cron requires the configured bearer secret", () => {
  assert.equal(isCronAuthorized(undefined, "secret", true), false);
  assert.equal(isCronAuthorized("Bearer wrong", "secret", true), false);
  assert.equal(isCronAuthorized("Bearer secret", "secret", true), true);
  assert.equal(isCronAuthorized(undefined, "", false), true);
});

test("database transactions roll back when work fails", async () => {
  const calls: string[] = [];
  const client = {query: async (sql: string) => { calls.push(sql); }, release: () => calls.push("RELEASE")};
  const pool = {connect: async () => client};
  await assert.rejects(withTransaction(pool as never, async () => { throw new Error("boom"); }), /boom/);
  assert.deepEqual(calls, ["BEGIN", "ROLLBACK", "RELEASE"]);
});

test("cleanup keeps a durable media retry row when storage deletion fails", async () => {
  const repositories = createMemoryRepositories();
  const user = await repositories.users.findOrCreateUser({name: "Test User", dateOfBirth: "1995-05-05", phoneNumber: "+919876543210"});
  const asset = await repositories.assets.createAsset({userId: user.id, purpose: "wardrobe_item", storageProvider: "test", storageKey: "private/orphan", originalFilename: "orphan.jpg", mimeType: "image/jpeg", byteSize: jpeg.length, checksumSha256: crypto.createHash("sha256").update(jpeg).digest("hex")});
  const store = new PrivateStore();
  store.failRemove = true;
  const maintenance = new MaintenanceService(repositories, store, {otpRetentionDays: 1, sessionRetentionDays: 1, analysisJobRetentionDays: 1, mediaAssetRetentionDays: -1, tryonUnsavedRetentionHours: 1, aiUsageRetentionDays: 1});
  const summary = await maintenance.runCleanup();
  assert.equal(summary.archivedOrphanedMediaAssets, 1);
  assert.equal(summary.deletedMediaAssets, 0);
  const retryRows = await repositories.assets.listPurgeableMediaAssets(new Date(Date.now() + 60_000).toISOString());
  assert.equal(retryRows.some((row) => row.id === asset.id), true);
});
