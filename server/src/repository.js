const crypto = require("node:crypto");

const id = () => crypto.randomUUID();

const repositoryMethods = Object.freeze([
  "findUserByPhone", "findOrCreateUser", "findUserById",
  "createChallenge", "countRecentChallenges", "getChallenge", "recordChallengeAttempt", "markChallengeDelivered",
  "createSession", "findSession", "revokeSession",
  "createAsset", "getAsset", "archiveAsset",
  "createAnalysisJob", "getAnalysisJob", "pruneAnalysisJobResult", "saveProfile", "getProfile",
  "listWardrobe", "createWardrobeItem", "createWardrobeItemsBatch", "getWardrobeItem", "deleteWardrobeItem",
  "createOutfit", "getOutfit", "listOutfits",
  "upsertOutfitFeedback", "getWardrobeAffinity",
  "createTryOnRequest", "getTryOnRequest", "markTryOnSaved", "listSavedTryOns", "unsaveTryOn",
  "deleteExpiredOtpChallenges", "deleteOldSessions", "deleteOrphanedAnalysisJobs",
  "listExpiredUnsavedTryOns", "deleteTryOnRequest", "listPurgeableMediaAssets", "deleteMediaAssetRow",
]);

function assertRepositoryContract(repository) {
  const missing = repositoryMethods.filter((method) => typeof repository?.[method] !== "function");
  if (missing.length) throw new TypeError(`Repository is missing methods: ${missing.join(", ")}`);
  return repository;
}

class InMemoryRepository {
  constructor() {
    this.users = new Map();
    this.usersByPhone = new Map();
    this.challenges = new Map();
    this.sessions = new Map();
    this.assets = new Map();
    this.analysisJobs = new Map();
    this.profiles = new Map();
    this.wardrobe = new Map();
    this.outfits = new Map();
    this.outfitFeedback = new Map();
    this.tryOnRequests = new Map();
  }

  async findUserByPhone(phoneNumber) {
    const userId = this.usersByPhone.get(phoneNumber);
    return userId ? this.users.get(userId) : null;
  }

  async createUser({name, dateOfBirth, phoneNumber}) {
    const now = new Date().toISOString();
    const user = {id: id(), name, dateOfBirth, phoneNumber, phoneVerifiedAt: now, status: "active", createdAt: now, updatedAt: now};
    this.users.set(user.id, user);
    this.usersByPhone.set(phoneNumber, user.id);
    return user;
  }

  async findOrCreateUser(registration) {
    return await this.findUserByPhone(registration.phoneNumber) || this.createUser(registration);
  }

  async createChallenge(challenge) {
    const value = {id: id(), attempts: 0, consumedAt: null, createdAt: new Date().toISOString(), ...challenge};
    this.challenges.set(value.id, value);
    return value;
  }

  async getChallenge(challengeId) { return this.challenges.get(challengeId) || null; }
  async countRecentChallenges(phoneNumber, since) {
    return [...this.challenges.values()].filter((challenge) => challenge.phoneNumber === phoneNumber && new Date(challenge.createdAt) >= new Date(since)).length;
  }
  async updateChallenge(challengeId, changes) {
    const value = {...this.challenges.get(challengeId), ...changes};
    this.challenges.set(challengeId, value);
    return value;
  }
  async recordChallengeAttempt(challengeId, expectedAttempts, {consumedAt = null} = {}) {
    const current = this.challenges.get(challengeId);
    if (!current || current.consumedAt || current.attempts !== expectedAttempts) return null;
    return this.updateChallenge(challengeId, {attempts: expectedAttempts + 1, ...(consumedAt ? {consumedAt} : {})});
  }
  async markChallengeDelivered(challengeId, {providerMessageId, submittedAt}) {
    return this.updateChallenge(challengeId, {providerMessageId, submittedAt});
  }

  async createSession({userId, tokenHash, expiresAt}) {
    const session = {id: id(), userId, tokenHash, expiresAt, revokedAt: null, createdAt: new Date().toISOString()};
    this.sessions.set(tokenHash, session);
    return session;
  }

