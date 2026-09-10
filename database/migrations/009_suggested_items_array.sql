BEGIN;

-- Keep the existing JSONB column and all outfit history. Legacy rows may
-- remain objects (or null); application reads normalize them to arrays while
-- all new writes use arrays.
ALTER TABLE outfits
  DROP CONSTRAINT IF EXISTS outfits_suggested_purchase_check;

ALTER TABLE outfits
  ADD CONSTRAINT outfits_suggested_purchase_check
  CHECK (
    suggested_purchase IS NULL
    OR jsonb_typeof(suggested_purchase) IN ('object', 'array')
  );

COMMIT;
