BEGIN;

-- Wardrobe analysis now also reports whether a person/model is visible in
-- the uploaded photo (garment-only images are no longer the only accepted
-- shot) and whether the exact stored photo is safe to send directly to
-- Virtual Try-On. Existing rows default to the pre-feature behavior: no
-- person detected, a fully-visible garment, and (since try-on eligibility
-- for them was previously gated only by source_type/storage provider)
-- still eligible for try-on.
ALTER TABLE wardrobe_items
  ADD COLUMN contains_person boolean NOT NULL DEFAULT false,
  ADD COLUMN garment_visibility varchar(20) NOT NULL DEFAULT 'full' CHECK (garment_visibility IN ('full', 'partial', 'occluded')),
  ADD COLUMN virtual_tryon_eligible boolean NOT NULL DEFAULT true;

INSERT INTO schema_migrations (version) VALUES ('004_wardrobe_person_visibility');

COMMIT;
