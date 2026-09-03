import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import request from "supertest";
import {loadConfig} from "../src/config/env";
import {createApiApp} from "../src/container";
import {createMemoryRepositories} from "../src/database/repositories/memory";
import {DevelopmentSmsProvider} from "../src/providers/sms";
import type {AssetStore, StoredFileMetadata, UploadedFile, GmailApiClient, GoogleTokenResponse, NormalizedGmailMessage} from "../src/types/provider.types";

const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==", "base64");
const TEST_IMAGE_URL = "https://m.media-amazon.com/images/I/test-purchase._SY500_.jpg";
const ORDER_ID = "402-1234567-7654321";
const ASIN = "B08XYZ1234";

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

// Controllable double for Google OAuth + Gmail REST calls: tests seed
// `messagesById` with fixture NormalizedGmailMessages and push their ids
// onto `messageIdsQueue` before calling POST /commerce/gmail/sync, rather
// than hitting the real Google APIs.
class FakeGmailApiClient implements GmailApiClient {
  authUrls: string[] = [];
  revokedTokens: string[] = [];
  refreshedTokens: string[] = [];
  messagesById = new Map<string, NormalizedGmailMessage>();
  messageIdsQueue: string[] = [];

  buildAuthUrl({state}: {state: string; redirectUri: string; scope: string}): string {
    const url = `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}`;
    this.authUrls.push(url);
    return url;
  }
  async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    return {accessToken: `access-${code}`, refreshToken: `refresh-${code}`, expiresInSeconds: 3600, scope: "https://www.googleapis.com/auth/gmail.readonly", tokenType: "Bearer"};
  }
  async refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
    this.refreshedTokens.push(refreshToken);
    return {accessToken: `access-refreshed-${refreshToken}`, refreshToken: null, expiresInSeconds: 3600, scope: null, tokenType: "Bearer"};
  }
  async revokeToken(token: string): Promise<void> { this.revokedTokens.push(token); }
  async getUserEmail(): Promise<string> { return "shopper@gmail.com"; }
  async listMessageIds(): Promise<{ids: string[]; nextPageToken: string | null}> {
    return {ids: [...this.messageIdsQueue], nextPageToken: null};
  }
  async getMessage(_accessToken: string, messageId: string): Promise<NormalizedGmailMessage> {
    const message = this.messagesById.get(messageId);
    if (!message) throw new Error(`FakeGmailApiClient: no fixture message registered for ${messageId}`);
    return message;
  }
}

function gmailMessage(overrides: Partial<NormalizedGmailMessage>): NormalizedGmailMessage {
  return {id: "msg-1", internalDate: String(Date.now()), from: "auto-confirm@amazon.in", subject: "", textBody: "", htmlBody: "", ...overrides};
}

