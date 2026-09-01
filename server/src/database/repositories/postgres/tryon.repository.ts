import type {Pool} from "pg";
import {iso} from "../../postgres";
import type {TryOnRepository} from "../../../types/repositories";
import type {TryOnRequest, CreateTryOnRequestInput} from "../../../types/tryon.types";

interface TryOnRow {
  id: string;
  user_id: string;
  outfit_id: string | null;
  wardrobe_item_ids: string[] | null;
  profile_media_asset_id: string;
  result_media_asset_id: string | null;
  result_storage_key?: string | null;
  status: string;
  provider: string | null;
  model: string | null;
  error_code: string | null;
  error_message: string | null;
  is_saved: boolean;
  created_at: string | Date;
  completed_at: string | Date | null;
}

function tryOnFromRow(row: TryOnRow | undefined): TryOnRequest | null {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    outfitId: row.outfit_id,
    wardrobeItemIds: row.wardrobe_item_ids || [],
    profileMediaAssetId: row.profile_media_asset_id,
    resultMediaAssetId: row.result_media_asset_id,
    resultStorageKey: row.result_storage_key || null,
    status: row.status as TryOnRequest["status"],
    provider: row.provider,
    model: row.model,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    isSaved: row.is_saved,
    createdAt: iso(row.created_at) as string,
    completedAt: iso(row.completed_at),
  };
}

export class PostgresTryOnRepository implements TryOnRepository {
  constructor(private readonly pool: Pool) {}

  async createTryOnRequest(userId: string, request: CreateTryOnRequestInput): Promise<TryOnRequest> {
    const result = await this.pool.query<TryOnRow>(
      `INSERT INTO tryon_requests
         (user_id, outfit_id, wardrobe_item_ids, profile_media_asset_id, result_media_asset_id, status, provider, model, error_code, error_message, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        userId, request.outfitId || null, request.wardrobeItemIds, request.profileMediaAssetId,
        request.resultMediaAssetId || null, request.status, request.provider || null, request.model || null,
        null, null, request.completedAt || null,
      ],
    );
    return tryOnFromRow(result.rows[0]) as TryOnRequest;
  }

  async getTryOnRequest(tryOnId: string): Promise<TryOnRequest | null> {
    const result = await this.pool.query<TryOnRow>(
      `SELECT t.*, asset.storage_key AS result_storage_key
         FROM tryon_requests t
         LEFT JOIN media_assets asset ON asset.id = t.result_media_asset_id
        WHERE t.id = $1`,
      [tryOnId],
    );
    return tryOnFromRow(result.rows[0]);
  }

  async markTryOnSaved(tryOnId: string): Promise<TryOnRequest | null> {
    const result = await this.pool.query<TryOnRow>("UPDATE tryon_requests SET is_saved = true WHERE id = $1 RETURNING *", [tryOnId]);
    return tryOnFromRow(result.rows[0]);
  }

  async listSavedTryOns(userId: string): Promise<TryOnRequest[]> {
    const result = await this.pool.query<TryOnRow>(
      `SELECT t.*, asset.storage_key AS result_storage_key
         FROM tryon_requests t
         LEFT JOIN media_assets asset ON asset.id = t.result_media_asset_id
        WHERE t.user_id = $1 AND t.is_saved = true AND t.status = 'completed'
        ORDER BY t.created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => tryOnFromRow(row) as TryOnRequest);
  }

  async unsaveTryOn(tryOnId: string): Promise<TryOnRequest | null> {
    const result = await this.pool.query<TryOnRow>("UPDATE tryon_requests SET is_saved = false WHERE id = $1 RETURNING *", [tryOnId]);
    return tryOnFromRow(result.rows[0]);
  }

  async listExpiredUnsavedTryOns(beforeIso: string): Promise<TryOnRequest[]> {
    const result = await this.pool.query<TryOnRow>(
      `SELECT t.*, asset.storage_key AS result_storage_key
         FROM tryon_requests t
         LEFT JOIN media_assets asset ON asset.id = t.result_media_asset_id
        WHERE t.is_saved = false AND t.created_at < $1`,
      [beforeIso],
    );
    return result.rows.map((row) => tryOnFromRow(row) as TryOnRequest);
  }

  async deleteTryOnRequest(tryOnId: string): Promise<void> {
    await this.pool.query("DELETE FROM tryon_requests WHERE id = $1", [tryOnId]);
  }
}
