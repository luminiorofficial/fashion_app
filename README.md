# NERA mobile AI stylist

NERA is a Flutter mobile client backed by a dedicated Node.js REST API. Firebase
has been removed. The target persistence layer is PostgreSQL; the complete schema
is checked in now, while the API currently uses an in-memory repository adapter
so development can continue before the database server is available.

## Implemented in this phase

- Registration with full name, date of birth, E.164 phone number, and OTP verification.
- Opaque, revocable bearer sessions stored by the app in platform secure storage.
- Full-body image upload and fashion-oriented analysis for body shape, skin tone
  and undertone, hair color, facial structure, styling attributes, and notes.
- Wardrobe image upload with AI-assisted name/category/tags and user review.
- Wardrobe entries created directly from HTTP/HTTPS product links.
- Owner-scoped profile, asset, analysis, and wardrobe APIs.
- A complete PostgreSQL schema with constraints, indexes, roles, and relationships.
- OTP request throttling and atomic challenge-attempt/session repository boundaries.

Image analysis does not claim to detect health, ethnicity, or an exact weight.
The schema stores exact measurements only when a user explicitly provides them.

## Project layout

```text
lib/                         Flutter app and REST backend adapter
server/src/                  Express API, auth, storage, analysis, repository port
server/test/                 API integration tests
database/migrations/         PostgreSQL schema and least-privilege roles
database/README.md           Schema application notes
```

## Local API

Prerequisites: Node.js 22+ and Flutter.

```powershell
Set-Location server
npm install
Copy-Item .env.example .env
npm start
```

`npm start` automatically loads `server/.env` when it exists. Keep that ignored
file local and never commit credentials. With `SMS_PROVIDER=console`, the OTP is
returned as `developmentOtp` and logged for local testing.

For real SMS delivery, create a Twilio Messaging Service with a sender in its
Sender Pool (or use a Twilio sender number), then configure:

```dotenv
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_MESSAGING_SERVICE_SID=MG...
# TWILIO_FROM_NUMBER=+1...  # use instead of Messaging Service SID if needed
```

Twilio mode never returns the OTP in the API response. Twilio credentials remain
server-side; the Flutter application must never contain them.

Without `GEMINI_API_KEY`, image endpoints still exercise the upload/storage flow
and return a clearly marked development fallback. Set the key to enable analysis.
Uploaded images default to `server/data/uploads`, which is gitignored.
That local store is for development only; production should use private object
storage with expiring signed URLs for full-body and wardrobe images.

The Android emulator uses the default API URL `http://10.0.2.2:8080/api/v1`.
Override it for iOS, web, a physical device, or a deployed server. `env/dev.json`
and `env/prod.json` hold that value for reuse instead of retyping the flag:

```powershell
flutter run --dart-define-from-file=env/dev.json
# or ad-hoc, e.g. testing from a physical device over LAN:
flutter run --dart-define=NERA_API_BASE_URL=http://192.168.1.20:8080/api/v1
```

Release builds have no built-in default and fail fast if `NERA_API_BASE_URL`
isn't set. Point `env/prod.json` at your deployed API (see "Deploy the API to
Vercel" below) and build with:

```powershell
flutter build apk --release --dart-define-from-file=env/prod.json
flutter build appbundle --release --dart-define-from-file=env/prod.json
flutter build ios --release --dart-define-from-file=env/prod.json
```

## API surface

All user data routes are owner-scoped by the bearer session.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/otp/request` | Start registration or login OTP |
| `POST` | `/api/v1/auth/otp/verify` | Verify OTP and create a revocable session |
| `GET` | `/api/v1/me` | Return the authenticated user |
| `POST` | `/api/v1/profile/analyze` | Upload and analyze a full-body image |
| `GET` | `/api/v1/profile` | Return the current style profile |
| `POST` | `/api/v1/wardrobe/analyze` | Upload and analyze a wardrobe image draft |
| `POST` | `/api/v1/wardrobe/items` | Save a reviewed upload draft |
| `POST` | `/api/v1/wardrobe/links` | Save an HTTP/HTTPS product link |
| `GET` | `/api/v1/wardrobe/items` | List the user's wardrobe |
| `DELETE` | `/api/v1/wardrobe/items/:itemId` | Soft-delete a wardrobe item |

## PostgreSQL setup

The API uses PostgreSQL whenever `DATABASE_URL` is present in `server/.env` and
falls back to temporary in-memory storage only when it is absent. Create an empty
database (the examples use `nera`) in pgAdmin, then configure and migrate it:

```powershell
Copy-Item server/.env.example server/.env
# Edit server/.env and replace the DATABASE_URL password/database values.
Set-Location server
npm.cmd run db:migrate
npm.cmd start
```

Open `http://localhost:8080/api/v1/health`. A connected server reports
`database.adapter` as `postgresql` and includes the database name. Passwords with
special URL characters must be URL-encoded in `DATABASE_URL`. Standard local
PostgreSQL installations should keep `DATABASE_SSL=false`.

