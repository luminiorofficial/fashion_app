BEGIN;

-- New media purpose for generated virtual try-on images. Not referenced by
-- any DML in this migration, so it is safe to add inside this transaction
-- (Postgres only forbids *using* a value added by ALTER TYPE ... ADD VALUE
-- within the same transaction that added it).
ALTER TYPE media_purpose ADD VALUE IF NOT EXISTS 'tryon_result';

CREATE TYPE outfit_reaction AS ENUM ('love_it', 'would_wear', 'not_sure', 'not_my_style');

-- One feedback row per outfit, upserted as the user reacts and/or marks it worn.
CREATE TABLE outfit_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outfit_id uuid NOT NULL,
  reaction outfit_reaction,
  worn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outfit_id),
  CONSTRAINT outfit_feedback_outfit_owner_fk FOREIGN KEY (outfit_id, user_id) REFERENCES outfits(id, user_id) ON DELETE CASCADE,
  CONSTRAINT outfit_feedback_has_signal_ck CHECK (reaction IS NOT NULL OR worn_at IS NOT NULL)
);
CREATE INDEX outfit_feedback_user_idx ON outfit_feedback (user_id, updated_at DESC);
CREATE TRIGGER outfit_feedback_set_updated_at BEFORE UPDATE ON outfit_feedback FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Virtual try-on generations. Reuses job_status (queued/processing/completed/
-- failed) rather than a bespoke status enum, mirroring analysis_jobs.
CREATE TABLE tryon_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outfit_id uuid,
  wardrobe_item_ids uuid[] NOT NULL CHECK (array_length(wardrobe_item_ids, 1) BETWEEN 1 AND 6),
  profile_media_asset_id uuid NOT NULL,
  result_media_asset_id uuid,
  status job_status NOT NULL DEFAULT 'queued',
  provider varchar(60),
  model varchar(120),
  error_code varchar(80),
  error_message text,
  is_saved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (id, user_id),
  CONSTRAINT tryon_outfit_owner_fk FOREIGN KEY (outfit_id, user_id) REFERENCES outfits(id, user_id) ON DELETE SET NULL (outfit_id),
  CONSTRAINT tryon_profile_asset_owner_fk FOREIGN KEY (profile_media_asset_id, user_id) REFERENCES media_assets(id, owner_user_id) ON DELETE RESTRICT,
  CONSTRAINT tryon_result_asset_owner_fk FOREIGN KEY (result_media_asset_id, user_id) REFERENCES media_assets(id, owner_user_id) ON DELETE SET NULL (result_media_asset_id),
  CONSTRAINT tryon_completion_ck CHECK (
    (status = 'completed' AND result_media_asset_id IS NOT NULL AND completed_at IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND error_code IS NOT NULL AND completed_at IS NOT NULL)
    OR status IN ('queued', 'processing')
  )
);
CREATE INDEX tryon_requests_user_created_idx ON tryon_requests (user_id, created_at DESC);
CREATE INDEX tryon_requests_outfit_idx ON tryon_requests (outfit_id) WHERE outfit_id IS NOT NULL;

-- uuid[] columns cannot carry a real FOREIGN KEY, so ownership of every
-- referenced wardrobe item is enforced here instead, matching the strict
-- referential rules the rest of this schema applies everywhere else.
CREATE OR REPLACE FUNCTION enforce_tryon_wardrobe_items() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT count(*) INTO invalid_count
    FROM unnest(NEW.wardrobe_item_ids) AS item_id
   WHERE NOT EXISTS (
     SELECT 1 FROM wardrobe_items w WHERE w.id = item_id AND w.user_id = NEW.user_id AND w.deleted_at IS NULL
   );
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'tryon_requests.wardrobe_item_ids references items outside the owner''s wardrobe' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tryon_wardrobe_items_context BEFORE INSERT OR UPDATE OF user_id, wardrobe_item_ids ON tryon_requests FOR EACH ROW EXECUTE FUNCTION enforce_tryon_wardrobe_items();

GRANT SELECT, INSERT, UPDATE ON outfit_feedback, tryon_requests TO nera_app;

INSERT INTO schema_migrations (version) VALUES ('003_feedback_and_tryon');

COMMIT;
