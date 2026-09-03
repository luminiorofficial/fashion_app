// Runtime guard mirroring the pre-refactor assertRepositoryContract: a
// composed Repositories object is checked here (once, at wiring time)
// rather than trusting TypeScript's compile-time interfaces alone, so a
// repository implementation that's missing a method fails immediately and
// clearly at startup instead of throwing deep inside a request handler.
export const repositoryContracts = {
  users: ["findUserByPhone", "findOrCreateUser", "findUserById", "deleteAccount"],
  sessions: ["createSession", "findSession", "revokeSession", "deleteOldSessions"],
  otp: ["createChallenge", "countRecentChallenges", "getChallenge", "recordChallengeAttempt", "markChallengeDelivered", "deleteExpiredOtpChallenges"],
  assets: ["createAsset", "getAsset", "archiveAsset", "createAnalysisJob", "getAnalysisJob", "pruneAnalysisJobResult", "deleteOrphanedAnalysisJobs", "listPurgeableMediaAssets", "archiveOrphanedMediaAssets", "deleteMediaAssetRow"],
  profiles: ["saveProfile", "getProfile"],
  wardrobe: ["listWardrobe", "createWardrobeItem", "createWardrobeItemsBatch", "getWardrobeItem", "markWardrobeItemViewed", "deleteWardrobeItem"],
  outfits: ["createOutfit", "getOutfit", "listOutfits", "upsertOutfitFeedback", "getWardrobeAffinity"],
  tryon: ["createTryOnRequest", "getTryOnRequest", "markTryOnSaved", "listSavedTryOns", "unsaveTryOn", "listExpiredUnsavedTryOns", "deleteTryOnRequest"],
  security: ["consumeRateLimit", "reserveAiUsage", "completeAiUsage", "pruneSecurityData"],
  gmail: ["getConnectionByUserId", "getConnectionById", "upsertConnection", "updateConnection", "disconnectConnection"],
  purchaseImports: ["upsertParsedOrder", "listPending", "getById", "markImported", "markIgnored", "isMessageProcessed", "markMessageProcessed"],
} as const;

export function assertRepositoriesContract(repositories: unknown): void {
  const source = repositories as Record<string, unknown>;
  const missing: string[] = [];
  for (const [domain, methods] of Object.entries(repositoryContracts)) {
    const target = source[domain] as Record<string, unknown> | undefined;
    for (const method of methods) {
      if (typeof target?.[method] !== "function") missing.push(`${domain}.${method}`);
    }
  }
  if (typeof source.health !== "function") missing.push("health");
  if (typeof source.close !== "function") missing.push("close");
  if (missing.length) throw new TypeError(`Repositories are missing methods: ${missing.join(", ")}`);
}