  async findSession(tokenHash) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.revokedAt || new Date(session.expiresAt) <= new Date()) return null;
    return session;
  }

  async revokeSession(tokenHash) {
    const session = this.sessions.get(tokenHash);
    if (session) session.revokedAt = new Date().toISOString();
  }

  async findUserById(userId) { return this.users.get(userId) || null; }

  async createAsset(asset) {
    const value = {id: id(), status: "ready", createdAt: new Date().toISOString(), ...asset};
    this.assets.set(value.id, value);
    return value;
  }

  async getAsset(assetId) {
    const asset = this.assets.get(assetId);
    return asset && !asset.deletedAt ? asset : null;
  }
  async archiveAsset(assetId) {
    const asset = this.assets.get(assetId);
    if (asset) Object.assign(asset, {status: "deleted", deletedAt: new Date().toISOString()});
  }

  async createAnalysisJob(job) {
    const value = {id: id(), createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), status: "completed", ...job};
    this.analysisJobs.set(value.id, value);
    return value;
  }
  async getAnalysisJob(jobId) { return this.analysisJobs.get(jobId) || null; }
  async pruneAnalysisJobResult(jobId) {
    const job = this.analysisJobs.get(jobId);
    if (job) job.result = null;
  }

  async saveProfile(userId, profile) {
    const value = {...profile, userId, updatedAt: new Date().toISOString()};
    this.profiles.set(userId, value);
    return value;
  }

  async getProfile(userId) { return this.profiles.get(userId) || {}; }

  async listWardrobe(userId) {
    return [...this.wardrobe.values()].filter((item) => item.userId === userId && !item.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createWardrobeItem(userId, item) {
    const now = new Date().toISOString();
    const value = {id: id(), userId, tags: [], createdAt: now, updatedAt: now, ...item};
    this.wardrobe.set(value.id, value);
    return value;
  }

  async createWardrobeItemsBatch(userId, items) {
    const created = [];
    for (const item of items) created.push(await this.createWardrobeItem(userId, item));
    return created;
  }

  async getWardrobeItem(itemId) { return this.wardrobe.get(itemId) || null; }
  // Soft-deletes the item (kept so past outfit history stays intact — see
  // outfit_items' FK RESTRICT in the schema) but also drops its now-useless
  // AI analysis result, and archives the linked media asset in the same
  // step so the in-memory store never has a soft-deleted item pointing at
  // an active media asset (mirrors the Postgres transaction).
  async deleteWardrobeItem(itemId, mediaAssetId) {
    const item = this.wardrobe.get(itemId);
    if (!item) return;
    item.deletedAt = new Date().toISOString();
    if (item.analysisJobId) this.analysisJobs.delete(item.analysisJobId);
    if (mediaAssetId) await this.archiveAsset(mediaAssetId);
  }

  async createOutfit(userId, outfit) {
    const value = {id: id(), userId, createdAt: new Date().toISOString(), ...outfit};
    this.outfits.set(value.id, value);
    return value;
  }

  async getOutfit(outfitId) { return this.outfits.get(outfitId) || null; }

  async listOutfits(userId, {limit = 50} = {}) {
    return [...this.outfits.values()]
      .filter((outfit) => outfit.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((outfit) => ({...outfit, feedback: this.outfitFeedback.get(outfit.id) || null}));
  }

  async upsertOutfitFeedback(userId, outfitId, {reaction, wornAt} = {}) {
    const now = new Date().toISOString();
    const existing = this.outfitFeedback.get(outfitId);
    const value = {
      id: existing?.id || id(),
      userId,
      outfitId,
      reaction: reaction !== undefined && reaction !== null ? reaction : existing?.reaction ?? null,
      wornAt: wornAt !== undefined && wornAt !== null ? wornAt : existing?.wornAt ?? null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.outfitFeedback.set(outfitId, value);
    return value;
  }

  // Weighted sum of past feedback per wardrobe item: positive reactions and
  // wears raise an item's affinity, negative reactions lower it. Items with
  // no signal are simply absent from the returned map.
  async getWardrobeAffinity(userId) {
    const weights = {love_it: 3, would_wear: 1, not_sure: 0, not_my_style: -3};
    const scores = {};
    for (const feedback of this.outfitFeedback.values()) {
      if (feedback.userId !== userId) continue;
      const outfit = this.outfits.get(feedback.outfitId);
      if (!outfit) continue;
      const weight = (weights[feedback.reaction] || 0) + (feedback.wornAt ? 2 : 0);
      if (weight === 0) continue;
      for (const itemId of outfit.wardrobeItemIds || []) {
        scores[itemId] = (scores[itemId] || 0) + weight;
      }
    }
    return scores;
  }

  async createTryOnRequest(userId, request) {
    const now = new Date().toISOString();
    const value = {id: id(), userId, isSaved: false, createdAt: now, ...request};
    this.tryOnRequests.set(value.id, value);
    return value;
  }

  async getTryOnRequest(tryOnId) { return this.tryOnRequests.get(tryOnId) || null; }

  async markTryOnSaved(tryOnId) {
    const value = this.tryOnRequests.get(tryOnId);
    if (value) value.isSaved = true;
    return value || null;
  }

  async listSavedTryOns(userId) {
    return [...this.tryOnRequests.values()]
      .filter((tryOn) => tryOn.userId === userId && tryOn.isSaved && tryOn.status === "completed")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((tryOn) => ({...tryOn, resultStorageKey: this.assets.get(tryOn.resultMediaAssetId)?.storageKey || null}));
  }

  async unsaveTryOn(tryOnId) {
    const value = this.tryOnRequests.get(tryOnId);
    if (value) value.isSaved = false;
    return value || null;
  }

  // --- Periodic housekeeping (see src/cleanup.js) ---

  async deleteExpiredOtpChallenges(beforeIso) {
    let count = 0;
    for (const [id, challenge] of this.challenges) {
      if (challenge.createdAt < beforeIso) { this.challenges.delete(id); count += 1; }
    }
    return count;
  }

  async deleteOldSessions(beforeIso) {
    let count = 0;
    for (const [key, session] of this.sessions) {
      const expired = session.revokedAt || new Date(session.expiresAt) <= new Date();
      if (expired && session.createdAt < beforeIso) { this.sessions.delete(key); count += 1; }
    }
    return count;
  }

  async deleteOrphanedAnalysisJobs(beforeIso) {
    const referenced = new Set();
    for (const item of this.wardrobe.values()) if (item.analysisJobId) referenced.add(item.analysisJobId);
    for (const profile of this.profiles.values()) if (profile.latestAnalysisJobId) referenced.add(profile.latestAnalysisJobId);
    let count = 0;
    for (const [id, job] of this.analysisJobs) {
      if (!referenced.has(id) && job.createdAt < beforeIso) { this.analysisJobs.delete(id); count += 1; }
    }
    return count;
  }

  async listExpiredUnsavedTryOns(beforeIso) {
    return [...this.tryOnRequests.values()]
      .filter((tryOn) => !tryOn.isSaved && tryOn.createdAt < beforeIso)
      .map((tryOn) => ({...tryOn, resultStorageKey: this.assets.get(tryOn.resultMediaAssetId)?.storageKey || null}));
  }

  async deleteTryOnRequest(tryOnId) { this.tryOnRequests.delete(tryOnId); }

  async listPurgeableMediaAssets(beforeIso) {
    const referenced = new Set();
    for (const item of this.wardrobe.values()) if (item.mediaAssetId) referenced.add(item.mediaAssetId);
    for (const job of this.analysisJobs.values()) if (job.mediaAssetId) referenced.add(job.mediaAssetId);
    for (const profile of this.profiles.values()) if (profile.profileImageAssetId) referenced.add(profile.profileImageAssetId);
    for (const tryOn of this.tryOnRequests.values()) {
      if (tryOn.profileMediaAssetId) referenced.add(tryOn.profileMediaAssetId);
      if (tryOn.resultMediaAssetId) referenced.add(tryOn.resultMediaAssetId);
    }
    return [...this.assets.values()].filter((asset) => asset.deletedAt && asset.deletedAt < beforeIso && !referenced.has(asset.id));
  }

  async deleteMediaAssetRow(assetId) { this.assets.delete(assetId); }
}

module.exports = {InMemoryRepository, assertRepositoryContract, repositoryMethods};
