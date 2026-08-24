# PostgreSQL repository handoff

The REST routes use camel-case domain objects. A future PostgreSQL adapter should
implement every method exported in `repositoryMethods` from
`server/src/repository.js` and map fields to the snake-case columns below.
`createApp` validates this method contract at startup.

| Domain field | PostgreSQL column |
| --- | --- |
| `name` | `users.full_name` |
| `phoneNumber` | `users.phone_number` |
| `phoneVerifiedAt` | `users.phone_verified_at` |
| `otpHash` | `otp_challenges.otp_digest` |
| `registration` | `otp_challenges.pending_registration` |
| `attempts` | `otp_challenges.attempt_count` |
| `tokenHash` | `auth_sessions.token_digest` |
| `userId` on assets | `media_assets.owner_user_id` |
| `bodyType` | `user_style_profiles.body_shape` |
| `category` | lookup of `wardrobe_categories.display_name` |
| `reaction` on outfit feedback | `outfit_feedback.reaction` |
| `wornAt` | `outfit_feedback.worn_at` |
| `wardrobeItemIds` on a try-on | `tryon_requests.wardrobe_item_ids` |
| `resultMediaAssetId` | `tryon_requests.result_media_asset_id` |

## Required transactions

- `recordChallengeAttempt` must perform a conditional update using challenge id,
  expected attempt count, `consumed_at IS NULL`, and expiry/attempt limits. It
  returns no row when another request has already changed the challenge.
- `markChallengeDelivered` stores Twilio's message SID and submission timestamp
  after the Messaging API accepts the OTP SMS.
- `findOrCreateUser` must use the active-phone unique index so two valid
  registration challenges cannot create duplicate accounts.
- `createWardrobeItem` must resolve the category, insert the item, attach the
  owner-matched primary media asset for uploads, and upsert/attach tags in one
  transaction. Deferred constraints validate the final item/media state.
- `saveProfile` must upsert the style profile together with the matching profile
  asset and completed analysis job.
- `archiveAsset` and `deleteWardrobeItem` are soft deletes. Analysis and audit
  history remains referentially valid.
- `createOutfit` must insert one `outfits` row (status `completed`, `completed_at`
  set) and one `outfit_items` row per selected wardrobe item id, in one
  transaction, with `position` set to each item's order in the array. The
  composite `outfit_item_wardrobe_owner_fk` re-validates that every wardrobe
  item id belongs to the same user at the database layer.
- `upsertOutfitFeedback` inserts or updates the single `outfit_feedback` row
  for an outfit (`UNIQUE (outfit_id)`), setting only the field(s) provided
  (`reaction` and/or `worn_at`) and leaving the other untouched.
- `getWardrobeAffinity` aggregates `outfit_feedback` joined through
  `outfit_items` into a per-wardrobe-item weighted score (see
  `server/src/postgres_repository.js` for the exact weights), used both to
  bias future `suggestOutfit` prompts and to compute the outfit response's
  local `matchScore`.
- `createTryOnRequest` inserts one `tryon_requests` row referencing the
  wardrobe items composited, the source profile photo asset, and the
  generated result asset (`media_assets.purpose = 'tryon_result'`). The
  `tryon_wardrobe_items_context` trigger re-validates that every id in
  `wardrobe_item_ids` belongs to the same user, since array columns cannot
  carry a real foreign key.

Images remain outside PostgreSQL. The adapter stores only metadata and storage
keys in `media_assets`; `LocalAssetStore` can later be replaced by Cloudinary or an
equivalent object-storage implementation without changing the schema or routes.
