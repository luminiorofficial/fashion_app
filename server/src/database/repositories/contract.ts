// Runtime guard mirroring the pre-refactor assertRepositoryContract: a
// composed Repositories object is checked here (once, at wiring time)
// rather than trusting TypeScript's compile-time interfaces alone, so a
// repository implementation that's missing a method fails immediately and
// clearly at startup instead of throwing deep inside a request handler.
export const repositoryContracts = {
  users: ["findUserByPhone", "findOrCreateUser", "findUserById"],
  sessions: ["createSession", "findSession", "revokeSession", "deleteOldSessions"],
  otp: ["createChallenge", "countRecentChallenges", "getChallenge", "recordChallengeAttempt", "markChallengeDelivered", "deleteExpiredOtpChallenges"],
  assets: ["createAsset", "getAsset", "archiveAsset", "createAnalysisJob", "getAnalysisJob", "pruneAnalysisJobResult", "deleteOrphanedAnalysisJobs", "listPurgeableMediaAssets", "deleteMediaAssetRow"],
  profiles: ["saveProfile", "getProfile"],
  wardrobe: ["listWardrobe", "createWardrobeItem", "createWardrobeItemsBatch", "getWardrobeItem", "deleteWardrobeItem"],
  outfits: ["createOutfit", "getOutfit", "listOutfits", "upsertOutfitFeedback", "getWardrobeAffinity"],
  tryon: ["createTryOnRequest", "getTryOnRequest", "markTryOnSaved", "listSavedTryOns", "unsaveTryOn", "listExpiredUnsavedTryOns", "deleteTryOnRequest"],
} as const;

export function assertRepositoriesContract(repositories: Record<string, unknown>): void {
  const missing: string[] = [];
  for (const [domain, methods] of Object.entries(repositoryContracts)) {
    const target = repositories[domain] as Record<string, unknown> | undefined;
    for (const method of methods) {
      if (typeof target?.[method] !== "function") missing.push(`${domain}.${method}`);
    }
  }
  if (typeof repositories.health !== "function") missing.push("health");
  if (typeof repositories.close !== "function") missing.push("close");
  if (missing.length) throw new TypeError(`Repositories are missing methods: ${missing.join(", ")}`);
}
