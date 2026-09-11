# Mobile API error handling review

Changes apply to failure handling; successful request payloads, endpoints, and feature eligibility rules remain unchanged.

## Changed files

Paths below are relative to the repository root.

- `mobile/lib/core/errors/friendly_error.dart`: centralized app-owned messages, feature fallbacks, exact actionable codes, network detection, debug-only technical logging. No arbitrary exception text is returned.
- `mobile/lib/services/nera_api_client.dart`: bounded response-body reads for JSON and multipart requests, stable network code, malformed JSON/envelope rejection, robust parsing of ill-typed error fields, preserved authenticated 401 behavior.
- `mobile/lib/services/remote_nera_backend.dart`: retryable startup failures, initial refresh before authenticated navigation, safe asynchronous session cleanup, required response field checks.
- `mobile/lib/features/auth/auth_screen.dart`: centralized mapping while retaining existing OTP fallback copy.
- `mobile/lib/features/shell/nera_shell.dart`: outfit fallback; weather/location failure cleanup and friendly weather error propagation.
- `mobile/lib/features/home/home_screen.dart`: friendly weather error display with existing retry interaction.
- `mobile/lib/features/onboarding/profile_creation_screen.dart`: image-analysis mapping with existing retry.
- `mobile/lib/features/outfits/outfit_result_screen.dart`: try-on and profile-photo recovery messages.
- `mobile/lib/features/try_on/try_on_result_screen.dart`: safe try-on error messages; existing regeneration/save controls reset in finally.
- `mobile/lib/features/wardrobe/wardrobe_screen.dart`: upload, removal, and purchased-item error mapping; existing retry/loading cleanup retained.
- `mobile/lib/features/profile/profile_screen.dart`: central mapping with existing action-specific copy; Gmail failure state and retry, including embedded sync errors.
- `mobile/lib/features/profile/full_body_photo_flow.dart`: safe failed image preview.
- `mobile/lib/features/wardrobe/wardrobe_item_image.dart`: safe corrupt local-image placeholder.
- `mobile/lib/features/camera/camera_capture_screen.dart`: capture catches unknown failures, resets controls, and logs disposal failures.
- `mobile/test/friendly_error_test.dart`
- `mobile/test/nera_api_client_error_test.dart`
- `mobile/test/api_error_recovery_test.dart`
- `mobile/test/session_error_recovery_test.dart`
- `docs/mobile-api-error-handling.md`: this handoff.

## API and display audit

All direct mobile HTTP calls use NeraApiClient through RemoteNeraBackend. Reviewed initialization, OTP request/verification, logout/account deletion, wardrobe analysis/save/batch/discard/link/delete/viewed, profile analysis/read, outfit generation/history/feedback/worn, weather, try-on generation/save/unsave/saved-list, Gmail connect/status/sync/disconnect, and purchase list/add/ignore.

Reviewed error displays in bootstrap, authentication, shell, home, styling/history, profile/onboarding, wardrobe/purchases, outfit results, try-on results, and saved looks. Styling history, saved looks, and bootstrap already call the shared mapper and inherit the fix. Network image placeholders already avoid exposing exceptions. Local preview/image failures now have safe fallbacks too. Existing camera permission guidance and local eligibility/validation messages remain.

## Handled statuses and codes

- All non-2xx HTTP statuses map to safe copy, including 400, 403, 404, 408, 409, 410, 422, 429, 500, 502, 503, 504 and unknown statuses.
- 401: sign-in guidance; authenticated requests retain session-expiration handling. Invalid OTP keeps its specific guidance.
- 413: choose a smaller photo. 415: choose a supported photo format.
- Actionable codes: INVALID_OTP, OTP_INVALID, INVALID_OTP_FORMAT, OTP_EXPIRED, CHALLENGE_NOT_FOUND, OTP_ALREADY_USED, OTP_ATTEMPTS_EXCEEDED, PROFILE_ASSET_UNAVAILABLE, WARDROBE_ITEM_HAS_NO_IMAGE, WARDROBE_ASSET_UNAVAILABLE.
- NETWORK_ERROR, FAILED_TO_FETCH, HTTP client failures, socket failures, failed host lookup, refused connections, and browser fetch failures use connection guidance.
- REQUEST_TIMEOUT, TRYON_TIMEOUT, TimeoutException, invalid JSON, unexpected response shapes/types, and MALFORMED_RESPONSE use the feature fallback.
- INTERNAL_ERROR, GMAIL_INTEGRATION_NOT_CONFIGURED, SERVER_INITIALIZATION_FAILED, try-on billing/provider failures, Gemini failures, database/storage codes, stack traces, raw JSON, and all unknown errors use app-owned fallback text. No denylist of provider names is required.

