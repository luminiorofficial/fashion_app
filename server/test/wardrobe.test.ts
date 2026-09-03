import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import request from "supertest";
import {loadConfig} from "../src/config/env";
import {createApiApp} from "../src/container";
import {createMemoryRepositories} from "../src/database/repositories/memory";
import {DevelopmentSmsProvider} from "../src/providers/sms";
import type {AssetStore, StoredFileMetadata, UploadedFile, GmailApiClient} from "../src/types/provider.types";

const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==", "base64");

class PrivateStore implements AssetStore {
  objects = new Map<string, {buffer: Buffer; mimetype: string}>();
  async save(userId: string, file: UploadedFile): Promise<StoredFileMetadata> {
    const storageKey = `private/${userId}/${crypto.randomUUID()}`;
    this.objects.set(storageKey, {buffer: file.buffer, mimetype: file.mimetype});
    return {storageProvider: "test", storageKey, originalFilename: "image.jpg", mimeType: file.mimetype, byteSize: file.buffer.length, checksumSha256: crypto.createHash("sha256").update(file.buffer).digest("hex")};
  }
  async remove(): Promise<void> {}
  async signedUrl(storageKey: string | null | undefined): Promise<string> { return storageKey ? `https://private.invalid/${storageKey}` : ""; }
  async readBytes(storageKey: string) { const value = this.objects.get(storageKey); if (!value) throw new Error("missing"); return value; }
}

// This suite never configures Google OAuth, so /commerce/gmail routes stay
// gated (503) and this client is never actually called — it only needs to
// satisfy the AppDependencies type.
const noopGmailApiClient: GmailApiClient = {
  buildAuthUrl: () => "https://accounts.google.com/o/oauth2/v2/auth",
  exchangeCode: async () => { throw new Error("not used in this suite"); },
  refreshAccessToken: async () => { throw new Error("not used in this suite"); },
  revokeToken: async () => { /* not used in this suite */ },
  getUserEmail: async () => { throw new Error("not used in this suite"); },
  listMessageIds: async () => ({ids: [], nextPageToken: null}),
  getMessage: async () => { throw new Error("not used in this suite"); },
};

function fixture(overrides: Parameters<typeof loadConfig>[0] = {}) {
  const repositories = createMemoryRepositories();
  const assetStore = new PrivateStore();
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
      analyzeWardrobe: async () => ({item_name: "Casual Shirt", category: "Top", tags: ["shirt"], color: "Navy", material: "Cotton", pattern: "Solid", season: ["Autumn"], occasion: ["Casual"], style: ["Classic"], contains_person: false, garment_visibility: "full", virtual_tryon_eligible: true}),
      validateFullLengthPhoto: async () => ({is_full_length: true, reasons: []}),
      analyzeProfile: async () => ({body_shape: "Rectangle", skin_tone: "Medium", skin_undertone: null, hair_color: null, facial_structure: null, style_attributes: [], styling_notes: ""}),
      suggestOutfit: async ({wardrobe}) => ({wardrobe_item_ids: wardrobe.slice(0, 2).map((item) => item.id), rationale: "Test outfit", suggested_purchase_item: null}),
    },
    tryonProvider: {generate: async () => ({buffer: jpeg, mimeType: "image/jpeg"})},
    weatherProvider: {getCurrentWeather: async () => ({temperatureC: 24, feelsLikeC: 25, humidityPercent: 60, rainProbabilityPercent: 10, condition: "Partly cloudy", windKph: 8})},
    gmailApiClient: noopGmailApiClient,
  });
  return {app, repositories};
}

async function register(app: ReturnType<typeof fixture>["app"], phoneNumber = "+919876543210"): Promise<{token: string; userId: string}> {
  const challenge = await request(app).post("/api/v1/auth/otp/request").send({phoneNumber, name: "Test User", dateOfBirth: "1995-05-05"}).expect(201);
  const verified = await request(app).post("/api/v1/auth/otp/verify").send({challengeId: challenge.body.challengeId, otp: challenge.body.developmentOtp}).expect(200);
  return {token: verified.body.accessToken as string, userId: verified.body.user.id as string};
}

function seedNewPurchaseItem(repositories: ReturnType<typeof fixture>["repositories"], userId: string) {
  return repositories.wardrobe.createWardrobeItem(userId, {
    sourceType: "upload",
    name: "Roadster Men Navy Blue Casual Shirt",
    category: "Top",
    tags: ["shirt"],
    mediaAssetId: null,
    imageStorageKey: null,
    productUrl: null,
    containsPerson: false,
    garmentVisibility: "full",
    virtualTryOnEligible: true,
    sourceMarketplace: "amazon",
    isNew: true,
  });
}

