const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const request = require("supertest");
const sharp = require("sharp");
const {createApp} = require("../src/app");
const {loadConfig} = require("../src/config");
const {InMemoryRepository} = require("../src/repository");
const {LocalAssetStore} = require("../src/storage");
const {ApiError} = require("../src/errors");

// A private object store double: unlike LocalAssetStore it never returns a
// stored/static URL. signedUrl() mints a fresh, distinguishable URL on every
// call, so tests can prove the API resolves image URLs on demand rather than
// persisting one, and remove()/save() are tracked so deletion flows can be
// asserted against.
class FakePrivateAssetStore {
  constructor() {
    this.objects = new Map();
    this.removed = [];
    this.signCalls = [];
  }
  async save(userId, file) {
    const storageKey = `${userId}/${this.objects.size}-${file.originalname || "image"}`;
    this.objects.set(storageKey, file.buffer);
    return {storageProvider: "fake-private", storageKey, originalFilename: file.originalname, mimeType: file.mimetype, byteSize: file.buffer.length, checksumSha256: "deadbeef"};
  }
  async remove(storageKey) {
    if (!storageKey) return;
    this.objects.delete(storageKey);
    this.removed.push(storageKey);
  }
  async signedUrl(storageKey) {
    if (!storageKey) return "";
    this.signCalls.push(storageKey);
    return `https://signed.example/${storageKey}?expires=${this.signCalls.length}`;
  }
}

async function fixture({smsProvider, analyzer, assetStore} = {}) {
  const uploadDir = await fs.mkdtemp(path.join(__dirname, ".tmp-"));
  const config = loadConfig({env: "test", uploadDir, publicBaseUrl: "http://test", otpHashSecret: "a-secure-test-secret-that-is-long-enough"});
  const repository = new InMemoryRepository();
  const defaultAnalyzer = {
    analyzeWardrobe: async () => ({item_name: "Black Blazer", category: "Outerwear", tags: ["black"], color: "Black", material: "Wool", pattern: "Solid", season: ["Autumn", "Winter"], occasion: ["Work"], style: ["Classic"]}),
    analyzeProfile: async () => ({body_shape: "Rectangle", skin_tone: "Medium", skin_undertone: "warm", hair_color: "brown", facial_structure: "oval", style_attributes: ["balanced"], styling_notes: "Structured layers work well."}),
    suggestOutfit: async ({wardrobe}) => ({wardrobe_item_ids: wardrobe.slice(0, 2).map((item) => item.id), rationale: "A polished, balanced look selected from your wardrobe."}),
  };
  const app = createApp({config, repository, assetStore: assetStore || new LocalAssetStore(config), analyzer: {...defaultAnalyzer, ...analyzer}, smsProvider: smsProvider || {name: "test_console", exposeOtp: true, sendOtp: async () => ({messageId: null})}});
  return {app, repository, uploadDir};
}

async function addWardrobeItem(app, token, {name, category, tags}) {
  const response = await request(app).post("/api/v1/wardrobe/links").set("authorization", `Bearer ${token}`).send({name, category, productUrl: `https://shop.example/${encodeURIComponent(name)}`, tags: tags || []}).expect(201);
  return response.body.item;
}

async function register(app, phoneNumber = "+919876543210") {
  const start = await request(app).post("/api/v1/auth/otp/request").send({name: "Asha Rao", dateOfBirth: "1996-04-18", phoneNumber}).expect(201);
  const verified = await request(app).post("/api/v1/auth/otp/verify").send({challengeId: start.body.challengeId, otp: start.body.developmentOtp}).expect(200);
  return verified.body.accessToken;
}

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xd9]);
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

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

