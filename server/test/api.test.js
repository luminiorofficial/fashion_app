const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const request = require("supertest");
const {createApp} = require("../src/app");
const {loadConfig} = require("../src/config");
const {InMemoryRepository} = require("../src/repository");
const {LocalAssetStore} = require("../src/storage");

async function fixture({smsProvider} = {}) {
  const uploadDir = await fs.mkdtemp(path.join(__dirname, ".tmp-"));
  const config = loadConfig({env: "test", uploadDir, publicBaseUrl: "http://test", otpHashSecret: "a-secure-test-secret-that-is-long-enough"});
  const repository = new InMemoryRepository();
  const app = createApp({config, repository, assetStore: new LocalAssetStore(config), analyzer: {analyzeWardrobe: async () => ({item_name: "Black Blazer", category: "Outerwear", tags: ["black"]}), analyzeProfile: async () => ({body_shape: "Rectangle", skin_tone: "Medium", skin_undertone: "warm", hair_color: "brown", facial_structure: "oval", style_attributes: ["balanced"], styling_notes: "Structured layers work well."})}, smsProvider: smsProvider || {name: "test_console", exposeOtp: true, sendOtp: async () => ({messageId: null})}});
  return {app, repository, uploadDir};
}

async function register(app, phoneNumber = "+919876543210") {
  const start = await request(app).post("/api/v1/auth/otp/request").send({name: "Asha Rao", dateOfBirth: "1996-04-18", phoneNumber}).expect(201);
  const verified = await request(app).post("/api/v1/auth/otp/verify").send({challengeId: start.body.challengeId, otp: start.body.developmentOtp}).expect(200);
  return verified.body.accessToken;
}

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xd9]);

test("registers with verified phone details and creates a session", async () => {
  const {app, uploadDir} = await fixture();
  const token = await register(app);
  const me = await request(app).get("/api/v1/me").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(me.body.user.name, "Asha Rao");
  assert.equal(me.body.user.phoneNumber, "+919876543210");
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("logs in with an existing phone number using OTP", async () => {
  const {app, uploadDir} = await fixture();
  const initial = await request(app).post("/api/v1/auth/otp/request").send({name: "Asha Rao", dateOfBirth: "1996-04-18", phoneNumber: "+919876543210"}).expect(201);
  const registerResponse = await request(app).post("/api/v1/auth/otp/verify").send({challengeId: initial.body.challengeId, otp: initial.body.developmentOtp}).expect(200);

  const login = await request(app).post("/api/v1/auth/otp/request").send({phoneNumber: "+919876543210"}).expect(201);
  const verify = await request(app).post("/api/v1/auth/otp/verify").send({challengeId: login.body.challengeId, otp: login.body.developmentOtp}).expect(200);

  assert.equal(verify.body.user.phoneNumber, "+919876543210");
  assert.equal(verify.body.user.name, "Asha Rao");
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

test("rejects calendar dates that JavaScript would otherwise normalize", async () => {
  const {app, uploadDir} = await fixture();
  const response = await request(app).post("/api/v1/auth/otp/request").send({name: "Asha Rao", dateOfBirth: "1996-02-31", phoneNumber: "+919876543210"}).expect(400);
  assert.equal(response.body.error.code, "INVALID_DATE_OF_BIRTH");
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("rate limits repeated OTP requests for a phone number", async () => {
  const {app, uploadDir} = await fixture();
  const payload = {name: "Asha Rao", dateOfBirth: "1996-04-18", phoneNumber: "+919876543210"};
  for (let attempt = 0; attempt < 5; attempt += 1) await request(app).post("/api/v1/auth/otp/request").send(payload).expect(201);
  const response = await request(app).post("/api/v1/auth/otp/request").send(payload).expect(429);
  assert.equal(response.body.error.code, "OTP_RATE_LIMITED");
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("analyzes a profile image and stores its asset and job relationship", async () => {
  const {app, uploadDir} = await fixture();
  const token = await register(app);
  const response = await request(app).post("/api/v1/profile/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "profile.jpg", contentType: "image/jpeg"}).expect(201);
  assert.equal(response.body.profile.bodyType, "Rectangle");
  assert.ok(response.body.profile.profileImageAssetId);
  assert.equal(response.body.profile.latestAnalysisJobId, response.body.analysisJobId);
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("analyzes, saves, and prevents duplicate use of a wardrobe image", async () => {
  const {app, uploadDir} = await fixture();
  const token = await register(app);
  const analyzed = await request(app).post("/api/v1/wardrobe/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "blazer.jpg", contentType: "image/jpeg"}).expect(201);
  const draft = analyzed.body.draft;
  const payload = {assetId: draft.assetId, analysisJobId: draft.analysisJobId, name: draft.name, category: draft.category, tags: draft.tags};
  await request(app).post("/api/v1/wardrobe/items").set("authorization", `Bearer ${token}`).send(payload).expect(201);
  const duplicate = await request(app).post("/api/v1/wardrobe/items").set("authorization", `Bearer ${token}`).send(payload).expect(409);
  assert.equal(duplicate.body.error.code, "ASSET_IN_USE");
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("soft archives a discarded analyzed draft while removing its file", async () => {
  const {app, uploadDir} = await fixture();
  const token = await register(app);
  const analyzed = await request(app).post("/api/v1/wardrobe/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "shoes.jpg", contentType: "image/jpeg"}).expect(201);
  await request(app).delete(`/api/v1/wardrobe/drafts/${analyzed.body.draft.assetId}`).set("authorization", `Bearer ${token}`).expect(204);
  const files = await fs.readdir(uploadDir, {recursive: true});
  assert.equal(files.filter((entry) => /\.(jpg|png|webp)$/i.test(entry)).length, 0);
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("does not allow one user to claim another user's wardrobe analysis", async () => {
  const {app, uploadDir} = await fixture();
  const firstToken = await register(app, "+919876543210");
  const secondToken = await register(app, "+919876543211");
  const analyzed = await request(app).post("/api/v1/wardrobe/analyze").set("authorization", `Bearer ${secondToken}`).attach("image", jpeg, {filename: "bag.jpg", contentType: "image/jpeg"}).expect(201);
  const draft = analyzed.body.draft;
  await request(app).post("/api/v1/wardrobe/items").set("authorization", `Bearer ${firstToken}`).send({assetId: draft.assetId, analysisJobId: draft.analysisJobId, name: draft.name, category: draft.category, tags: draft.tags}).expect(404);
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("does not expose a Twilio-delivered OTP in the API response", async () => {
  const sent = [];
  const {app, repository, uploadDir} = await fixture({smsProvider: {name: "twilio", exposeOtp: false, sendOtp: async (phoneNumber, otp) => { sent.push({phoneNumber, otp}); return {messageId: "SM123"}; }}});
  const response = await request(app).post("/api/v1/auth/otp/request").send({name: "Asha Rao", dateOfBirth: "1996-04-18", phoneNumber: "+919876543210"}).expect(201);
  assert.equal(response.body.developmentOtp, undefined);
  assert.equal(sent.length, 1);
  const challenge = await repository.getChallenge(response.body.challengeId);
  assert.equal(challenge.providerMessageId, "SM123");
  assert.ok(challenge.submittedAt);
  await fs.rm(uploadDir, {recursive: true, force: true});
});
