import type {Pool, PoolClient} from "pg";
import {iso, withTransaction, type Queryable} from "../../postgres";
import type {WardrobeRepository} from "../../../types/repositories";
import type {WardrobeItem, CreateWardrobeItemInput} from "../../../types/wardrobe.types";

interface WardrobeRow {
  id: string;
  user_id: string;
  name: string;
  category: string;
  source_type: string;
  image_storage_key: string | null;
  image_storage_provider: string | null;
  product_url: string | null;
  media_asset_id: string | null;
  analysis_job_id: string | null;
  tags: string[] | null;
  primary_color: string | null;
  secondary_colors: string[] | null;
  material: string | null;
  pattern: string | null;
  season: string[] | null;
  occasion: string[] | null;
  attributes: {style?: string[]} | null;
  contains_person: boolean;
  garment_visibility: string | null;
  virtual_tryon_eligible: boolean;
  source_marketplace: string | null;
  is_new: boolean;
  created_at: string | Date;
  updated_at: string | Date;
  deleted_at: string | Date | null;
}

const wardrobeSelect = `
  SELECT item.*, category.display_name AS category,
    (SELECT media.media_asset_id
       FROM wardrobe_item_media media
      WHERE media.wardrobe_item_id = item.id AND media.is_primary
      LIMIT 1) AS media_asset_id,
    (SELECT asset.storage_key
       FROM wardrobe_item_media media
       JOIN media_assets asset ON asset.id = media.media_asset_id
      WHERE media.wardrobe_item_id = item.id AND media.is_primary
      LIMIT 1) AS image_storage_key,
    (SELECT asset.storage_provider
       FROM wardrobe_item_media media
       JOIN media_assets asset ON asset.id = media.media_asset_id
      WHERE media.wardrobe_item_id = item.id AND media.is_primary
      LIMIT 1) AS image_storage_provider,
    COALESCE((SELECT array_agg(tag.normalized_name ORDER BY tag.normalized_name)
       FROM wardrobe_item_tags item_tag
       JOIN tags tag ON tag.id = item_tag.tag_id
      WHERE item_tag.wardrobe_item_id = item.id), '{}') AS tags
    FROM wardrobe_items item
    JOIN wardrobe_categories category ON category.id = item.category_id`;

function wardrobeFromRow(row: WardrobeRow | undefined): WardrobeItem | null {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    category: row.category,
    sourceType: row.source_type as WardrobeItem["sourceType"],
    imageStorageKey: row.image_storage_key || null,
    imageStorageProvider: row.image_storage_provider || null,
    productUrl: row.product_url,
    mediaAssetId: row.media_asset_id,
    analysisJobId: row.analysis_job_id,
    tags: row.tags || [],
    primaryColor: row.primary_color,
    secondaryColors: row.secondary_colors || [],
    material: row.material,
    pattern: row.pattern,
    season: row.season || [],
    occasion: row.occasion || [],
    styleTags: row.attributes?.style || [],
    containsPerson: !!row.contains_person,
    garmentVisibility: (row.garment_visibility || "full") as WardrobeItem["garmentVisibility"],
    virtualTryOnEligible: row.virtual_tryon_eligible !== false,
    sourceMarketplace: (row.source_marketplace || null) as WardrobeItem["sourceMarketplace"],
    isNew: !!row.is_new,
    createdAt: iso(row.created_at) as string,
    updatedAt: iso(row.updated_at) as string,
    deletedAt: iso(row.deleted_at),
  };
}

export class PostgresWardrobeRepository implements WardrobeRepository {
  constructor(private readonly pool: Pool) {}

