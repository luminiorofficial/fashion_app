# NERA PostgreSQL schema

The migrations are the source of truth for the dedicated PostgreSQL database.
They are deliberately independent of a Node ORM so the schema can be reviewed,
applied, and backed up with standard PostgreSQL tooling.

Apply in filename order to an empty PostgreSQL 16+ database:

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f database/migrations/001_initial_schema.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f database/migrations/002_database_roles.sql
```

The backend also includes a migration command that reads `server/.env`, skips
versions already recorded in `schema_migrations`, and applies the remaining files:

```powershell
Set-Location server
npm.cmd run db:migrate
```

`001_initial_schema.sql` owns domain constraints, indexes, cascades, and update
triggers. It supports verified phone accounts and sessions, OTP auditability,
media storage metadata, repeatable AI-analysis jobs, current style profiles,
optional user-entered measurements, uploaded or linked wardrobe entries, tags,
and the existing outfit history flow.

OTP challenges record the delivery provider, Twilio message SID, and submission
time without storing a plaintext OTP.

## Main relationships

```text
users
  +-- otp_challenges
  +-- auth_sessions
  +-- media_assets -- analysis_jobs -- user_style_profiles
  +-- user_measurements
  +-- wardrobe_items -- wardrobe_item_media -- media_assets
  |                 +-- wardrobe_item_tags -- tags
  +-- outfits -- outfit_items -- wardrobe_items
  +-- audit_events
```

Composite foreign keys carry `user_id` through analysis, profile, media, wardrobe,
and outfit relationships. This makes cross-user references invalid at the database
layer even if an application bug supplies valid UUIDs. Context triggers also ensure
profile analysis uses profile media, wardrobe analysis uses wardrobe media, and an
uploaded wardrobe item has exactly one primary asset at transaction commit.

`schema_migrations` records both checked-in migrations. The `nera_app` role gets
only the DML privileges needed by the API and cannot read migration history or
alter schema objects. Grant this group role to the dedicated server's login role;
do not make the API login a database owner.

Images do not live in PostgreSQL. `media_assets` stores their object/local storage
key, checksum, dimensions, MIME type, and lifecycle status. This keeps the schema
compatible with local disk, S3, Cloudflare R2, or another object store. The R2
bucket is private, so `public_url` is no longer populated for new assets — the
API resolves a short-lived signed URL from `storage_key` on every read instead
of persisting a permanent one. The column is kept only for backward compatibility
with rows written before this change.

Exact weight is intentionally stored only in `user_measurements` as a value the
user provides. Image analysis stores visible body shape and styling attributes;
it must not pretend to infer an exact or medically meaningful weight.

See `repository-contract.md` before implementing the PostgreSQL adapter.
