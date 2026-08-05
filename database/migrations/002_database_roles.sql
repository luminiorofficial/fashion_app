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
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nera_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nera_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nera_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nera_app;

GRANT ALL PRIVILEGES ON SCHEMA public TO nera_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nera_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nera_migrator;