## Primary messages

| Feature | User-facing message |
| --- | --- |
| General | This feature isn’t available right now. Please try again shortly. |
| Connection | We’re having trouble connecting right now. Check your internet and try again. |
| Outfit generation | We couldn’t style your look right now. Please try again. |
| Virtual Try-On | Virtual Try-On isn’t available right now. Please try again later. |
| Profile/image analysis | We couldn’t analyze this image right now. Please try again or upload another photo. |
| Wardrobe upload | We couldn’t add this item right now. Please try again. |
| Purchases/Gmail availability | Purchased items aren’t available right now. Please try again later. |
| Weather | Weather information isn’t available right now. Please try again later. |

Existing specific OTP, Gmail action, account deletion/sign-out, profile refresh, photo compression, and local validation copy remains where useful. Wardrobe removal gets removal-specific wording.

## Validation and manual testing

Added tests cover hostile technical messages across features/statuses, network/timeouts, actionable codes, malformed JSON and error envelopes, ill-typed 401 responses, stalled GET/upload bodies, unchanged successful JSON/204 handling, bootstrap/purchases/Gmail retry recovery, try-on failure retry, and startup refresh failure/session recovery.

`git diff --check` passes. Flutter tests and the analyzer were not run: Flutter/Dart are unavailable on PATH, and the user requested proceeding without SDK setup. Run `flutter test` and `flutter analyze` from `mobile` when an SDK is available.

Manual checks still required on supported devices:

1. Offline, refused connection, HTTP 500/503, and timeout responses across each feature; confirm safe copy and usable controls afterward.
2. Outfit generation/retry and Virtual Try-On generation/regeneration/save/unsave, including expired profile/wardrobe image recovery.
3. Profile onboarding/refresh, camera/gallery permissions, corrupt photos, and wardrobe single/batch upload (including partial failures), save, link, delete, and discard.
4. Gmail browser consent and app return, unavailable integration, status/sync/disconnect, embedded sync errors, and purchase list/add/ignore.
5. Weather denial, disabled location, provider failure, and retry; outfit generation remains available when weather fails.
6. Cold start with saved session during an outage, retry after recovery, invalid OTP, expired session, logout, and account deletion.
7. Outfit history, saved looks, feedback/worn actions, image download failures, navigation away during requests, and release/debug builds.

The audited API error-display paths no longer render raw technical errors, even in debug mode. Technical detail stays in exception objects and developer logs. Device-level verification and execution of the added tests remain outstanding; this is a source-review confirmation, not a claim of completed end-to-end testing.

## Follow-up review

Found and fixed two additional recovery bugs:

- After OTP verification succeeded but initial profile/wardrobe loading failed, submitting again previously resent the consumed OTP. The backend now retains the pending verified session and retries persistence/loading without repeating OTP verification. Session cleanup clears that pending state.
- A revoked Gmail connection with a stored sync error previously showed a status retry loop, hiding the Connect action. It now offers Reconnect Gmail and handles GMAIL_RECONNECT_REQUIRED explicitly. The server's actual `failed` sync status is also recognized, even without an error string. Connect/sync handlers guard against overlapping actions.

Added regression cases for both paths. Static diff checks pass; Flutter tests/analyzer remain unexecuted under the user's instruction to skip SDK setup.
