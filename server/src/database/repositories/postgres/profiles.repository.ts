import type {Pool} from "pg";
import {iso} from "../../postgres";
import type {ProfilesRepository} from "../../../types/repositories";
import type {StyleProfile, SaveProfileInput} from "../../../types/profile.types";

interface ProfileRow {
  user_id: string;
  body_shape: string | null;
  skin_tone: string | null;
  skin_undertone: string | null;
  hair_color: string | null;
  facial_structure: string | null;
  style_attributes: string[] | null;
  styling_notes: string | null;
  profile_image_asset_id: string | null;
  profile_image_storage_key: string | null;
  profile_image_storage_provider: string | null;
  latest_analysis_job_id: string | null;
  updated_at: string | Date;
}

function profileFromRow(row: ProfileRow | undefined): StyleProfile {
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
    profileImageStorageProvider: row.profile_image_storage_provider || null,
    latestAnalysisJobId: row.latest_analysis_job_id,
    updatedAt: iso(row.updated_at) as string,
  };
}

export class PostgresProfilesRepository implements ProfilesRepository {
  constructor(private readonly pool: Pool) {}

  async saveProfile(userId: string, profile: SaveProfileInput): Promise<StyleProfile> {
    const result = await this.pool.query<ProfileRow>(
      `WITH saved_profile AS (
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
       SELECT saved_profile.*, asset.storage_key AS profile_image_storage_key,
         asset.storage_provider AS profile_image_storage_provider
         FROM saved_profile
         LEFT JOIN media_assets asset ON asset.id = saved_profile.profile_image_asset_id`,
      [
        userId, profile.bodyType, profile.skinTone, profile.skinUndertone, profile.hairColor, profile.facialStructure,
        profile.styleAttributes || [], profile.stylingNotes, profile.profileImageAssetId, profile.latestAnalysisJobId,
      ],
    );
    return profileFromRow(result.rows[0]);
  }

  async getProfile(userId: string): Promise<StyleProfile> {
    const result = await this.pool.query<ProfileRow>(
      `SELECT profile.*, asset.storage_key AS profile_image_storage_key,
         asset.storage_provider AS profile_image_storage_provider
         FROM user_style_profiles profile
         LEFT JOIN media_assets asset ON asset.id = profile.profile_image_asset_id
        WHERE profile.user_id = $1`,
      [userId],
    );
    return profileFromRow(result.rows[0]);
  }
}