  async listWardrobe(userId: string): Promise<WardrobeItem[]> {
    const result = await this.pool.query<WardrobeRow>(
      `${wardrobeSelect} WHERE item.user_id = $1 AND item.deleted_at IS NULL ORDER BY item.created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => wardrobeFromRow(row) as WardrobeItem);
  }

  async getWardrobeItem(itemId: string): Promise<WardrobeItem | null> {
    return this.getWardrobeItemWith(this.pool, itemId);
  }

  private async getWardrobeItemWith(queryable: Queryable, itemId: string): Promise<WardrobeItem | null> {
    const result = await queryable.query<WardrobeRow>(`${wardrobeSelect} WHERE item.id = $1`, [itemId]);
    return wardrobeFromRow(result.rows[0]);
  }

  async markWardrobeItemViewed(itemId: string): Promise<WardrobeItem | null> {
    await this.pool.query("UPDATE wardrobe_items SET is_new = false WHERE id = $1 AND is_new", [itemId]);
    return this.getWardrobeItemWith(this.pool, itemId);
  }

  private async insertWardrobeItem(client: PoolClient, userId: string, item: CreateWardrobeItemInput): Promise<string> {
    const category = await client.query<{id: string}>("SELECT id FROM wardrobe_categories WHERE display_name = $1 AND is_active", [item.category]);
    if (!category.rows[0]) throw Object.assign(new Error(`Unknown wardrobe category: ${item.category}`), {code: "INVALID_CATEGORY"});
    const productDomain = item.productUrl ? new URL(item.productUrl).hostname : null;
    const inserted = await client.query<{id: string}>(
      `INSERT INTO wardrobe_items
         (user_id, category_id, source_type, name, product_url, product_domain, analysis_job_id,
          primary_color, secondary_colors, material, pattern, season, occasion, attributes,
          contains_person, garment_visibility, virtual_tryon_eligible, source_marketplace, is_new)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING id`,
      [
        userId, category.rows[0].id, item.sourceType, item.name, item.productUrl, productDomain, item.analysisJobId || null,
        item.primaryColor || null, item.secondaryColors || [], item.material || null, item.pattern || null,
        item.season || [], item.occasion || [], JSON.stringify(item.styleTags?.length ? {style: item.styleTags} : {}),
        !!item.containsPerson, item.garmentVisibility || "full", item.virtualTryOnEligible !== false,
        item.sourceMarketplace || null, !!item.isNew,
      ],
    );
    const itemId = inserted.rows[0]?.id as string;

    if (item.mediaAssetId) {
      await client.query(
        `INSERT INTO wardrobe_item_media (user_id, wardrobe_item_id, media_asset_id, position, is_primary)
         VALUES ($1, $2, $3, 0, true)`,
        [userId, itemId, item.mediaAssetId],
      );
    }
    for (const tagName of item.tags || []) {
      const tag = await client.query<{id: string}>(
        `INSERT INTO tags (normalized_name, display_name) VALUES ($1, $1)
         ON CONFLICT (normalized_name) DO UPDATE SET display_name = tags.display_name
         RETURNING id`,
        [tagName],
      );
      await client.query(
        `INSERT INTO wardrobe_item_tags (wardrobe_item_id, tag_id, source) VALUES ($1, $2, 'user')
         ON CONFLICT DO NOTHING`,
        [itemId, tag.rows[0]?.id],
      );
    }
    return itemId;
  }

  async createWardrobeItem(userId: string, item: CreateWardrobeItemInput): Promise<WardrobeItem> {
    return withTransaction(this.pool, async (client) => {
      const itemId = await this.insertWardrobeItem(client, userId, item);
      return (await this.getWardrobeItemWith(client, itemId)) as WardrobeItem;
    });
  }

  // Saves every item in one transaction: either all reviewed drafts land in
  // the wardrobe together, or (on any single item's failure) none do.
  async createWardrobeItemsBatch(userId: string, items: CreateWardrobeItemInput[]): Promise<WardrobeItem[]> {
    return withTransaction(this.pool, async (client) => {
      const itemIds: string[] = [];
      for (const item of items) itemIds.push(await this.insertWardrobeItem(client, userId, item));
      return Promise.all(itemIds.map((itemId) => this.getWardrobeItemWith(client, itemId) as Promise<WardrobeItem>));
    });
  }

  // Soft-deletes the item (kept so past outfit history stays intact — see
  // outfit_items' FK RESTRICT in the schema) but also drops its now-useless
  // AI analysis result and tag links, since nothing references them once
  // the item is gone. wardrobe_item_media is left alone: the schema's
  // wardrobe_media_source constraint trigger still requires a soft-deleted
  // upload item to keep exactly one primary media row.
  //
  // The linked media_asset is archived in this SAME transaction (rather
  // than by the caller afterward) so Postgres's view of "this item is
  // deleted" is always internally consistent regardless of whether the
  // caller's best-effort Cloudinary removal succeeds — that removal, and
  // the final purge of this row, are handled separately by the periodic
  // cleanup sweep (see AssetsRepository.listPurgeableMediaAssets), which
  // retries it until it succeeds.
  async deleteWardrobeItem(itemId: string, mediaAssetId: string | null): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const updated = await client.query<{analysis_job_id: string | null}>(
        "UPDATE wardrobe_items SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING analysis_job_id",
        [itemId],
      );
      await client.query("DELETE FROM wardrobe_item_tags WHERE wardrobe_item_id = $1", [itemId]);
      const analysisJobId = updated.rows[0]?.analysis_job_id;
      if (analysisJobId) await client.query("DELETE FROM analysis_jobs WHERE id = $1", [analysisJobId]);
      if (mediaAssetId) {
        await client.query("UPDATE media_assets SET status = 'deleted', deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [mediaAssetId]);
      }
    });
  }
}
