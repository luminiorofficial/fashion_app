# Production security and operations

## API authorization audit

All ownership decisions use the authenticated user id on the server. User-owned
lookups return 404 when a resource belongs to another user, avoiding existence
leaks. PostgreSQL composite foreign keys additionally prevent cross-user media,
analysis, wardrobe, outfit, feedback, and try-on relationships.

| Method | Path | Auth | Ownership check | Rate policy | Paid AI | Notes |
|---|---|---:|---:|---|---:|---|
| GET | `/api/v1/health` | No | N/A | Edge recommended | No | No credentials returned. |
| POST | `/api/v1/auth/otp/request` | No | Phone challenge | IP window; phone cooldown; phone/IP daily | No | Limiter keys are hashed. |
| POST | `/api/v1/auth/otp/verify` | No | Challenge | Auth/IP | No | Atomic attempt count and maximum. |
| GET | `/api/v1/me` | Yes | Authenticated user | Normal/user | No | Public user fields only. |
| POST | `/api/v1/auth/logout` | Yes | Current session | Normal/user | No | Revokes presented token. |
| DELETE | `/api/v1/account` | Yes | Authenticated user | Normal/user | No | Transactional anonymization/cleanup. |
| GET | `/api/v1/profile` | Yes | User id | Normal/user | No | Private signed image URL. |
| POST | `/api/v1/profile/analyze` | Yes | User id | Profile AI + quota | Yes | Validated image; replaced asset cleaned. |
| GET | `/api/v1/wardrobe/items` | Yes | User id | Normal/user | No | Repository user filter. |
| POST | `/api/v1/wardrobe/analyze` | Yes | User id | Wardrobe AI + quota | Yes | Draft asset and analysis share owner. |
| DELETE | `/api/v1/wardrobe/drafts/:assetId` | Yes | Asset owner | Normal/user | No | Rejects assets in use. |
| POST | `/api/v1/wardrobe/items` | Yes | Asset/job owner | Normal/user | No | Ownership checked. |
| POST | `/api/v1/wardrobe/items/batch` | Yes | Every asset/job owner | Normal/user | No | Transactional in PostgreSQL. |
| POST | `/api/v1/wardrobe/links` | Yes | User id | Normal/user | No | Validated URL; excluded from try-on. |
| DELETE | `/api/v1/wardrobe/items/:itemId` | Yes | Item owner | Normal/user | No | Transactional DB archive; durable storage retry. |
| POST | `/api/v1/outfits/generate` | Yes | Wardrobe/profile | Outfit AI + quota | Yes | AI ids intersected with owned wardrobe. |
| GET | `/api/v1/outfits` | Yes | User id | Normal/user | No | Repository user filter. |
| POST | `/api/v1/outfits/:outfitId/feedback` | Yes | Outfit owner | Normal/user | No | Owner checked before upsert. |
| POST | `/api/v1/outfits/:outfitId/wear` | Yes | Outfit owner | Normal/user | No | Owner checked before upsert. |
| POST | `/api/v1/tryon/generate` | Yes | Profile, outfit, every item | Try-on AI + quota | Yes | Strict limit and concurrency cap. |
| POST | `/api/v1/tryon/:id/save` | Yes | Try-on owner | Normal/user | No | Non-owner receives 404. |
| GET | `/api/v1/tryon/saved` | Yes | User id | Normal/user | No | Repository user filter. |
| POST | `/api/v1/tryon/:id/unsave` | Yes | Try-on owner | Normal/user | No | Non-owner receives 404. |

## Rate limits and AI quotas

`RATE_LIMIT_WINDOW_SECONDS` defines the shared fixed window. Auth, normal API,
profile analysis, wardrobe analysis, outfit generation, and try-on have separate
maximums. OTP also has resend cooldown and per-phone/per-IP daily limits.
PostgreSQL `rate_limit_buckets` is the production store; memory is development
and test only.

Daily/monthly feature quotas use `AI_DAILY_*` and `AI_MONTHLY_*`. Usage rows keep
user id, operation, provider/model, timestamps, duration, status, and optional
estimated units only. Prompts, request bodies, phone numbers, tokens, and images
are never copied into billing analytics. Clients should send a stable
`Idempotency-Key` for AI POSTs; replay returns 409 without a second provider call.
Concurrent reservations default to one per user and stale reservations expire.

Gemini text/image keys remain separate. Image same-model retries default to zero;
text retries default to one. Fallback models are disabled unless explicitly
configured, and the image Pro model requires explicit high-quality mode.

## Privacy, retention, media, and monitoring

Cloudinary uses authenticated delivery and non-enumerable UUID ids under per-user
purpose folders. Configure `CLOUDINARY_AUTH_TOKEN_KEY` so signed URLs expire.
Never put backend credentials in Flutter `env/*.json`; those files may contain
only public API URLs and feature flags.

Retention is configurable for OTP challenges, sessions, analysis jobs, archived
media, unsaved try-ons, and AI usage. A storage deletion failure keeps the
archived row as a retry marker. Vercel Cron requires `CRON_SECRET` in production.

Alert on 5xx rate, auth failures, OTP 429s, AI quota/concurrency 429s, Gemini
failure/latency and usage by operation/model, try-on volume, Cloudinary failures,
PostgreSQL pool wait/exhaustion, and cleanup failures. Log request id, status,
safe error code, operation, model, and duration only—never authorization headers,
tokens, OTPs, phone numbers, signed URLs, prompts, images, or bodies.
