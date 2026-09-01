import type {AppConfig} from "../config/env";
import type {Repositories} from "../types/repositories";
import type {AssetStore} from "../types/provider.types";

export type MaintenanceServiceConfig = Pick<AppConfig, "otpRetentionDays" | "sessionRetentionDays" | "analysisJobRetentionDays" | "mediaAssetRetentionDays" | "tryonUnsavedRetentionHours">;

export interface CleanupSummary {
  deletedOtpChallenges: number;
  deletedSessions: number;
  deletedAnalysisJobs: number;
  deletedUnsavedTryOns: number;
  deletedMediaAssets: number;
}

// Periodic housekeeping so Postgres storage and Cloudinary don't grow
// unbounded: expired OTP challenges, stale sessions, orphaned AI analysis
// results, unsaved virtual try-on results past their retention window (and
// their Cloudinary objects), and long-deleted media rows nothing still
// references. Saved looks (is_saved = true) are never touched.
//
// Runs on an in-process interval (see server.ts) and is also exposed as a
// standalone script (scripts/cleanup.ts) for an external cron/scheduled
// task, without requiring a new job-queue dependency.
export class MaintenanceService {
  constructor(
    private readonly repositories: Pick<Repositories, "otp" | "sessions" | "assets" | "tryon">,
    private readonly assetStore: AssetStore,
    private readonly config: MaintenanceServiceConfig,
  ) {}

  async runCleanup(): Promise<CleanupSummary> {
    const now = Date.now();
    const before = (days: number) => new Date(now - days * 86_400_000).toISOString();
    const beforeHours = (hours: number) => new Date(now - hours * 3_600_000).toISOString();

    const deletedOtpChallenges = await this.repositories.otp.deleteExpiredOtpChallenges(before(this.config.otpRetentionDays));
    const deletedSessions = await this.repositories.sessions.deleteOldSessions(before(this.config.sessionRetentionDays));
    const deletedAnalysisJobs = await this.repositories.assets.deleteOrphanedAnalysisJobs(before(this.config.analysisJobRetentionDays));

    const expiredTryOns = await this.repositories.tryon.listExpiredUnsavedTryOns(beforeHours(this.config.tryonUnsavedRetentionHours));
    for (const tryOn of expiredTryOns) {
      if (tryOn.resultStorageKey) await this.assetStore.remove(tryOn.resultStorageKey).catch(() => {});
      if (tryOn.resultMediaAssetId) await this.repositories.assets.archiveAsset(tryOn.resultMediaAssetId).catch(() => {});
      await this.repositories.tryon.deleteTryOnRequest(tryOn.id).catch(() => {});
    }

    // Retry Cloudinary removal before purging each row: a wardrobe/profile/
    // try-on delete may have already archived the DB row while its
    // Cloudinary call failed, so this is the guaranteed second attempt.
    // Cloudinary's destroy() is idempotent for an already-removed object,
    // so re-calling it here is always safe.
    const purgeableMediaAssets = await this.repositories.assets.listPurgeableMediaAssets(before(this.config.mediaAssetRetentionDays));
    for (const asset of purgeableMediaAssets) {
      if (asset.storageKey) await this.assetStore.remove(asset.storageKey).catch(() => {});
      await this.repositories.assets.deleteMediaAssetRow(asset.id).catch(() => {});
    }

    return {
      deletedOtpChallenges,
      deletedSessions,
      deletedAnalysisJobs,
      deletedUnsavedTryOns: expiredTryOns.length,
      deletedMediaAssets: purgeableMediaAssets.length,
    };
  }
}