test("a manually added product-link item has no marketplace source and is never flagged NEW", async () => {
  const {app} = fixture();
  const {token} = await register(app);
  const response = await request(app)
    .post("/api/v1/wardrobe/links")
    .set("authorization", `Bearer ${token}`)
    .send({name: "Silk Scarf", category: "Accessory", productUrl: "https://example.com/scarf"})
    .expect(201);
  assert.equal(response.body.item.sourceMarketplace, null);
  assert.equal(response.body.item.isNew, false);
});

test("a manually photographed item has no marketplace source and is never flagged NEW", async () => {
  const {app} = fixture();
  const {token} = await register(app);
  const analyze = await request(app).post("/api/v1/wardrobe/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "shirt.jpg", contentType: "image/jpeg"}).expect(201);
  const draft = analyze.body.draft as {assetId: string; analysisJobId: string; name: string; category: string; tags: string[]};
  const created = await request(app)
    .post("/api/v1/wardrobe/items")
    .set("authorization", `Bearer ${token}`)
    .send({assetId: draft.assetId, analysisJobId: draft.analysisJobId, name: draft.name, category: draft.category, tags: draft.tags})
    .expect(201);
  assert.equal(created.body.item.sourceMarketplace, null);
  assert.equal(created.body.item.isNew, false);
});

// WardrobeService.createWardrobeItem's sourceMarketplace/isNew fields are
// only ever set by its trusted `options` parameter (see
// PurchaseImportService.addToWardrobe), never from WardrobeItemDraftPayload
// (request-body input) — this proves that boundary holds even when a
// client explicitly tries to smuggle both fields through POST /wardrobe/items.
test("a client cannot forge marketplace source or the NEW badge via the create-item request body", async () => {
  const {app} = fixture();
  const {token} = await register(app);
  const analyze = await request(app).post("/api/v1/wardrobe/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "shirt.jpg", contentType: "image/jpeg"}).expect(201);
  const draft = analyze.body.draft as {assetId: string; analysisJobId: string; name: string; category: string; tags: string[]};
  const created = await request(app)
    .post("/api/v1/wardrobe/items")
    .set("authorization", `Bearer ${token}`)
    .send({
      assetId: draft.assetId,
      analysisJobId: draft.analysisJobId,
      name: draft.name,
      category: draft.category,
      tags: draft.tags,
      sourceMarketplace: "amazon",
      isNew: true,
    })
    .expect(201);
  assert.equal(created.body.item.sourceMarketplace, null);
  assert.equal(created.body.item.isNew, false);
});

test("marking a NEW wardrobe item as viewed clears the badge and is idempotent", async () => {
  const {app, repositories} = fixture();
  const {token, userId} = await register(app);
  const item = await seedNewPurchaseItem(repositories, userId);

  const first = await request(app).post(`/api/v1/wardrobe/items/${item.id}/viewed`).set("authorization", `Bearer ${token}`).send().expect(200);
  assert.equal(first.body.item.isNew, false);
  assert.equal(first.body.item.sourceMarketplace, "amazon");

  const second = await request(app).post(`/api/v1/wardrobe/items/${item.id}/viewed`).set("authorization", `Bearer ${token}`).send().expect(200);
  assert.equal(second.body.item.isNew, false);

  const list = await request(app).get("/api/v1/wardrobe/items").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(list.body.items[0].isNew, false);
  assert.equal(list.body.items[0].sourceMarketplace, "amazon");
});

test("marking an item as viewed that was never NEW is a harmless no-op", async () => {
  const {app, repositories} = fixture();
  const {token, userId} = await register(app);
  const item = await repositories.wardrobe.createWardrobeItem(userId, {
    sourceType: "product_link", name: "Silk Scarf", category: "Accessory", tags: [], mediaAssetId: null,
    imageStorageKey: null, productUrl: "https://example.com/scarf", containsPerson: false,
    garmentVisibility: "full", virtualTryOnEligible: false,
  });
  const response = await request(app).post(`/api/v1/wardrobe/items/${item.id}/viewed`).set("authorization", `Bearer ${token}`).send().expect(200);
  assert.equal(response.body.item.isNew, false);
  assert.equal(response.body.item.sourceMarketplace, null);
});

test("a user cannot mark another user's wardrobe item as viewed, and it stays NEW", async () => {
  const {app, repositories} = fixture();
  const owner = await register(app, "+919876543210");
  const item = await seedNewPurchaseItem(repositories, owner.userId);

  const other = await register(app, "+919876500000");
  await request(app).post(`/api/v1/wardrobe/items/${item.id}/viewed`).set("authorization", `Bearer ${other.token}`).send().expect(404);

  const stillNew = await repositories.wardrobe.getWardrobeItem(item.id);
  assert.equal(stillNew?.isNew, true);
});

test("marking a nonexistent wardrobe item as viewed returns 404", async () => {
  const {app} = fixture();
  const {token} = await register(app);
  await request(app).post("/api/v1/wardrobe/items/does-not-exist/viewed").set("authorization", `Bearer ${token}`).send().expect(404);
});
