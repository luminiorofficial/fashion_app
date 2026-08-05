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

Environment variables can be set directly; Node does not automatically load the
example file. In development, the OTP is returned as `developmentOtp` and logged
by the server. Production deliberately refuses the placeholder SMS provider, so
a real provider adapter must be supplied before deployment.

Without `GEMINI_API_KEY`, image endpoints still exercise the upload/storage flow
and return a clearly marked development fallback. Set the key to enable analysis.
Uploaded images default to `server/data/uploads`, which is gitignored.

The Android emulator uses the default API URL `http://10.0.2.2:8080/api/v1`.
Override it for iOS, web, a physical device, or a deployed server:

```powershell
flutter run --dart-define=NERA_API_BASE_URL=http://192.168.1.20:8080/api/v1
```

## PostgreSQL handoff

The API depends on an asynchronous repository contract in
`server/src/repository.js`. Its current adapter is in-memory. When the dedicated
database is available, apply the migrations and implement the same methods with
a PostgreSQL pool; routes and the Flutter client do not need to change.

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f database/migrations/001_initial_schema.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f database/migrations/002_database_roles.sql
```

See `database/README.md` for the covered entities and storage model.

## Verification

```powershell
flutter analyze
flutter test
Set-Location server
npm test
npm run check
```