test("accepts profile uploads that use a generic content type but a valid PNG signature", async () => {
  const {app, uploadDir} = await fixture();
  const token = await register(app);
  const response = await request(app).post("/api/v1/profile/analyze").set("authorization", `Bearer ${token}`).attach("image", png, {filename: "profile.png", contentType: "application/octet-stream"}).expect(201);
  assert.equal(response.body.profile.bodyType, "Rectangle");
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("stores a processed version of uploaded images instead of the original file", async () => {
  const {app, uploadDir} = await fixture();
  const token = await register(app);
  const original = await sharp({create: {width: 2200, height: 1600, channels: 3, background: {r: 255, g: 255, b: 255}}}).png().toBuffer();
  await request(app).post("/api/v1/profile/analyze").set("authorization", `Bearer ${token}`).attach("image", original, {filename: "profile.png", contentType: "image/png"}).expect(201);
  const files = await fs.readdir(uploadDir, {recursive: true});
  const storedFiles = files.filter((entry) => typeof entry === "string" && /\.(jpg|jpeg|png|webp)$/i.test(entry));
  assert.ok(storedFiles.length > 0);
  assert.ok(storedFiles.some((entry) => /\.(jpg|jpeg|webp)$/i.test(entry)));
  assert.ok(!storedFiles.some((entry) => /\.png$/i.test(entry)));
  const storedBuffer = await fs.readFile(path.join(uploadDir, storedFiles[0]));
  assert.equal(storedBuffer[0], 0xff);
  assert.equal(storedBuffer[1], 0xd8);
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

test("stores the AI-analyzed color, material, pattern, season, occasion, and style metadata on a saved wardrobe item", async () => {
  const {app, uploadDir} = await fixture();
  const token = await register(app);
  const analyzed = await request(app).post("/api/v1/wardrobe/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "blazer.jpg", contentType: "image/jpeg"}).expect(201);
  const draft = analyzed.body.draft;
  assert.deepEqual(draft.season, ["Autumn", "Winter"]);
  assert.deepEqual(draft.occasion, ["Work"]);
  assert.deepEqual(draft.style, ["Classic"]);
  const saved = await request(app).post("/api/v1/wardrobe/items").set("authorization", `Bearer ${token}`).send({assetId: draft.assetId, analysisJobId: draft.analysisJobId, name: draft.name, category: draft.category, tags: draft.tags}).expect(201);
  assert.equal(saved.body.item.primaryColor, "Black");
  assert.equal(saved.body.item.material, "Wool");
  assert.equal(saved.body.item.pattern, "Solid");
  assert.deepEqual(saved.body.item.season, ["Autumn", "Winter"]);
  assert.deepEqual(saved.body.item.occasion, ["Work"]);
  assert.deepEqual(saved.body.item.styleTags, ["Classic"]);
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

test("generates an outfit from the authenticated user's wardrobe and profile, and persists it", async () => {
  const receivedCalls = [];
  const {app, repository, uploadDir} = await fixture({analyzer: {
    suggestOutfit: async (args) => {
      receivedCalls.push(args);
      return {wardrobe_item_ids: [args.wardrobe[0].id, args.wardrobe[1].id], rationale: "A polished work-appropriate look."};
    },
  }});
  const token = await register(app);
  const top = await addWardrobeItem(app, token, {name: "Silk Blouse", category: "Top"});
  const bottom = await addWardrobeItem(app, token, {name: "Tailored Trouser", category: "Bottom"});
  await request(app).post("/api/v1/profile/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "profile.jpg", contentType: "image/jpeg"}).expect(201);

  const response = await request(app).post("/api/v1/outfits/generate").set("authorization", `Bearer ${token}`).send({eventType: "Work Meeting"}).expect(201);

  assert.equal(response.body.outfit.eventType, "Work Meeting");
  assert.deepEqual(new Set(response.body.outfit.wardrobeItemIds), new Set([top.id, bottom.id]));
  assert.equal(response.body.outfit.rationale, "A polished work-appropriate look.");
  assert.ok(response.body.outfit.id);
  assert.equal(receivedCalls[0].eventType, "Work Meeting");
  assert.equal(receivedCalls[0].profile.bodyType, "Rectangle");
  assert.equal(receivedCalls[0].wardrobe.length, 2);
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("rejects an unsupported event type", async () => {
  const {app, uploadDir} = await fixture();
  const token = await register(app);
  await addWardrobeItem(app, token, {name: "Silk Blouse", category: "Top"});
  await addWardrobeItem(app, token, {name: "Tailored Trouser", category: "Bottom"});
  const response = await request(app).post("/api/v1/outfits/generate").set("authorization", `Bearer ${token}`).send({eventType: "Rave"}).expect(400);
  assert.equal(response.body.error.code, "INVALID_EVENT_TYPE");
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("requires at least two wardrobe items before generating an outfit", async () => {
  const {app, uploadDir} = await fixture();
  const token = await register(app);
  await addWardrobeItem(app, token, {name: "Silk Blouse", category: "Top"});
  const response = await request(app).post("/api/v1/outfits/generate").set("authorization", `Bearer ${token}`).send({eventType: "Daily"}).expect(400);
  assert.equal(response.body.error.code, "WARDROBE_TOO_SMALL");
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("drops wardrobe ids the AI hallucinated and keeps only real, owned wardrobe items", async () => {
  const {app, uploadDir} = await fixture({analyzer: {
    suggestOutfit: async ({wardrobe}) => ({wardrobe_item_ids: ["not-a-real-id", wardrobe.find((item) => item.name === "Silk Blouse").id], rationale: "A relaxed daily look."}),
  }});
  const token = await register(app);
  const top = await addWardrobeItem(app, token, {name: "Silk Blouse", category: "Top"});
  await addWardrobeItem(app, token, {name: "Tailored Trouser", category: "Bottom"});
  const response = await request(app).post("/api/v1/outfits/generate").set("authorization", `Bearer ${token}`).send({eventType: "Daily"}).expect(201);
  assert.deepEqual(response.body.outfit.wardrobeItemIds, [top.id]);
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("fails with a friendly error when the AI returns no valid wardrobe items", async () => {
  const {app, uploadDir} = await fixture({analyzer: {
    suggestOutfit: async () => ({wardrobe_item_ids: ["not-a-real-id"], rationale: "n/a"}),
  }});
  const token = await register(app);
  await addWardrobeItem(app, token, {name: "Silk Blouse", category: "Top"});
  await addWardrobeItem(app, token, {name: "Tailored Trouser", category: "Bottom"});
  const response = await request(app).post("/api/v1/outfits/generate").set("authorization", `Bearer ${token}`).send({eventType: "Daily"}).expect(502);
  assert.equal(response.body.error.code, "INVALID_OUTFIT_SELECTION");
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("does not let one user generate an outfit from another user's wardrobe", async () => {
  const {app, uploadDir} = await fixture();
  const firstToken = await register(app, "+919876543210");
  const secondToken = await register(app, "+919876543211");
  await addWardrobeItem(app, firstToken, {name: "Silk Blouse", category: "Top"});
  await addWardrobeItem(app, firstToken, {name: "Tailored Trouser", category: "Bottom"});
  const response = await request(app).post("/api/v1/outfits/generate").set("authorization", `Bearer ${secondToken}`).send({eventType: "Daily"}).expect(400);
  assert.equal(response.body.error.code, "WARDROBE_TOO_SMALL");
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("resolves wardrobe images through the asset store's signed URL instead of a stored public URL", async () => {
  const assetStore = new FakePrivateAssetStore();
  const {app, uploadDir} = await fixture({assetStore});
  const token = await register(app);

  const analyzed = await request(app).post("/api/v1/wardrobe/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "blazer.jpg", contentType: "image/jpeg"}).expect(201);
  assert.match(analyzed.body.draft.imageUrl, /^https:\/\/signed\.example\//);
  const signCallsAfterAnalyze = assetStore.signCalls.length;
  assert.ok(signCallsAfterAnalyze > 0);

  const draft = analyzed.body.draft;
  const saved = await request(app).post("/api/v1/wardrobe/items").set("authorization", `Bearer ${token}`).send({assetId: draft.assetId, analysisJobId: draft.analysisJobId, name: draft.name, category: draft.category, tags: draft.tags}).expect(201);
  assert.match(saved.body.item.imageUrl, /^https:\/\/signed\.example\//);

  // Listing the wardrobe again mints a fresh signed URL rather than replaying
  // a value that was persisted at save time.
  const list = await request(app).get("/api/v1/wardrobe/items").set("authorization", `Bearer ${token}`).expect(200);
  assert.match(list.body.items[0].imageUrl, /^https:\/\/signed\.example\//);
  assert.ok(assetStore.signCalls.length > signCallsAfterAnalyze);
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("resolves the profile image through the asset store's signed URL", async () => {
  const assetStore = new FakePrivateAssetStore();
  const {app, uploadDir} = await fixture({assetStore});
  const token = await register(app);

  const analyzed = await request(app).post("/api/v1/profile/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "profile.jpg", contentType: "image/jpeg"}).expect(201);
  assert.match(analyzed.body.profile.profileImageUrl, /^https:\/\/signed\.example\//);

  const fetched = await request(app).get("/api/v1/profile").set("authorization", `Bearer ${token}`).expect(200);
  assert.match(fetched.body.profile.profileImageUrl, /^https:\/\/signed\.example\//);
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("deletes the orphaned image and archives its asset when profile analysis rejects the photo after it was stored", async () => {
  const assetStore = new FakePrivateAssetStore();
  const {app, repository, uploadDir} = await fixture({assetStore, analyzer: {
    analyzeProfile: async () => { throw new ApiError(400, "FULL_LENGTH_PHOTO_REQUIRED", "Full-length photo required."); },
  }});
  const token = await register(app);

  const response = await request(app).post("/api/v1/profile/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "profile.jpg", contentType: "image/jpeg"}).expect(400);

  assert.equal(response.body.error.code, "FULL_LENGTH_PHOTO_REQUIRED");
  assert.equal(assetStore.objects.size, 0);
  assert.equal(assetStore.removed.length, 1);
  const profile = await repository.getProfile((await repository.findUserByPhone("+919876543210")).id);
  assert.equal(profile.profileImageAssetId, undefined);
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("deletes the orphaned image when a wardrobe analysis fails after the image is stored", async () => {
  const assetStore = new FakePrivateAssetStore();
  const {app, uploadDir} = await fixture({assetStore, analyzer: {
    analyzeWardrobe: async () => { throw new Error("the analysis service is down"); },
  }});
  const token = await register(app);

  await request(app).post("/api/v1/wardrobe/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "blazer.jpg", contentType: "image/jpeg"}).expect(500);

  assert.equal(assetStore.objects.size, 0);
  assert.equal(assetStore.removed.length, 1);
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("deletes the previous profile image once a re-analysis successfully replaces it", async () => {
  const assetStore = new FakePrivateAssetStore();
  const {app, uploadDir} = await fixture({assetStore});
  const token = await register(app);

  const first = await request(app).post("/api/v1/profile/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "profile-1.jpg", contentType: "image/jpeg"}).expect(201);
  assert.equal(assetStore.objects.size, 1);
  assert.equal(assetStore.removed.length, 0);
  const [firstStorageKey] = assetStore.objects.keys();

  const second = await request(app).post("/api/v1/profile/analyze").set("authorization", `Bearer ${token}`).attach("image", png, {filename: "profile-2.jpg", contentType: "image/jpeg"}).expect(201);

  assert.equal(assetStore.objects.size, 1);
  assert.deepEqual(assetStore.removed, [firstStorageKey]);
  assert.notEqual(second.body.profile.profileImageUrl, first.body.profile.profileImageUrl);
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("removes the underlying object from the asset store when a wardrobe item is deleted", async () => {
  const assetStore = new FakePrivateAssetStore();
  const {app, uploadDir} = await fixture({assetStore});
  const token = await register(app);

  const analyzed = await request(app).post("/api/v1/wardrobe/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "blazer.jpg", contentType: "image/jpeg"}).expect(201);
  const draft = analyzed.body.draft;
  const saved = await request(app).post("/api/v1/wardrobe/items").set("authorization", `Bearer ${token}`).send({assetId: draft.assetId, analysisJobId: draft.analysisJobId, name: draft.name, category: draft.category, tags: draft.tags}).expect(201);
  assert.equal(assetStore.objects.size, 1);
  const [storageKey] = assetStore.objects.keys();

  await request(app).delete(`/api/v1/wardrobe/items/${saved.body.item.id}`).set("authorization", `Bearer ${token}`).expect(204);

  assert.deepEqual(assetStore.removed, [storageKey]);
  assert.equal(assetStore.objects.size, 0);
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("deleting a product-link wardrobe item (no image) does not touch the asset store", async () => {
  const assetStore = new FakePrivateAssetStore();
  const {app, uploadDir} = await fixture({assetStore});
  const token = await register(app);
  const item = await addWardrobeItem(app, token, {name: "Leather Tote", category: "Accessory"});

  await request(app).delete(`/api/v1/wardrobe/items/${item.id}`).set("authorization", `Bearer ${token}`).expect(204);

  assert.deepEqual(assetStore.removed, []);
  await fs.rm(uploadDir, {recursive: true, force: true});
});

test("removes the underlying object from the asset store when a wardrobe draft is discarded", async () => {
  const assetStore = new FakePrivateAssetStore();
  const {app, uploadDir} = await fixture({assetStore});
  const token = await register(app);

  const analyzed = await request(app).post("/api/v1/wardrobe/analyze").set("authorization", `Bearer ${token}`).attach("image", jpeg, {filename: "shoes.jpg", contentType: "image/jpeg"}).expect(201);
  assert.equal(assetStore.objects.size, 1);

  await request(app).delete(`/api/v1/wardrobe/drafts/${analyzed.body.draft.assetId}`).set("authorization", `Bearer ${token}`).expect(204);

  assert.equal(assetStore.objects.size, 0);
  assert.equal(assetStore.removed.length, 1);
  await fs.rm(uploadDir, {recursive: true, force: true});
});
