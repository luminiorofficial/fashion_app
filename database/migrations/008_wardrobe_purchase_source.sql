BEGIN;

-- Tracks a wardrobe item's Gmail/marketplace purchase provenance (see
-- server/src/commerce/purchase-import.service.ts's addToWardrobe) so the
-- app can show a "NEW" badge on an item that came from a detected purchase
-- until the user opens it. NULL for every manually photographed/linked
-- item (source_marketplace absent implies is_new is always false for them
-- — see the wardrobe_item_new_requires_source_ck constraint below).
-- source_marketplace intentionally mirrors purchase_imports.marketplace's
-- vocabulary (database/migrations/006_gmail_commerce_integration.sql,
-- 007_generic_marketplace_fallback.sql) but is kept as its own column
-- rather than a foreign key — wardrobe_items must stay valid even after a
-- purchase_imports row is pruned/changes, and a manually-added item never
-- has a purchase_imports row to reference in the first place.
ALTER TABLE wardrobe_items
  ADD COLUMN source_marketplace varchar(40)
    CHECK (source_marketplace IS NULL OR source_marketplace IN ('amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'other')),
  ADD COLUMN is_new boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT wardrobe_item_new_requires_source_ck CHECK (NOT is_new OR source_marketplace IS NOT NULL);

INSERT INTO schema_migrations (version) VALUES ('008_wardrobe_purchase_source');

COMMIT;
