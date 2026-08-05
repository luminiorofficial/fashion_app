# NERA PostgreSQL schema

The migrations are the source of truth for the dedicated PostgreSQL database.
They are deliberately independent of a Node ORM so the schema can be reviewed,
applied, and backed up with standard PostgreSQL tooling.

Apply in filename order to an empty PostgreSQL 16+ database:

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f database/migrations/001_initial_schema.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f database/migrations/002_database_roles.sql
```

`001_initial_schema.sql` owns domain constraints, indexes, cascades, and update
triggers. It supports verified phone accounts and sessions, OTP auditability,
media storage metadata, repeatable AI-analysis jobs, current style profiles,
optional user-entered measurements, uploaded or linked wardrobe entries, tags,
and the existing outfit history flow.

Images do not live in PostgreSQL. `media_assets` stores their object/local storage
key, URL, checksum, dimensions, MIME type, and lifecycle status. This keeps the
schema compatible with local disk, S3, Cloudflare R2, or another object store.

Exact weight is intentionally stored only in `user_measurements` as a value the
user provides. Image analysis stores visible body shape and styling attributes;
it must not pretend to infer an exact or medically meaningful weight.
