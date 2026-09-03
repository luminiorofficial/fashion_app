BEGIN;

-- Adds "other" as a valid purchase_imports.marketplace value: the generic
-- fallback Gmail parser (server/src/commerce/parsers/generic-email.parser.ts)
-- detects delivered fashion purchases from allow-listed retailer domains
-- that don't have their own structured marketplace parser, and reports
-- marketplace = 'other' for all of them (see server/src/types/commerce.types.ts).
ALTER TABLE purchase_imports DROP CONSTRAINT purchase_imports_marketplace_check;
ALTER TABLE purchase_imports ADD CONSTRAINT purchase_imports_marketplace_check
  CHECK (marketplace IN ('amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'other'));

INSERT INTO schema_migrations (version) VALUES ('007_generic_marketplace_fallback');

COMMIT;