const deliveredFashionMessage = gmailMessage({
  id: "msg-delivered-fashion",
  from: "shipment-tracking@amazon.in",
  subject: 'Your Amazon.in order of "Roadster Men Navy Blue Casual Shirt" has been delivered.',
  textBody: `Order #${ORDER_ID}\nSize: L | Colour: Navy Blue`,
  htmlBody: `<html><body><img src="${TEST_IMAGE_URL.replace("._SY500_", "._SY88_")}"/><a href="https://www.amazon.in/dp/${ASIN}">link</a></body></html>`,
});
const nonFashionDeliveredMessage = gmailMessage({
  id: "msg-delivered-electronics",
  from: "shipment-tracking@amazon.in",
  subject: 'Your Amazon.in order of "Redmi 10 Prime Smartphone" has been delivered.',
  textBody: "Order #999-1111111-2222222",
});
const cancelledSameOrderMessage = gmailMessage({
  id: "msg-cancelled",
  from: "auto-confirm@amazon.in",
  subject: "Your order has been cancelled",
  textBody: `Order #${ORDER_ID}`,
});
// One order's full lifecycle, each stage a separate email arriving in its
// own sync call — confirmed, shipped, out for delivery (classified as
// "shipped", not "delivered" — see amazon-email.parser.ts's STATUS_KEYWORDS),
// then delivered. Only the confirmed email's HTML carries the ASIN link, so
// the later three fall back to the order-id-only ("weak") match in
// PostgresPurchaseImportsRepository/MemoryPurchaseImportsRepository.findExisting
// — proving that fallback, not just the ASIN-based "strong" match, keeps
// everything on one row.
const lifecycleConfirmedMessage = gmailMessage({
  id: "msg-lifecycle-confirmed",
  internalDate: String(Date.parse("2026-02-01T10:00:00Z")),
  from: "auto-confirm@amazon.in",
  subject: 'Your Amazon.in order of "Roadster Men Navy Blue Casual Shirt" has been placed.',
  textBody: `Order #${ORDER_ID}`,
  htmlBody: `<html><body><a href="https://www.amazon.in/dp/${ASIN}">link</a></body></html>`,
});
const lifecycleShippedMessage = gmailMessage({
  id: "msg-lifecycle-shipped",
  internalDate: String(Date.parse("2026-02-02T10:00:00Z")),
  from: "shipment-tracking@amazon.in",
  subject: `Your package with "Roadster Men Navy Blue..." has shipped!`,
  textBody: `Order #${ORDER_ID}`,
});
const lifecycleOutForDeliveryMessage = gmailMessage({
  id: "msg-lifecycle-out-for-delivery",
  internalDate: String(Date.parse("2026-02-03T10:00:00Z")),
  from: "shipment-tracking@amazon.in",
  subject: "Your package is out for delivery today",
  textBody: `Order #${ORDER_ID}`,
});
const lifecycleDeliveredMessage = gmailMessage({
  id: "msg-lifecycle-delivered",
  internalDate: String(Date.parse("2026-02-04T10:00:00Z")),
  from: "shipment-tracking@amazon.in",
  subject: `Your Amazon.in order of "Roadster Shirt" has been delivered.`,
  textBody: `Order #${ORDER_ID}`,
});

// Not an Amazon sender, so this exercises the generic fallback parser
// (server/src/commerce/parsers/generic-email.parser.ts) rather than
// AmazonEmailParser — see gmail-parser.service.ts's registration order.
const deliveredGenericFashionMessage = gmailMessage({
  id: "msg-generic-delivered-fashion",
  from: "orders@nykaafashion.com",
  subject: "Your order has been delivered!",
  textBody: "Order ID: NYK7788990 has been delivered.\n\nItem: Libas Women Floral Print Anarkali Kurta\nSize: M | Colour: Pink\nOrder Total: Rs. 1299.00",
  htmlBody: '<html><body><img src="https://images.nykaafashion.com/products/NYK7788990/main.jpg" alt="Libas Women Floral Print Anarkali Kurta"/></body></html>',
});
const promotionalGenericMessage = gmailMessage({
  id: "msg-generic-promo",
  from: "orders@nykaafashion.com",
  subject: "Your order confirmed — Sale: extra 20% off your next order!",
  textBody: "Order ID: NYK1112223. Shop now and save.",
});

function fixture(overrides: Parameters<typeof loadConfig>[0] = {}) {
  const repositories = createMemoryRepositories();
  const assetStore = new PrivateStore();
  const gmailApiClient = new FakeGmailApiClient();
  const config = loadConfig({
    env: "test",
    allowedOrigins: ["https://app.example.com"],
    otpHashSecret: "test-secret-long-enough-for-hmac",
    rateLimitAuthMax: 200,
    rateLimitApiMax: 200,
    rateLimitProfileAnalysisMax: 100,
    otpDailyIpLimit: 100,
    otpDailyPhoneLimit: 100,
    googleClientId: "test-client-id",
    googleClientSecret: "test-client-secret",
    commerceTokenEncryptionKey: "test-commerce-encryption-key-value",
    gmailSyncRateLimitMax: 50,
    gmailMaxMessagesPerSyncRun: 50,
    gmailSyncBudgetMs: 30_000,
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
    gmailApiClient,
  });
  return {app, repositories, gmailApiClient};
}

