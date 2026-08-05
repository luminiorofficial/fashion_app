BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended', 'deleted');
CREATE TYPE otp_purpose AS ENUM ('registration', 'login', 'phone_change');
CREATE TYPE media_purpose AS ENUM ('profile_analysis', 'wardrobe_item');
CREATE TYPE media_status AS ENUM ('pending', 'ready', 'quarantined', 'deleted');
CREATE TYPE analysis_type AS ENUM ('style_profile', 'wardrobe_item');
CREATE TYPE job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
CREATE TYPE wardrobe_source_type AS ENUM ('upload', 'product_link');
CREATE TYPE outfit_status AS ENUM ('queued', 'completed', 'failed');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name varchar(120) NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  date_of_birth date NOT NULL CHECK (date_of_birth >= DATE '1900-01-01' AND date_of_birth < CURRENT_DATE),
  phone_number varchar(16) NOT NULL,
  phone_verified_at timestamptz,
  status user_status NOT NULL DEFAULT 'pending',
  locale varchar(16),
  timezone varchar(64),
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT users_phone_e164 CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT users_status_deleted_consistency CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
);
CREATE UNIQUE INDEX users_phone_active_uk ON users (phone_number) WHERE deleted_at IS NULL;
CREATE INDEX users_status_idx ON users (status);

