const {Pool} = require("pg");

const iso = (value) => value instanceof Date ? value.toISOString() : value;

function userFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.full_name,
    dateOfBirth: iso(row.date_of_birth),
    phoneNumber: row.phone_number,
    phoneVerifiedAt: iso(row.phone_verified_at),
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function challengeFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    phoneNumber: row.phone_number,
    purpose: row.purpose,
    otpHash: row.otp_digest,
    registration: row.pending_registration,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    submittedAt: iso(row.submitted_at),
    attempts: row.attempt_count,
    maxAttempts: row.max_attempts,
    expiresAt: iso(row.expires_at),
    consumedAt: iso(row.consumed_at),
    createdAt: iso(row.created_at),
  };
}

function sessionFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_digest,
    expiresAt: iso(row.expires_at),
    revokedAt: iso(row.revoked_at),
    createdAt: iso(row.created_at),
  };
}

function assetFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.owner_user_id,
    purpose: row.purpose,
    storageProvider: row.storage_provider,
    storageKey: row.storage_key,
    publicUrl: row.public_url,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    checksumSha256: row.checksum_sha256,
    status: row.status,
    createdAt: iso(row.created_at),
    deletedAt: iso(row.deleted_at),
  };
}

function jobFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    mediaAssetId: row.media_asset_id,
    analysisType: row.analysis_type,
    status: row.status,
    provider: row.provider,
    model: row.model,
    result: row.result,
    completedAt: iso(row.completed_at),
    createdAt: iso(row.created_at),
  };
}

function profileFromRow(row) {
  if (!row) return {};
  return {
    userId: row.user_id,
    bodyType: row.body_shape,
    skinTone: row.skin_tone,
    skinUndertone: row.skin_undertone,
    hairColor: row.hair_color,
    facialStructure: row.facial_structure,
    styleAttributes: row.style_attributes || [],
    stylingNotes: row.styling_notes,
    profileImageAssetId: row.profile_image_asset_id,
    profileImageStorageKey: row.profile_image_storage_key || null,
    latestAnalysisJobId: row.latest_analysis_job_id,
    updatedAt: iso(row.updated_at),
  };
}

function wardrobeFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    category: row.category,
    sourceType: row.source_type,
    imageStorageKey: row.image_storage_key || null,
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
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    deletedAt: iso(row.deleted_at),
  };
}