async function register(app: ReturnType<typeof fixture>["app"], phoneNumber = "+919876543210") {
  const challenge = await request(app).post("/api/v1/auth/otp/request").send({phoneNumber, name: "Test User", dateOfBirth: "1995-05-05"}).expect(201);
  const verified = await request(app).post("/api/v1/auth/otp/verify").send({challengeId: challenge.body.challengeId, otp: challenge.body.developmentOtp}).expect(200);
  return verified.body.accessToken as string;
}

function extractState(authUrl: string): string {
  return new URL(authUrl).searchParams.get("state") as string;
}

async function connectGmail(app: ReturnType<typeof fixture>["app"], token: string) {
  const connect = await request(app).post("/api/v1/commerce/gmail/connect").set("authorization", `Bearer ${token}`).send().expect(201);
  const state = extractState(connect.body.authUrl);
  const callback = await request(app).get(`/api/v1/commerce/gmail/oauth/callback?code=test-code&state=${encodeURIComponent(state)}`).expect(200);
  assert.match(callback.text, /connected/i);
}

test("Gmail routes return 503 when Google OAuth is not configured", async () => {
  const {app} = fixture({googleClientId: "", googleClientSecret: ""});
  const token = await register(app);
  const response = await request(app).post("/api/v1/commerce/gmail/connect").set("authorization", `Bearer ${token}`).send().expect(503);
  assert.equal(response.body.error.code, "GMAIL_INTEGRATION_NOT_CONFIGURED");
});

test("connects Gmail via signed state and reports status without ever exposing a Google token", async () => {
  const {app} = fixture();
  const token = await register(app);
  await connectGmail(app, token);

  const status = await request(app).get("/api/v1/commerce/gmail/status").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(status.body.connected, true);
  assert.equal(status.body.email, "shopper@gmail.com");
  assert.equal(JSON.stringify(status.body).includes("access-"), false);
  assert.equal(JSON.stringify(status.body).includes("refresh-"), false);
});

test("refreshes a near-expired access token before syncing and persists the new expiry", async () => {
  const {app, repositories, gmailApiClient} = fixture();
  const token = await register(app);
  await connectGmail(app, token);

  const me = await request(app).get("/api/v1/me").set("authorization", `Bearer ${token}`).expect(200);
  const connection = await repositories.gmail.getConnectionByUserId(me.body.user.id as string);
  assert.ok(connection);
  await repositories.gmail.updateConnection(connection!.id, {accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString()});

  gmailApiClient.messagesById.set(deliveredFashionMessage.id, deliveredFashionMessage);
  gmailApiClient.messageIdsQueue = [deliveredFashionMessage.id];
  await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);

  assert.equal(gmailApiClient.refreshedTokens.length, 1);
  const refreshed = await repositories.gmail.getConnectionById(connection!.id);
  assert.equal(refreshed?.status, "connected");
  assert.ok(new Date(refreshed!.accessTokenExpiresAt as string).getTime() > Date.now());
});

test("the OAuth callback never returns a JSON error, even on an invalid state", async () => {
  const {app} = fixture();
  const response = await request(app).get("/api/v1/commerce/gmail/oauth/callback?code=x&state=not-a-real-state").expect(200);
  assert.match(response.headers["content-type"] || "", /html/);
  assert.match(response.text, /could not connect/i);
});