CREATE TABLE otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  phone_number varchar(16) NOT NULL CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  purpose otp_purpose NOT NULL,
  otp_digest char(64) NOT NULL,
  pending_registration jsonb,
  provider varchar(40) NOT NULL,
  provider_message_id varchar(160),
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts smallint NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT otp_registration_payload_ck CHECK (
    (purpose = 'registration' AND user_id IS NULL AND pending_registration IS NOT NULL)
    OR (purpose <> 'registration' AND user_id IS NOT NULL)
  ),
  CONSTRAINT otp_expiry_ck CHECK (expires_at > created_at)
);
CREATE INDEX otp_phone_created_idx ON otp_challenges (phone_number, created_at DESC);
CREATE INDEX otp_active_expiry_idx ON otp_challenges (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_digest char(64) NOT NULL UNIQUE,
  device_id varchar(200),
  device_name varchar(200),
  user_agent text,
  ip_address inet,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_expiry_ck CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_user_active_idx ON auth_sessions (user_id, expires_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose media_purpose NOT NULL,
  storage_provider varchar(40) NOT NULL,
  storage_key varchar(1024) NOT NULL UNIQUE,
  public_url varchar(2048),
  original_filename varchar(255),
  mime_type varchar(100) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  width_px integer CHECK (width_px > 0),
  height_px integer CHECK (height_px > 0),
  checksum_sha256 char(64) NOT NULL,
  status media_status NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX media_assets_owner_purpose_idx ON media_assets (owner_user_id, purpose, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX media_assets_checksum_idx ON media_assets (owner_user_id, checksum_sha256);

CREATE TABLE analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  analysis_type analysis_type NOT NULL,
  status job_status NOT NULL DEFAULT 'queued',
  provider varchar(60),
  model varchar(120),
  model_version varchar(120),
  prompt_version varchar(40),
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  error_code varchar(80),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analysis_completion_ck CHECK (
    (status = 'completed' AND result IS NOT NULL AND completed_at IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND error_code IS NOT NULL AND completed_at IS NOT NULL)
    OR status IN ('queued', 'processing')
  )
);
CREATE INDEX analysis_jobs_user_type_idx ON analysis_jobs (user_id, analysis_type, created_at DESC);
CREATE INDEX analysis_jobs_queue_idx ON analysis_jobs (created_at) WHERE status = 'queued';

CREATE TABLE user_style_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  latest_analysis_job_id uuid REFERENCES analysis_jobs(id) ON DELETE SET NULL,
  body_shape varchar(160),
  skin_tone varchar(160),
  skin_undertone varchar(120),
  hair_color varchar(160),
  facial_structure varchar(160),
  style_attributes text[] NOT NULL DEFAULT '{}',
  styling_notes text,
  preferred_styles text[] NOT NULL DEFAULT '{}',
  preferred_colors text[] NOT NULL DEFAULT '{}',
  avoided_colors text[] NOT NULL DEFAULT '{}',
  analysis_confidence numeric(5,4) CHECK (analysis_confidence BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Measurements are explicitly user-provided; visual analysis must never claim an exact weight.
CREATE TABLE user_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  height_cm numeric(5,2) CHECK (height_cm BETWEEN 50 AND 300),
  weight_kg numeric(5,2) CHECK (weight_kg BETWEEN 10 AND 500),
  bust_cm numeric(5,2) CHECK (bust_cm > 0),
  waist_cm numeric(5,2) CHECK (waist_cm > 0),
  hip_cm numeric(5,2) CHECK (hip_cm > 0),
  shoulder_cm numeric(5,2) CHECK (shoulder_cm > 0),
  inseam_cm numeric(5,2) CHECK (inseam_cm > 0),
  sizing_notes text,
  measured_at date,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_measurements_current_uk ON user_measurements (user_id) WHERE is_current;

CREATE TABLE wardrobe_categories (
  id smallserial PRIMARY KEY,
  slug varchar(50) NOT NULL UNIQUE,
  display_name varchar(80) NOT NULL UNIQUE,
  parent_id smallint REFERENCES wardrobe_categories(id) ON DELETE RESTRICT,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);
INSERT INTO wardrobe_categories (slug, display_name, sort_order) VALUES
  ('top', 'Top', 10), ('bottom', 'Bottom', 20), ('outerwear', 'Outerwear', 30),
  ('dress', 'Dress', 40), ('shoes', 'Shoes', 50), ('accessory', 'Accessory', 60);

CREATE TABLE wardrobe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id smallint NOT NULL REFERENCES wardrobe_categories(id) ON DELETE RESTRICT,
  source_type wardrobe_source_type NOT NULL,
  name varchar(160) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  description text,
  brand varchar(160),
  primary_color varchar(100),
  secondary_colors text[] NOT NULL DEFAULT '{}',
  material varchar(160),
  pattern varchar(120),
  season text[] NOT NULL DEFAULT '{}',
  occasion text[] NOT NULL DEFAULT '{}',
  size_label varchar(80),
  product_url varchar(2048),
  product_domain varchar(255),
  is_favorite boolean NOT NULL DEFAULT false,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  analysis_job_id uuid REFERENCES analysis_jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT wardrobe_source_ck CHECK (
    (source_type = 'upload' AND product_url IS NULL)
    OR (source_type = 'product_link' AND product_url ~ '^https?://')
  )
);
CREATE INDEX wardrobe_items_user_created_idx ON wardrobe_items (user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX wardrobe_items_user_category_idx ON wardrobe_items (user_id, category_id) WHERE deleted_at IS NULL;

CREATE TABLE wardrobe_item_media (
  wardrobe_item_id uuid NOT NULL REFERENCES wardrobe_items(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  position smallint NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wardrobe_item_id, media_asset_id),
  UNIQUE (wardrobe_item_id, position)
);
CREATE UNIQUE INDEX wardrobe_item_primary_media_uk ON wardrobe_item_media (wardrobe_item_id) WHERE is_primary;

CREATE TABLE tags (
  id bigserial PRIMARY KEY,
  normalized_name varchar(80) NOT NULL UNIQUE,
  display_name varchar(80) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wardrobe_item_tags (
  wardrobe_item_id uuid NOT NULL REFERENCES wardrobe_items(id) ON DELETE CASCADE,
  tag_id bigint NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  source varchar(20) NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'analysis', 'system')),
  PRIMARY KEY (wardrobe_item_id, tag_id)
);

-- Existing outfit behavior is retained so later requirements do not require a schema rewrite.
CREATE TABLE outfits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type varchar(100) NOT NULL,
  status outfit_status NOT NULL DEFAULT 'queued',
  rationale text,
  suggested_purchase jsonb CHECK (suggested_purchase IS NULL OR jsonb_typeof(suggested_purchase) = 'object'),
  analysis_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(analysis_context) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX outfits_user_created_idx ON outfits (user_id, created_at DESC);
CREATE TABLE outfit_items (
  outfit_id uuid NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
  wardrobe_item_id uuid NOT NULL REFERENCES wardrobe_items(id) ON DELETE RESTRICT,
  position smallint NOT NULL CHECK (position >= 0),
  PRIMARY KEY (outfit_id, wardrobe_item_id),
  UNIQUE (outfit_id, position)
);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type varchar(100) NOT NULL,
  entity_type varchar(80),
  entity_id uuid,
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_user_created_idx ON audit_events (user_id, created_at DESC);
CREATE INDEX audit_events_type_created_idx ON audit_events (event_type, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER media_assets_set_updated_at BEFORE UPDATE ON media_assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER style_profiles_set_updated_at BEFORE UPDATE ON user_style_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER measurements_set_updated_at BEFORE UPDATE ON user_measurements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER wardrobe_items_set_updated_at BEFORE UPDATE ON wardrobe_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
