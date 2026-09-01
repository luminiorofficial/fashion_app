import type {Pool} from "pg";
import {iso, withTransaction} from "../../postgres";
import type {OutfitsRepository} from "../../../types/repositories";
import type {Outfit, CreateOutfitInput, OutfitFeedback, UpsertOutfitFeedbackInput, WardrobeAffinity, SuggestedPurchaseItem} from "../../../types/outfit.types";

interface OutfitRow {
  id: string;
  user_id: string;
  event_type: string;
  status: string;
  rationale: string;
  suggested_purchase: SuggestedPurchaseItem | null;
  created_at: string | Date;
  completed_at: string | Date | null;
}

function outfitFromRow(row: OutfitRow | undefined, wardrobeItemIds: string[]): Outfit | null {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    status: row.status,
    rationale: row.rationale,
    suggestedPurchaseItem: row.suggested_purchase || null,
    wardrobeItemIds,
    createdAt: iso(row.created_at) as string,
    completedAt: iso(row.completed_at),
  };
}

export class PostgresOutfitsRepository implements OutfitsRepository {
  constructor(private readonly pool: Pool) {}

  async createOutfit(userId: string, {eventType, rationale, wardrobeItemIds, suggestedPurchaseItem, analysisContext}: CreateOutfitInput): Promise<Outfit> {
    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query<OutfitRow>(
        `INSERT INTO outfits (user_id, event_type, status, rationale, suggested_purchase, analysis_context, completed_at)
         VALUES ($1, $2, 'completed', $3, $4, $5, now())
         RETURNING *`,
        [userId, eventType, rationale, suggestedPurchaseItem ? JSON.stringify(suggestedPurchaseItem) : null, JSON.stringify(analysisContext || {})],
      );
      const outfit = inserted.rows[0] as OutfitRow;
      let position = 0;
      for (const wardrobeItemId of wardrobeItemIds) {
        await client.query(
          `INSERT INTO outfit_items (user_id, outfit_id, wardrobe_item_id, position) VALUES ($1, $2, $3, $4)`,
          [userId, outfit.id, wardrobeItemId, position],
        );
        position += 1;
      }
      return outfitFromRow(outfit, wardrobeItemIds) as Outfit;
    });
  }

  async getOutfit(outfitId: string): Promise<Outfit | null> {
    const outfitResult = await this.pool.query<OutfitRow>("SELECT * FROM outfits WHERE id = $1", [outfitId]);
    if (!outfitResult.rows[0]) return null;
    const itemsResult = await this.pool.query<{wardrobe_item_id: string}>("SELECT wardrobe_item_id FROM outfit_items WHERE outfit_id = $1 ORDER BY position", [outfitId]);
    return outfitFromRow(outfitResult.rows[0], itemsResult.rows.map((row) => row.wardrobe_item_id));
  }

  async listOutfits(userId: string, {limit = 50}: {limit?: number} = {}): Promise<Outfit[]> {
    const result = await this.pool.query<OutfitRow & {reaction: string | null; worn_at: string | Date | null; wardrobe_item_ids: string[]}>(
      `SELECT o.*, f.reaction, f.worn_at,
         COALESCE(array_agg(oi.wardrobe_item_id ORDER BY oi.position) FILTER (WHERE oi.wardrobe_item_id IS NOT NULL), '{}') AS wardrobe_item_ids
         FROM outfits o
         LEFT JOIN outfit_feedback f ON f.outfit_id = o.id
         LEFT JOIN outfit_items oi ON oi.outfit_id = o.id
        WHERE o.user_id = $1
        GROUP BY o.id, f.reaction, f.worn_at
        ORDER BY o.created_at DESC
        LIMIT $2`,
      [userId, limit],
    );
    return result.rows.map((row) => ({
      ...(outfitFromRow(row, row.wardrobe_item_ids || []) as Outfit),
      feedback: row.reaction || row.worn_at
        ? {reaction: row.reaction as OutfitFeedback["reaction"], wornAt: iso(row.worn_at)}
        : null,
    }));
  }

  async upsertOutfitFeedback(userId: string, outfitId: string, {reaction = null, wornAt = null}: UpsertOutfitFeedbackInput = {}): Promise<OutfitFeedback> {
    const result = await this.pool.query<{id: string; user_id: string; outfit_id: string; reaction: string | null; worn_at: string | Date | null; created_at: string | Date; updated_at: string | Date}>(
      `INSERT INTO outfit_feedback (user_id, outfit_id, reaction, worn_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (outfit_id) DO UPDATE SET
         reaction = COALESCE($3, outfit_feedback.reaction),
         worn_at = COALESCE($4, outfit_feedback.worn_at)
       RETURNING *`,
      [userId, outfitId, reaction, wornAt],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Failed to upsert outfit feedback.");
    return {
      id: row.id,
      userId: row.user_id,
      outfitId: row.outfit_id,
      reaction: row.reaction as OutfitFeedback["reaction"],
      wornAt: iso(row.worn_at),
      createdAt: iso(row.created_at) as string,
      updatedAt: iso(row.updated_at) as string,
    };
  }

  async getWardrobeAffinity(userId: string): Promise<WardrobeAffinity> {
    const weightedScore = `
      SUM(
        CASE f.reaction WHEN 'love_it' THEN 3 WHEN 'would_wear' THEN 1 WHEN 'not_sure' THEN 0 WHEN 'not_my_style' THEN -3 ELSE 0 END
        + CASE WHEN f.worn_at IS NOT NULL THEN 2 ELSE 0 END
      )::int`;
    const result = await this.pool.query<{item_id: string; score: number}>(
      `SELECT oi.wardrobe_item_id AS item_id, ${weightedScore} AS score
         FROM outfit_feedback f
         JOIN outfit_items oi ON oi.outfit_id = f.outfit_id
        WHERE f.user_id = $1
        GROUP BY oi.wardrobe_item_id
       HAVING ${weightedScore} != 0`,
      [userId],
    );
    return Object.fromEntries(result.rows.map((row) => [row.item_id, row.score]));
  }
}
