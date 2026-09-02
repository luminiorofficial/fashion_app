BEGIN;

-- Gmail-based e-commerce purchase detection (server/src/commerce). A user
-- may connect one Gmail account for read-only order-email scanning;
-- Google OAuth tokens are stored encrypted and never leave the backend.
-- Every parsed order-lifecycle email (confirmed/shipped/delivered/
-- cancelled/returned) upserts one purchase_imports row per order/product,
-- so a later cancellation naturally excludes it from the review queue
-- without a separate "superseded" status (see ReviewStatus in
-- server/src/types/commerce.types.ts for the reasoning).

CREATE TABLE gmail_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  google_email varchar(255) NOT NULL,
  google_account_id varchar(128),
  access_token_ciphertext text,
  access_token_expires_at timestamptz,
  refresh_token_ciphertext text,
  scope text,
  status varchar(20) NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'error')),
  last_sync_status varchar(20) NOT NULL DEFAULT 'idle' CHECK (last_sync_status IN ('idle', 'syncing', 'completed', 'failed')),
  last_synced_at timestamptz,
  last_sync_error text,
  initial_sync_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  UNIQUE (id, user_id),
  CONSTRAINT gmail_connection_status_disconnected_ck CHECK ((status = 'disconnected') = (disconnected_at IS NOT NULL)),
  -- A disconnected/never-fully-connected row may have no refresh token
  -- (disconnect clears it); a connected one always must.
  CONSTRAINT gmail_connection_status_tokens_ck CHECK (status <> 'connected' OR refresh_token_ciphertext IS NOT NULL)
);

CREATE TABLE purchase_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gmail_connection_id uuid NOT NULL,
  marketplace varchar(40) NOT NULL CHECK (marketplace IN ('amazon', 'flipkart', 'myntra', 'ajio', 'meesho')),
  order_id varchar(160),
  product_identity varchar(160) NOT NULL CHECK (char_length(btrim(product_identity)) > 0),
  product_name varchar(300) NOT NULL CHECK (char_length(btrim(product_name)) BETWEEN 1 AND 300),
  brand varchar(160),
  product_image_url varchar(2048),
  size_label varchar(80),
  color_label varchar(80),
  quantity smallint NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  currency varchar(8),
  price_amount numeric(12, 2) CHECK (price_amount IS NULL OR price_amount >= 0),
  order_status varchar(20) NOT NULL CHECK (order_status IN ('confirmed', 'shipped', 'delivered', 'cancelled', 'returned')),
  ordered_at timestamptz,
  delivered_at timestamptz,
  latest_event_at timestamptz NOT NULL,
  -- "pending" means only "no user decision yet"; visibility in the
  -- Purchases UI additionally requires order_status = 'delivered' (see the
  -- partial index below), so no separate "superseded" status is needed.
  review_status varchar(20) NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'imported', 'ignored')),
  imported_wardrobe_item_id uuid,
  email_subject varchar(500),
  latest_message_id varchar(160),
  source_message_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_import_connection_owner_fk FOREIGN KEY (gmail_connection_id, user_id) REFERENCES gmail_connections(id, user_id) ON DELETE CASCADE,
  CONSTRAINT purchase_import_wardrobe_owner_fk FOREIGN KEY (imported_wardrobe_item_id, user_id) REFERENCES wardrobe_items(id, user_id) ON DELETE SET NULL (imported_wardrobe_item_id),
  CONSTRAINT purchase_import_review_ck CHECK ((review_status = 'imported') = (imported_wardrobe_item_id IS NOT NULL))
);
-- Dedup (requirement: prevent duplicate imports by marketplace order id /
-- product identity). Two partial indexes because a plain UNIQUE treats
-- every NULL order_id as distinct, which would let identity-only dedup
-- silently fail for orders whose email never exposes an order id.
CREATE UNIQUE INDEX purchase_imports_order_uk ON purchase_imports (user_id, marketplace, order_id, product_identity) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX purchase_imports_no_order_uk ON purchase_imports (user_id, marketplace, product_identity) WHERE order_id IS NULL;
CREATE INDEX purchase_imports_pending_idx ON purchase_imports (user_id, delivered_at DESC) WHERE review_status = 'pending' AND order_status = 'delivered';
CREATE INDEX purchase_imports_connection_idx ON purchase_imports (gmail_connection_id);

-- Idempotent skip-list: makes re-scanning an overlapping date window (the
-- normal case for every incremental sync) a no-op, which is what actually
-- makes "prevent duplicate imports using Gmail message ID" real, distinct
-- from the order/product-identity dedup above.
CREATE TABLE gmail_processed_messages (
  gmail_connection_id uuid NOT NULL REFERENCES gmail_connections(id) ON DELETE CASCADE,
  gmail_message_id varchar(160) NOT NULL,
  marketplace varchar(40),
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gmail_connection_id, gmail_message_id)
);

CREATE TRIGGER gmail_connections_set_updated_at BEFORE UPDATE ON gmail_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER purchase_imports_set_updated_at BEFORE UPDATE ON purchase_imports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON gmail_connections, purchase_imports, gmail_processed_messages TO nera_app;

INSERT INTO schema_migrations (version) VALUES ('006_gmail_commerce_integration');

COMMIT;
