import type {Pool} from "pg";
import {iso} from "../../postgres";
import type {AssetsRepository} from "../../../types/repositories";
import type {MediaAsset, CreateAssetInput, AnalysisJob, CreateAnalysisJobInput} from "../../../types/asset.types";

interface AssetRow {
  id: string;
  owner_user_id: string;
  purpose: string;
  storage_provider: string;
  storage_key: string;
  public_url: string | null;
  original_filename: string;
  mime_type: string;
  byte_size: string | number;
  checksum_sha256: string;
  status: string;
  created_at: string | Date;
  deleted_at: string | Date | null;
}

interface AnalysisJobRow {
  id: string;
  user_id: string;
  media_asset_id: string;
  analysis_type: string;
  status: string;
  provider: string;
  model: string | null;
  result: Record<string, unknown> | null;
  completed_at: string | Date | null;
  created_at: string | Date;
}

function assetFromRow(row: AssetRow | undefined): MediaAsset | null {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.owner_user_id,
    purpose: row.purpose as MediaAsset["purpose"],
    storageProvider: row.storage_provider,
    storageKey: row.storage_key,
    publicUrl: row.public_url,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    checksumSha256: row.checksum_sha256,
    status: row.status as MediaAsset["status"],
    createdAt: iso(row.created_at) as string,
    deletedAt: iso(row.deleted_at),
  };
}

function jobFromRow(row: AnalysisJobRow | undefined): AnalysisJob | null {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    mediaAssetId: row.media_asset_id,
    analysisType: row.analysis_type as AnalysisJob["analysisType"],
    status: row.status,
    provider: row.provider,
    model: row.model,
    result: row.result,
    completedAt: iso(row.completed_at),
    createdAt: iso(row.created_at) as string,
  };
}

export class PostgresAssetsRepository implements AssetsRepository {
  constructor(private readonly pool: Pool) {}

  async createAsset(asset: CreateAssetInput): Promise<MediaAsset> {
    const result = await this.pool.query<AssetRow>(
      `INSERT INTO media_assets
         (owner_user_id, purpose, storage_provider, storage_key, public_url, original_filename, mime_type, byte_size, checksum_sha256, status)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, 'ready')
       RETURNING *`,
      [asset.userId, asset.purpose, asset.storageProvider, asset.storageKey, asset.originalFilename, asset.mimeType, asset.byteSize, asset.checksumSha256],
    );
    return assetFromRow(result.rows[0]) as MediaAsset;
  }

  async getAsset(assetId: string): Promise<MediaAsset | null> {
    const result = await this.pool.query<AssetRow>("SELECT * FROM media_assets WHERE id = $1 AND deleted_at IS NULL", [assetId]);
    return assetFromRow(result.rows[0]);
  }

  async archiveAsset(assetId: string): Promise<void> {
    await this.pool.query("UPDATE media_assets SET status = 'deleted', deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [assetId]);
  }

  async createAnalysisJob(job: CreateAnalysisJobInput): Promise<AnalysisJob> {
    const result = await this.pool.query<AnalysisJobRow>(
      `INSERT INTO analysis_jobs
         (user_id, media_asset_id, analysis_type, status, provider, model, result, started_at, completed_at)
       VALUES ($1, $2, $3, 'completed', $4, $5, $6, now(), now())
       RETURNING *`,
      [job.userId, job.mediaAssetId, job.analysisType, job.provider, job.model, JSON.stringify(job.result)],
    );
    return jobFromRow(result.rows[0]) as AnalysisJob;
  }

  async getAnalysisJob(jobId: string): Promise<AnalysisJob | null> {
    const result = await this.pool.query<AnalysisJobRow>("SELECT * FROM analysis_jobs WHERE id = $1", [jobId]);
    return jobFromRow(result.rows[0]);
  }

  // Once a job's result has been normalized into wardrobe_items or
  // user_style_profiles columns, the full Gemini JSON is redundant — this
  // drops it while keeping the row (provider/model/status/timestamps) for
  // audit purposes. result stays nullable, so no schema change is needed.
  async pruneAnalysisJobResult(jobId: string): Promise<void> {
    await this.pool.query("UPDATE analysis_jobs SET result = NULL WHERE id = $1", [jobId]);
  }

  // Analysis jobs no longer referenced by the wardrobe item or style
  // profile they were created for are pure duplicate AI JSON at that point
  // (already normalized into wardrobe_items/user_style_profiles columns).
  async deleteOrphanedAnalysisJobs(beforeIso: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM analysis_jobs j
        WHERE j.created_at < $1
          AND NOT EXISTS (SELECT 1 FROM wardrobe_items w WHERE w.analysis_job_id = j.id)
          AND NOT EXISTS (SELECT 1 FROM user_style_profiles p WHERE p.latest_analysis_job_id = j.id)`,
      [beforeIso],
    );
    return result.rowCount ?? 0;
  }

  // Media rows marked deleted, unreferenced, and past the retention window.
  // Listed (rather than deleted directly) so the caller can retry Cloudinary
  // removal one more time before purging the row — a request-time removal
  // that failed gets a guaranteed second attempt here instead of leaking
  // forever.
  async listPurgeableMediaAssets(beforeIso: string): Promise<MediaAsset[]> {
    const result = await this.pool.query<AssetRow>(
      `SELECT * FROM media_assets m
        WHERE m.deleted_at IS NOT NULL AND m.deleted_at < $1
          AND NOT EXISTS (SELECT 1 FROM wardrobe_item_media wm WHERE wm.media_asset_id = m.id)
          AND NOT EXISTS (SELECT 1 FROM analysis_jobs aj WHERE aj.media_asset_id = m.id)
          AND NOT EXISTS (SELECT 1 FROM user_style_profiles sp WHERE sp.profile_image_asset_id = m.id)
          AND NOT EXISTS (SELECT 1 FROM tryon_requests tr WHERE tr.profile_media_asset_id = m.id OR tr.result_media_asset_id = m.id)`,
      [beforeIso],
    );
    return result.rows.map((row) => assetFromRow(row) as MediaAsset);
  }

  async deleteMediaAssetRow(assetId: string): Promise<void> {
    await this.pool.query("DELETE FROM media_assets WHERE id = $1", [assetId]);
  }
}