See `database/README.md` for the covered entities, ownership rules, and storage
model. PostgreSQL 16+ is required.

## Deploy the API to Vercel

The API is an Express app. `server/api/index.js` wraps it as a Vercel
serverless function (`src/index.js` with `app.listen()` is for local dev
only); `server/vercel.json` routes `/api/v1/*` to it and schedules
`server/api/cron/cleanup.js` daily to replace the in-process cleanup timer,
which doesn't run on serverless.

This project is configured for the **Vercel Hobby plan**: `vercel.json` sets
`maxDuration: 60` (Hobby's hard cap) and the cron runs once a day (Hobby only
supports daily schedules). `GEMINI_IMAGE_TIMEOUT_MS` in `server/.env` is
lowered to `55000` to fit inside that 60s window. If you move to Vercel Pro
later, raise `maxDuration` (up to 300s+), `GEMINI_IMAGE_TIMEOUT_MS` (back
toward 120000), and the cron schedule (e.g. `0 */6 * * *`) accordingly.

1. In the Vercel dashboard, create a project from this repo and set its
   **Root Directory** to `server`.
2. Add every variable from `server/.env.example` as a Vercel **production**
   environment variable — Vercel does not read `server/.env` (and it isn't
   committed). At minimum: `DATABASE_URL`, `DATABASE_SSL=true`,
   `DATABASE_SSL_REJECT_UNAUTHORIZED=false` (DigitalOcean managed Postgres
   uses a cert Node doesn't trust by default; without this the API crashes
   on every cold start with "self-signed certificate in certificate chain"),
   `OTP_HASH_SECRET` (a new random value, not your local one),
   `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
   `IMAGE_STORAGE_PROVIDER=cloudinary`, `GEMINI_TEXT_API_KEY` and/or
   `GEMINI_IMAGE_API_KEY`, `SMS_PROVIDER` (+ Twilio credentials for real SMS
   in production — `console` mode returns OTPs directly in the API response,
   so `src/sms.js` refuses to start with it in production unless you also
   set `ALLOW_CONSOLE_OTP_IN_PRODUCTION=true`; that flag is for temporary
   internal testing only — with it on, anyone can log in as any phone number
   by reading the OTP back from `/auth/otp/request`, so switch to Twilio
   before any real users or a public app store listing), `PUBLIC_BASE_URL`
   (your Vercel domain), and `CRON_SECRET` (any random value; Vercel Cron
   sends it back automatically as `Authorization: Bearer <value>`).
3. Deploy. Confirm `https://<your-domain>/api/v1/health` returns
   `database.adapter: "postgresql"`.
4. Put that same URL + `/api/v1` into `env/prod.json` as `NERA_API_BASE_URL`,
   then build the app per the release commands above.

One thing worth knowing before you rely on this in production: with the 55s
Gemini timeout, a slow primary-model attempt can eat the entire per-request
budget, leaving no time left for the automatic fallback-model retry that
normally kicks in when the primary model fails or is unavailable. In
practice this means try-on requests that take longer than ~55 seconds now
fail outright instead of succeeding (possibly on the fallback model) within
the original 120s+120s budget. This is a real reliability trade-off for
staying on Hobby, not just a formality — if virtual try-on failure rate
matters to you in production, Vercel Pro (see above) removes it.

## Verification

```powershell
flutter analyze
flutter test
Set-Location server
npm test
npm run check
```