test("sync creates a pending purchase for a delivered fashion item and skips a non-fashion delivered item", async () => {
  const {app, gmailApiClient} = fixture();
  const token = await register(app);
  await connectGmail(app, token);

  gmailApiClient.messagesById.set(deliveredFashionMessage.id, deliveredFashionMessage);
  gmailApiClient.messagesById.set(nonFashionDeliveredMessage.id, nonFashionDeliveredMessage);
  gmailApiClient.messageIdsQueue = [deliveredFashionMessage.id, nonFashionDeliveredMessage.id];

  const sync = await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);
  assert.equal(sync.body.processed, 2);
  assert.equal(sync.body.hasMore, false);

  const purchases = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(purchases.body.purchases.length, 1);
  assert.equal(purchases.body.purchases[0].marketplace, "amazon");
  assert.equal(purchases.body.purchases[0].productName, "Roadster Men Navy Blue Casual Shirt");
  assert.equal(purchases.body.purchases[0].sizeLabel, "L");
  assert.equal(purchases.body.purchases[0].colorLabel, "Navy Blue");
});

test("re-syncing the same messages does not create duplicate purchases", async () => {
  const {app, gmailApiClient} = fixture();
  const token = await register(app);
  await connectGmail(app, token);
  gmailApiClient.messagesById.set(deliveredFashionMessage.id, deliveredFashionMessage);
  gmailApiClient.messageIdsQueue = [deliveredFashionMessage.id];

  await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);
  const secondSync = await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);
  assert.equal(secondSync.body.processed, 0);

  const purchases = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(purchases.body.purchases.length, 1);
});

test("confirmed, shipped, out-for-delivery, and delivered emails for one order all update the same purchase across separate sync calls", async () => {
  const {app, gmailApiClient} = fixture();
  const token = await register(app);
  await connectGmail(app, token);

  gmailApiClient.messagesById.set(lifecycleConfirmedMessage.id, lifecycleConfirmedMessage);
  gmailApiClient.messageIdsQueue = [lifecycleConfirmedMessage.id];
  await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);
  // Not delivered yet, so nothing is actionable in the review queue.
  assert.equal((await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200)).body.purchases.length, 0);

  gmailApiClient.messagesById.set(lifecycleShippedMessage.id, lifecycleShippedMessage);
  gmailApiClient.messageIdsQueue = [lifecycleShippedMessage.id];
  await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);
  assert.equal((await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200)).body.purchases.length, 0);

  gmailApiClient.messagesById.set(lifecycleOutForDeliveryMessage.id, lifecycleOutForDeliveryMessage);
  gmailApiClient.messageIdsQueue = [lifecycleOutForDeliveryMessage.id];
  await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);
  assert.equal((await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200)).body.purchases.length, 0);

  gmailApiClient.messagesById.set(lifecycleDeliveredMessage.id, lifecycleDeliveredMessage);
  gmailApiClient.messageIdsQueue = [lifecycleDeliveredMessage.id];
  await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);

  const purchases = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(purchases.body.purchases.length, 1, "exactly one purchase candidate must exist across the whole four-stage lifecycle");
  assert.equal(purchases.body.purchases[0].productName, "Roadster Men Navy Blue Casual Shirt");

  // Re-syncing the entire backlog again (e.g. the client re-requesting an
  // overlapping date window) must stay idempotent too.
  gmailApiClient.messageIdsQueue = [lifecycleConfirmedMessage.id, lifecycleShippedMessage.id, lifecycleOutForDeliveryMessage.id, lifecycleDeliveredMessage.id];
  const resync = await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);
  assert.equal(resync.body.processed, 0);
  const afterResync = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(afterResync.body.purchases.length, 1);
});

// The in-flight-sync mutex itself (GmailSyncService.syncConnection
// rejecting a second concurrent call for the same connection with 409) is
// covered deterministically at the unit level in gmail-sync-service.test.ts
// — reproducing genuine request overlap through the full HTTP stack here
// would need gating supertest's request dispatch, which is lazy/thenable
// and not reliably synchronizable without risking a hung test run.

