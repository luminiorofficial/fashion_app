const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const request = require("supertest");
const {createApp} = require("../src/app");
const {loadConfig} = require("../src/config");
const {InMemoryRepository} = require("../src/repository");
const {LocalAssetStore} = require("../src/storage");

async function fixture() {
  const uploadDir = await fs.mkdtemp(path.join(__dirname, ".tmp-"));
  const config = loadConfig({env: "test", uploadDir, publicBaseUrl: "http://test", otpHashSecret: "a-secure-test-secret-that-is-long-enough"});
  const repository = new InMemoryRepository();
  const app = createApp({config, repository, assetStore: new LocalAssetStore(config), analyzer: {analyzeWardrobe: async () => ({item_name: "Black Blazer", category: "Outerwear", tags: ["black"]}), analyzeProfile: async () => ({body_shape: "Rectangle", skin_tone: "Medium", skin_undertone: "warm", hair_color: "brown", facial_structure: "oval", style_attributes: ["balanced"], styling_notes: "Structured layers work well."})}, smsProvider: {sendOtp: async () => {}}});
  return {app, uploadDir};
}

async function register(app) {
  const start = await request(app).post("/api/v1/auth/otp/request").send({name: "Asha Rao", dateOfBirth: "1996-04-18", phoneNumber: "+919876543210"}).expect(201);
  const verified = await request(app).post("/api/v1/auth/otp/verify").send({challengeId: start.body.challengeId, otp: start.body.developmentOtp}).expect(200);
  return verified.body.accessToken;
}

test("registers with verified phone details and creates a session", async () => {
  const {app, uploadDir} = await fixture();
  const token = await register(app);
  const me = await request(app).get("/api/v1/me").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(me.body.user.name, "Asha Rao");
  assert.equal(me.body.user.phoneNumber, "+919876543210");
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("adds a product link to the authenticated user's wardrobe", async () => {
  const {app, uploadDir} = await fixture();
  const token = await register(app);
  await request(app).post("/api/v1/wardrobe/links").set("authorization", `Bearer ${token}`).send({name: "Leather Tote", category: "Accessory", productUrl: "https://shop.example/tote", tags: ["Leather", "work"]}).expect(201);
  const list = await request(app).get("/api/v1/wardrobe/items").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(list.body.items[0].sourceType, "product_link");
  assert.equal(list.body.items[0].productUrl, "https://shop.example/tote");
  await fs.rm(uploadDir, {recursive: true, force: true});
});