function outfitFromRow(row, wardrobeItemIds) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    status: row.status,
    rationale: row.rationale,
    suggestedPurchaseItem: row.suggested_purchase || null,
    wardrobeItemIds,
    createdAt: iso(row.created_at),
    completedAt: iso(row.completed_at),
  };
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
    COALESCE((SELECT array_agg(tag.normalized_name ORDER BY tag.normalized_name)
       FROM wardrobe_item_tags item_tag
       JOIN tags tag ON tag.id = item_tag.tag_id
      WHERE item_tag.wardrobe_item_id = item.id), '{}') AS tags
    FROM wardrobe_items item
    JOIN wardrobe_categories category ON category.id = item.category_id`;

class PostgresRepository {
  constructor(configOrPool) {
    if (typeof configOrPool?.query === "function") {
      this.pool = configOrPool;
      this.ownsPool = false;
      return;
    }
    const config = configOrPool || {};
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolMax || 10,
      ssl: config.databaseSsl ? {rejectUnauthorized: config.databaseSslRejectUnauthorized} : false,
    });
    this.ownsPool = true;
  }

  async connect() {
    const result = await this.pool.query("SELECT current_database() AS database, current_user AS username");
    return result.rows[0];
  }

  async close() {
    if (this.ownsPool) await this.pool.end();
  }

  async health() {
    const startedAt = Date.now();
    const result = await this.pool.query("SELECT current_database() AS database");
    return {status: "ok", adapter: "postgresql", database: result.rows[0].database, latencyMs: Date.now() - startedAt};
  }

  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserByPhone(phoneNumber) {
    const result = await this.pool.query("SELECT * FROM users WHERE phone_number = $1 AND deleted_at IS NULL", [phoneNumber]);
    return userFromRow(result.rows[0]);
  }

  async findOrCreateUser({name, dateOfBirth, phoneNumber}) {
    const result = await this.pool.query(`
      INSERT INTO users (full_name, date_of_birth, phone_number, phone_verified_at, status, last_login_at)
      VALUES ($1, $2, $3, now(), 'active', now())
      ON CONFLICT (phone_number) WHERE deleted_at IS NULL
      DO UPDATE SET last_login_at = now()
      RETURNING *`, [name, dateOfBirth, phoneNumber]);
    return userFromRow(result.rows[0]);
  }

  async findUserById(userId) {
    const result = await this.pool.query("SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL", [userId]);
    return userFromRow(result.rows[0]);
  }

  async createChallenge(challenge) {
    const result = await this.pool.query(`
      INSERT INTO otp_challenges
        (id, user_id, phone_number, purpose, otp_digest, pending_registration, provider, expires_at, max_attempts)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`, [challenge.id, challenge.userId, challenge.phoneNumber, challenge.purpose, challenge.otpHash,
      challenge.registration ? JSON.stringify(challenge.registration) : null, challenge.provider, challenge.expiresAt, challenge.maxAttempts]);
    return challengeFromRow(result.rows[0]);
  }

  async countRecentChallenges(phoneNumber, since) {
    const result = await this.pool.query("SELECT count(*)::int AS count FROM otp_challenges WHERE phone_number = $1 AND created_at >= $2", [phoneNumber, since]);
    return result.rows[0].count;
  }

  async getChallenge(challengeId) {
    const result = await this.pool.query("SELECT * FROM otp_challenges WHERE id = $1", [challengeId]);
    return challengeFromRow(result.rows[0]);
  }

  async recordChallengeAttempt(challengeId, expectedAttempts, {consumedAt = null} = {}) {
    const result = await this.pool.query(`
      UPDATE otp_challenges
         SET attempt_count = attempt_count + 1,
             consumed_at = COALESCE($3, consumed_at)
       WHERE id = $1
         AND attempt_count = $2
         AND attempt_count < max_attempts
         AND consumed_at IS NULL
         AND expires_at > now()
      RETURNING *`, [challengeId, expectedAttempts, consumedAt]);
    return challengeFromRow(result.rows[0]);
  }

  async markChallengeDelivered(challengeId, {providerMessageId, submittedAt}) {
    const result = await this.pool.query(`
      UPDATE otp_challenges SET provider_message_id = $2, submitted_at = $3 WHERE id = $1 RETURNING *`,
    [challengeId, providerMessageId, submittedAt]);
    return challengeFromRow(result.rows[0]);
  }

  async createSession({userId, tokenHash, expiresAt}) {
    const result = await this.pool.query(`
      INSERT INTO auth_sessions (user_id, token_digest, expires_at) VALUES ($1, $2, $3) RETURNING *`,
    [userId, tokenHash, expiresAt]);
    return sessionFromRow(result.rows[0]);
  }

  async findSession(tokenHash) {
    const result = await this.pool.query(`
      UPDATE auth_sessions SET last_used_at = now()
       WHERE token_digest = $1 AND revoked_at IS NULL AND expires_at > now()
      RETURNING *`, [tokenHash]);
    return sessionFromRow(result.rows[0]);
  }

  async revokeSession(tokenHash) {
    await this.pool.query("UPDATE auth_sessions SET revoked_at = now() WHERE token_digest = $1 AND revoked_at IS NULL", [tokenHash]);
  }

  async createAsset(asset) {
    const result = await this.pool.query(`
      INSERT INTO media_assets
        (owner_user_id, purpose, storage_provider, storage_key, public_url, original_filename, mime_type, byte_size, checksum_sha256, status)
      VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, 'ready')
      RETURNING *`, [asset.userId, asset.purpose, asset.storageProvider, asset.storageKey,
      asset.originalFilename, asset.mimeType, asset.byteSize, asset.checksumSha256]);
    return assetFromRow(result.rows[0]);
  }

  async getAsset(assetId) {
    const result = await this.pool.query("SELECT * FROM media_assets WHERE id = $1 AND deleted_at IS NULL", [assetId]);
    return assetFromRow(result.rows[0]);
  }

  async archiveAsset(assetId) {
    await this.pool.query("UPDATE media_assets SET status = 'deleted', deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [assetId]);
  }

  async createAnalysisJob(job) {
    const result = await this.pool.query(`
      INSERT INTO analysis_jobs
        (user_id, media_asset_id, analysis_type, status, provider, model, result, started_at, completed_at)
      VALUES ($1, $2, $3, 'completed', $4, $5, $6, now(), now())
      RETURNING *`, [job.userId, job.mediaAssetId, job.analysisType, job.provider, job.model, JSON.stringify(job.result)]);
    return jobFromRow(result.rows[0]);
  }

  async getAnalysisJob(jobId) {
    const result = await this.pool.query("SELECT * FROM analysis_jobs WHERE id = $1", [jobId]);
    return jobFromRow(result.rows[0]);
  }

  async saveProfile(userId, profile) {
    const result = await this.pool.query(`
      WITH saved_profile AS (
      INSERT INTO user_style_profiles
        (user_id, body_shape, skin_tone, skin_undertone, hair_color, facial_structure, style_attributes,
         styling_notes, profile_image_asset_id, latest_analysis_job_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (user_id) DO UPDATE SET
        body_shape = EXCLUDED.body_shape,
        skin_tone = EXCLUDED.skin_tone,
        skin_undertone = EXCLUDED.skin_undertone,
        hair_color = EXCLUDED.hair_color,
        facial_structure = EXCLUDED.facial_structure,
        style_attributes = EXCLUDED.style_attributes,
        styling_notes = EXCLUDED.styling_notes,
        profile_image_asset_id = EXCLUDED.profile_image_asset_id,
        latest_analysis_job_id = EXCLUDED.latest_analysis_job_id
      RETURNING *)
      SELECT saved_profile.*, asset.storage_key AS profile_image_storage_key
        FROM saved_profile
        LEFT JOIN media_assets asset ON asset.id = saved_profile.profile_image_asset_id`,
    [userId, profile.bodyType, profile.skinTone, profile.skinUndertone, profile.hairColor, profile.facialStructure,
      profile.styleAttributes || [], profile.stylingNotes, profile.profileImageAssetId, profile.latestAnalysisJobId]);
    return profileFromRow(result.rows[0]);
  }

  async getProfile(userId) {
    const result = await this.pool.query(`
      SELECT profile.*, asset.storage_key AS profile_image_storage_key
        FROM user_style_profiles profile
        LEFT JOIN media_assets asset ON asset.id = profile.profile_image_asset_id
       WHERE profile.user_id = $1`, [userId]);
    return profileFromRow(result.rows[0]);
  }

  async listWardrobe(userId) {
    const result = await this.pool.query(`${wardrobeSelect}
      WHERE item.user_id = $1 AND item.deleted_at IS NULL ORDER BY item.created_at DESC`, [userId]);
    return result.rows.map(wardrobeFromRow);
  }

  async getWardrobeItem(itemId) {
    return this.getWardrobeItemWith(this.pool, itemId);
  }

  async getWardrobeItemWith(queryable, itemId) {
    const result = await queryable.query(`${wardrobeSelect} WHERE item.id = $1`, [itemId]);
    return wardrobeFromRow(result.rows[0]);
  }

  async createWardrobeItem(userId, item) {
    return this.transaction(async (client) => {
      const category = await client.query("SELECT id FROM wardrobe_categories WHERE display_name = $1 AND is_active", [item.category]);
      if (!category.rows[0]) throw Object.assign(new Error(`Unknown wardrobe category: ${item.category}`), {code: "INVALID_CATEGORY"});
      const productDomain = item.productUrl ? new URL(item.productUrl).hostname : null;
      const inserted = await client.query(`
        INSERT INTO wardrobe_items
          (user_id, category_id, source_type, name, product_url, product_domain, analysis_job_id,
           primary_color, secondary_colors, material, pattern, season, occasion, attributes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id`, [userId, category.rows[0].id, item.sourceType, item.name, item.productUrl, productDomain, item.analysisJobId || null,
        item.primaryColor || null, item.secondaryColors || [], item.material || null, item.pattern || null,
        item.season || [], item.occasion || [], JSON.stringify(item.styleTags?.length ? {style: item.styleTags} : {})]);
      const itemId = inserted.rows[0].id;

      if (item.mediaAssetId) {
        await client.query(`
          INSERT INTO wardrobe_item_media (user_id, wardrobe_item_id, media_asset_id, position, is_primary)
          VALUES ($1, $2, $3, 0, true)`, [userId, itemId, item.mediaAssetId]);
      }
      for (const tagName of item.tags || []) {
        const tag = await client.query(`
          INSERT INTO tags (normalized_name, display_name) VALUES ($1, $1)
          ON CONFLICT (normalized_name) DO UPDATE SET display_name = tags.display_name
          RETURNING id`, [tagName]);
        await client.query(`
          INSERT INTO wardrobe_item_tags (wardrobe_item_id, tag_id, source) VALUES ($1, $2, 'user')
          ON CONFLICT DO NOTHING`, [itemId, tag.rows[0].id]);
      }
      return this.getWardrobeItemWith(client, itemId);
    });
  }

  async deleteWardrobeItem(itemId) {
    await this.pool.query("UPDATE wardrobe_items SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [itemId]);
  }

  async createOutfit(userId, {eventType, rationale, wardrobeItemIds, suggestedPurchaseItem, analysisContext}) {
    return this.transaction(async (client) => {
      const inserted = await client.query(`
        INSERT INTO outfits (user_id, event_type, status, rationale, suggested_purchase, analysis_context, completed_at)
        VALUES ($1, $2, 'completed', $3, $4, $5, now())
        RETURNING *`, [userId, eventType, rationale, suggestedPurchaseItem ? JSON.stringify(suggestedPurchaseItem) : null, JSON.stringify(analysisContext || {})]);
      const outfit = inserted.rows[0];
      let position = 0;
      for (const wardrobeItemId of wardrobeItemIds) {
        await client.query(`
          INSERT INTO outfit_items (user_id, outfit_id, wardrobe_item_id, position)
          VALUES ($1, $2, $3, $4)`, [userId, outfit.id, wardrobeItemId, position]);
        position += 1;
      }
      return outfitFromRow(outfit, wardrobeItemIds);
    });
  }
}

module.exports = {PostgresRepository};
