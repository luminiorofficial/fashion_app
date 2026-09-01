BEGIN;

CREATE TYPE ai_usage_status AS ENUM ('started', 'succeeded', 'failed');

CREATE TABLE rate_limit_buckets (
  bucket_key varchar(160) PRIMARY KEY,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_limit_buckets_reset_idx ON rate_limit_buckets (reset_at);

CREATE TABLE ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation varchar(40) NOT NULL CHECK (operation IN ('profile_analysis', 'wardrobe_analysis', 'outfit_generation', 'virtual_tryon')),
  provider varchar(60) NOT NULL,
  model varchar(120),
  request_key char(64) CHECK (request_key IS NULL OR request_key ~ '^[0-9a-f]{64}$'),
  status ai_usage_status NOT NULL DEFAULT 'started',
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  estimated_input_units integer CHECK (estimated_input_units IS NULL OR estimated_input_units >= 0),
  estimated_output_units integer CHECK (estimated_output_units IS NULL OR estimated_output_units >= 0),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT ai_usage_completion_ck CHECK ((status = 'started' AND completed_at IS NULL) OR (status <> 'started' AND completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX ai_usage_idempotency_uk ON ai_usage_events (user_id, operation, request_key) WHERE request_key IS NOT NULL;
CREATE INDEX ai_usage_quota_idx ON ai_usage_events (user_id, operation, requested_at DESC);
CREATE INDEX ai_usage_active_idx ON ai_usage_events (user_id, requested_at) WHERE status = 'started';
CREATE INDEX ai_usage_cleanup_idx ON ai_usage_events (requested_at) WHERE status <> 'started';

-- Targeted maintenance/lookup indexes not covered by earlier composite indexes.
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions (expires_at);
CREATE INDEX otp_challenges_expiry_idx ON otp_challenges (expires_at);
CREATE INDEX media_assets_cleanup_idx ON media_assets (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX media_assets_orphan_scan_idx ON media_assets (created_at) WHERE deleted_at IS NULL;
CREATE INDEX analysis_jobs_cleanup_idx ON analysis_jobs (created_at);
CREATE INDEX tryon_unsaved_cleanup_idx ON tryon_requests (created_at) WHERE is_saved = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_buckets, ai_usage_events TO nera_app;
GRANT DELETE ON otp_challenges, auth_sessions, media_assets, analysis_jobs, user_style_profiles,
  user_measurements, wardrobe_items, outfits, outfit_feedback, tryon_requests, audit_events TO nera_app;

INSERT INTO schema_migrations (version) VALUES ('005_production_hardening');

COMMIT;