test("a later cancellation email removes a still-pending purchase from view but never touches an already-imported one", async () => {
  const {app, gmailApiClient} = fixture();
  const token = await register(app);
  await connectGmail(app, token);
  gmailApiClient.messagesById.set(deliveredFashionMessage.id, deliveredFashionMessage);
  gmailApiClient.messageIdsQueue = [deliveredFashionMessage.id];
  await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);

  const pending = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200);
  const purchaseId = pending.body.purchases[0].id as string;

  gmailApiClient.messagesById.set(cancelledSameOrderMessage.id, cancelledSameOrderMessage);
  gmailApiClient.messageIdsQueue = [cancelledSameOrderMessage.id];
  await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);

  const afterCancel = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(afterCancel.body.purchases.length, 0);

  // Re-registering under a fresh scenario: an already-imported purchase must
  // survive a later cancellation email for the same order untouched.
  const {app: app2, gmailApiClient: gmailApiClient2} = fixture();
  const token2 = await register(app2);
  await connectGmail(app2, token2);
  gmailApiClient2.messagesById.set(deliveredFashionMessage.id, deliveredFashionMessage);
  gmailApiClient2.messageIdsQueue = [deliveredFashionMessage.id];
  await request(app2).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token2}`).send().expect(200);
  const pending2 = await request(app2).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token2}`).expect(200);
  const importedPurchaseId = pending2.body.purchases[0].id as string;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => (String(input) === TEST_IMAGE_URL ? new Response(jpeg, {status: 200, headers: {"content-type": "image/jpeg"}}) : originalFetch(input as never))) as typeof fetch;
  try {
    await request(app2).post(`/api/v1/commerce/purchases/${importedPurchaseId}/add-to-wardrobe`).set("authorization", `Bearer ${token2}`).send().expect(201);
  } finally {
    globalThis.fetch = originalFetch;
  }

  gmailApiClient2.messagesById.set(cancelledSameOrderMessage.id, cancelledSameOrderMessage);
  gmailApiClient2.messageIdsQueue = [cancelledSameOrderMessage.id];
  await request(app2).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token2}`).send().expect(200);

  const wardrobe = await request(app2).get("/api/v1/wardrobe/items").set("authorization", `Bearer ${token2}`).expect(200);
  assert.equal(wardrobe.body.items.length, 1);
  assert.equal(purchaseId !== importedPurchaseId, true);
});

test("add to wardrobe downloads the captured product image and reuses the AI-analysis pipeline", async () => {
  const {app, gmailApiClient} = fixture();
  const token = await register(app);
  await connectGmail(app, token);
  gmailApiClient.messagesById.set(deliveredFashionMessage.id, deliveredFashionMessage);
  gmailApiClient.messageIdsQueue = [deliveredFashionMessage.id];
  await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);
  const pending = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200);
  const purchaseId = pending.body.purchases[0].id as string;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => (String(input) === TEST_IMAGE_URL ? new Response(jpeg, {status: 200, headers: {"content-type": "image/jpeg"}}) : originalFetch(input as never))) as typeof fetch;
  let created: {item: {id: string; name: string; category: string; primaryColor: string | null}};
  try {
    const response = await request(app).post(`/api/v1/commerce/purchases/${purchaseId}/add-to-wardrobe`).set("authorization", `Bearer ${token}`).send().expect(201);
    created = response.body;
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(created.item.name, "Roadster Men Navy Blue Casual Shirt");
  assert.equal(created.item.category, "Top");
  assert.equal(created.item.primaryColor, "Navy");

  const afterImport = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(afterImport.body.purchases.length, 0);

  const wardrobe = await request(app).get("/api/v1/wardrobe/items").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(wardrobe.body.items.length, 1);
});

test("ignore removes a purchase from the pending list without touching the wardrobe", async () => {
  const {app, gmailApiClient} = fixture();
  const token = await register(app);
  await connectGmail(app, token);
  gmailApiClient.messagesById.set(deliveredFashionMessage.id, deliveredFashionMessage);
  gmailApiClient.messageIdsQueue = [deliveredFashionMessage.id];
  await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);
  const pending = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200);
  const purchaseId = pending.body.purchases[0].id as string;

  await request(app).post(`/api/v1/commerce/purchases/${purchaseId}/ignore`).set("authorization", `Bearer ${token}`).send().expect(204);
  const afterIgnore = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(afterIgnore.body.purchases.length, 0);
  const wardrobe = await request(app).get("/api/v1/wardrobe/items").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(wardrobe.body.items.length, 0);
});

test("disconnect updates (not deletes) the connection and purchase history remains listable", async () => {
  const {app, gmailApiClient} = fixture();
  const token = await register(app);
  await connectGmail(app, token);
  gmailApiClient.messagesById.set(deliveredFashionMessage.id, deliveredFashionMessage);
  gmailApiClient.messageIdsQueue = [deliveredFashionMessage.id];
  await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);

  await request(app).delete("/api/v1/commerce/gmail/connection").set("authorization", `Bearer ${token}`).expect(204);
  assert.equal(gmailApiClient.revokedTokens.length, 1);

  const status = await request(app).get("/api/v1/commerce/gmail/status").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(status.body.connected, false);

  const purchases = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(purchases.body.purchases.length, 1);
});

test("sync detects a delivered fashion purchase from a non-Amazon allow-listed retailer via the generic fallback parser", async () => {
  const {app, gmailApiClient} = fixture();
  const token = await register(app);
  await connectGmail(app, token);
  gmailApiClient.messagesById.set(deliveredGenericFashionMessage.id, deliveredGenericFashionMessage);
  gmailApiClient.messageIdsQueue = [deliveredGenericFashionMessage.id];

  const sync = await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);
  assert.equal(sync.body.processed, 1);

  const purchases = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(purchases.body.purchases.length, 1);
  assert.equal(purchases.body.purchases[0].marketplace, "other");
  assert.equal(purchases.body.purchases[0].productName, "Libas Women Floral Print Anarkali Kurta");
  assert.equal(purchases.body.purchases[0].sizeLabel, "M");
  assert.equal(purchases.body.purchases[0].colorLabel, "Pink");
});

test("sync never creates a purchase from a promotional email, even from an allow-listed generic retailer domain", async () => {
  const {app, gmailApiClient} = fixture();
  const token = await register(app);
  await connectGmail(app, token);
  gmailApiClient.messagesById.set(promotionalGenericMessage.id, promotionalGenericMessage);
  gmailApiClient.messageIdsQueue = [promotionalGenericMessage.id];

  const sync = await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${token}`).send().expect(200);
  assert.equal(sync.body.processed, 1);

  const purchases = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${token}`).expect(200);
  assert.equal(purchases.body.purchases.length, 0);
});

test("a user cannot act on another user's purchase", async () => {
  const {app, gmailApiClient} = fixture();
  const ownerToken = await register(app, "+919876543210");
  await connectGmail(app, ownerToken);
  gmailApiClient.messagesById.set(deliveredFashionMessage.id, deliveredFashionMessage);
  gmailApiClient.messageIdsQueue = [deliveredFashionMessage.id];
  await request(app).post("/api/v1/commerce/gmail/sync").set("authorization", `Bearer ${ownerToken}`).send().expect(200);
  const pending = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${ownerToken}`).expect(200);
  const purchaseId = pending.body.purchases[0].id as string;

  const otherToken = await register(app, "+919876500000");
  await request(app).post(`/api/v1/commerce/purchases/${purchaseId}/ignore`).set("authorization", `Bearer ${otherToken}`).send().expect(404);
  const otherPurchases = await request(app).get("/api/v1/commerce/purchases").set("authorization", `Bearer ${otherToken}`).expect(200);
  assert.equal(otherPurchases.body.purchases.length, 0);
});
