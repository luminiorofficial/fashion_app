const crypto = require("node:crypto");

const id = () => crypto.randomUUID();

const repositoryMethods = Object.freeze([
  "findUserByPhone", "findOrCreateUser", "findUserById",
  "createChallenge", "countRecentChallenges", "getChallenge", "recordChallengeAttempt", "markChallengeDelivered",
  "createSession", "findSession", "revokeSession",
  "createAsset", "getAsset", "archiveAsset",
  "createAnalysisJob", "getAnalysisJob", "saveProfile", "getProfile",
  "listWardrobe", "createWardrobeItem", "getWardrobeItem", "deleteWardrobeItem",
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

  async getWardrobeItem(itemId) { return this.wardrobe.get(itemId) || null; }
  async deleteWardrobeItem(itemId) {
    const item = this.wardrobe.get(itemId);
    if (item) item.deletedAt = new Date().toISOString();
  }

  async createOutfit(userId, outfit) {
    const value = {id: id(), userId, createdAt: new Date().toISOString(), ...outfit};
    this.outfits.set(value.id, value);
    return value;
  }
}

module.exports = {InMemoryRepository, assertRepositoryContract, repositoryMethods};
