// Periodic housekeeping so Postgres storage and Cloudinary don't grow
// unbounded: expired OTP challenges, stale sessions, orphaned AI analysis
// results, unsaved virtual try-on results past their retention window (and
// their Cloudinary objects), and long-deleted media rows nothing still
// references. Saved looks (is_saved = true) are never touched.
//
// Runs on an in-process interval (see index.js) and is also exposed as a
// standalone script (scripts/cleanup.js) for an external cron/scheduled
// task, without requiring a new job-queue dependency.

async function runCleanup({repository, assetStore, config}) {
  const now = Date.now();
  const before = (days) => new Date(now - days * 86_400_000).toISOString();
  const beforeHours = (hours) => new Date(now - hours * 3_600_000).toISOString();

  const deletedOtpChallenges = await repository.deleteExpiredOtpChallenges(before(config.otpRetentionDays));
  const deletedSessions = await repository.deleteOldSessions(before(config.sessionRetentionDays));
  const deletedAnalysisJobs = await repository.deleteOrphanedAnalysisJobs(before(config.analysisJobRetentionDays));

  const expiredTryOns = await repository.listExpiredUnsavedTryOns(beforeHours(config.tryonUnsavedRetentionHours));
  for (const tryOn of expiredTryOns) {
    if (tryOn.resultStorageKey) await assetStore.remove(tryOn.resultStorageKey).catch(() => {});
    if (tryOn.resultMediaAssetId) await repository.archiveAsset(tryOn.resultMediaAssetId).catch(() => {});
    await repository.deleteTryOnRequest(tryOn.id).catch(() => {});
  }

  const deletedMediaAssets = await repository.deleteOldDeletedMediaAssets(before(config.mediaAssetRetentionDays));

  return {
    deletedOtpChallenges,
    deletedSessions,
    deletedAnalysisJobs,
    deletedUnsavedTryOns: expiredTryOns.length,
    deletedMediaAssets,
  };
}

module.exports = {runCleanup};
