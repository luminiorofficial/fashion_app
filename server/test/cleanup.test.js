const test = require("node:test");
const assert = require("node:assert/strict");
const {InMemoryRepository} = require("../src/repository");
const {runCleanup} = require("../src/cleanup");

const config = {
  otpRetentionDays: 7,
  sessionRetentionDays: 30,
  analysisJobRetentionDays: 14,
  mediaAssetRetentionDays: 14,
  tryonUnsavedRetentionHours: 24,
};

function daysAgo(days) { return new Date(Date.now() - days * 86_400_000).toISOString(); }
function hoursAgo(hours) { return new Date(Date.now() - hours * 3_600_000).toISOString(); }

function fakeAssetStore() {
  const removed = [];
  return {removed, async remove(storageKey) { if (storageKey) removed.push(storageKey); }};
}

test("deletes OTP challenges older than the retention window, keeping recent ones", async () => {
  const repository = new InMemoryRepository();
  const old = await repository.createChallenge({id: "old", phoneNumber: "+919876543210", purpose: "login", otpHash: "a".repeat(64), provider: "test", expiresAt: new Date(Date.now() + 1000).toISOString(), maxAttempts: 5});
  old.createdAt = daysAgo(10);
  await repository.createChallenge({id: "recent", phoneNumber: "+919876543211", purpose: "login", otpHash: "a".repeat(64), provider: "test", expiresAt: new Date(Date.now() + 1000).toISOString(), maxAttempts: 5});

  const summary = await runCleanup({repository, assetStore: fakeAssetStore(), config});

  assert.equal(summary.deletedOtpChallenges, 1);
  assert.equal(await repository.getChallenge("old"), null);
  assert.ok(await repository.getChallenge("recent"));
});

test("deletes old expired/revoked sessions but keeps active ones", async () => {
  const repository = new InMemoryRepository();
  const expiredOld = await repository.createSession({userId: "u1", tokenHash: "expired-old", expiresAt: new Date(Date.now() - 1000).toISOString()});
  expiredOld.createdAt = daysAgo(60);
  const active = await repository.createSession({userId: "u1", tokenHash: "active", expiresAt: new Date(Date.now() + 1_000_000).toISOString()});

  const summary = await runCleanup({repository, assetStore: fakeAssetStore(), config});

  // findSession() already treats any expired/revoked session as absent, so
  // check the underlying store directly to confirm the row was purged.
  assert.equal(summary.deletedSessions, 1);
  assert.equal(repository.sessions.has("expired-old"), false);
  assert.equal(repository.sessions.has("active"), true);
});

test("deletes orphaned analysis jobs but keeps ones referenced by a wardrobe item or profile", async () => {
  const repository = new InMemoryRepository();
  const orphanedOld = await repository.createAnalysisJob({userId: "u1", mediaAssetId: "asset-1", analysisType: "wardrobe_item", result: {}});
  orphanedOld.createdAt = daysAgo(30);
  const orphanedRecent = await repository.createAnalysisJob({userId: "u1", mediaAssetId: "asset-2", analysisType: "wardrobe_item", result: {}});
  const referencedByItem = await repository.createAnalysisJob({userId: "u1", mediaAssetId: "asset-3", analysisType: "wardrobe_item", result: {}});
  referencedByItem.createdAt = daysAgo(30);
  await repository.createWardrobeItem("u1", {name: "Blazer", category: "Outerwear", sourceType: "upload", analysisJobId: referencedByItem.id});
  const referencedByProfile = await repository.createAnalysisJob({userId: "u1", mediaAssetId: "asset-4", analysisType: "style_profile", result: {}});
  referencedByProfile.createdAt = daysAgo(30);
  await repository.saveProfile("u1", {latestAnalysisJobId: referencedByProfile.id});

  const summary = await runCleanup({repository, assetStore: fakeAssetStore(), config});

  assert.equal(summary.deletedAnalysisJobs, 1);
  assert.equal(await repository.getAnalysisJob(orphanedOld.id), null);
  assert.ok(await repository.getAnalysisJob(orphanedRecent.id));
  assert.ok(await repository.getAnalysisJob(referencedByItem.id));
  assert.ok(await repository.getAnalysisJob(referencedByProfile.id));
});

test("deletes unsaved try-on results past their retention window, removing the Cloudinary object, but never touches saved looks", async () => {
  const repository = new InMemoryRepository();
  const resultAsset = await repository.createAsset({userId: "u1", purpose: "tryon_result", storageProvider: "cloudinary", storageKey: "nera/u1/expired-result"});
  const expiredUnsaved = await repository.createTryOnRequest("u1", {wardrobeItemIds: ["w1"], profileMediaAssetId: "profile-asset", resultMediaAssetId: resultAsset.id, status: "completed"});
  expiredUnsaved.createdAt = hoursAgo(48);
  const recentUnsaved = await repository.createTryOnRequest("u1", {wardrobeItemIds: ["w1"], profileMediaAssetId: "profile-asset", resultMediaAssetId: resultAsset.id, status: "completed"});
  const savedOld = await repository.createTryOnRequest("u1", {wardrobeItemIds: ["w1"], profileMediaAssetId: "profile-asset", resultMediaAssetId: resultAsset.id, status: "completed", isSaved: true});
  savedOld.createdAt = hoursAgo(72);

  const assetStore = fakeAssetStore();
  const summary = await runCleanup({repository, assetStore, config});

  assert.equal(summary.deletedUnsavedTryOns, 1);
  assert.equal(await repository.getTryOnRequest(expiredUnsaved.id), null);
  assert.ok(await repository.getTryOnRequest(recentUnsaved.id));
  assert.ok(await repository.getTryOnRequest(savedOld.id));
  assert.deepEqual(assetStore.removed, ["nera/u1/expired-result"]);
});

test("purges old, unreferenced deleted media assets but keeps ones still referenced", async () => {
  const repository = new InMemoryRepository();
  const danglingOld = await repository.createAsset({userId: "u1", purpose: "wardrobe_item", storageProvider: "cloudinary", storageKey: "nera/u1/dangling"});
  await repository.archiveAsset(danglingOld.id);
  danglingOld.deletedAt = daysAgo(30);

  const danglingRecent = await repository.createAsset({userId: "u1", purpose: "wardrobe_item", storageProvider: "cloudinary", storageKey: "nera/u1/dangling-recent"});
  await repository.archiveAsset(danglingRecent.id);

  const stillReferenced = await repository.createAsset({userId: "u1", purpose: "profile_analysis", storageProvider: "cloudinary", storageKey: "nera/u1/still-used"});
  await repository.archiveAsset(stillReferenced.id);
  stillReferenced.deletedAt = daysAgo(30);
  await repository.saveProfile("u1", {profileImageAssetId: stillReferenced.id});

  const assetStore = fakeAssetStore();
  const summary = await runCleanup({repository, assetStore, config});

  // getAsset() already treats any deleted row as absent, so check the
  // underlying store directly to confirm the row itself was purged (or
  // deliberately kept) rather than just soft-deleted.
  assert.equal(summary.deletedMediaAssets, 1);
  assert.equal(repository.assets.has(danglingOld.id), false);
  assert.equal(repository.assets.has(danglingRecent.id), true);
  assert.equal(repository.assets.has(stillReferenced.id), true);
  // Cloudinary removal is retried here (best-effort) before the row is
  // purged, in case an earlier request-time removal (e.g. during a wardrobe
  // delete) failed and never actually removed the object.
  assert.deepEqual(assetStore.removed, ["nera/u1/dangling"]);
});
