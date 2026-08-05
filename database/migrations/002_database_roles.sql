-- Run this migration as the database owner after replacing the example role names.
-- The application role intentionally cannot alter or drop schema objects.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nera_app') THEN
    CREATE ROLE nera_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nera_migrator') THEN
    CREATE ROLE nera_migrator NOLOGIN;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO nera_app, nera_migrator', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO nera_app;
GRANT SELECT ON wardrobe_categories TO nera_app;
GRANT SELECT, INSERT, UPDATE ON
  users, otp_challenges, auth_sessions, media_assets, analysis_jobs,
  user_style_profiles, user_measurements, wardrobe_items, tags, outfits
TO nera_app;
GRANT INSERT ON audit_events TO nera_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  wardrobe_item_media, wardrobe_item_tags, outfit_items
TO nera_app;
GRANT USAGE, SELECT ON SEQUENCE tags_id_seq, audit_events_id_seq TO nera_app;

GRANT ALL PRIVILEGES ON SCHEMA public TO nera_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nera_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nera_migrator;

INSERT INTO schema_migrations (version) VALUES ('002_database_roles');
