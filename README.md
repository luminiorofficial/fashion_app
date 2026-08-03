# NERA mobile AI stylist

Flutter/Firebase implementation of the NERA personal stylist workflow. Firebase
Authentication and Firestore are used, but Firebase Storage is intentionally not
used. Wardrobe images are kept in the app's private documents directory until a
cloud-storage plan is introduced.

## Implemented flow

1. The user signs in anonymously; the account can later be linked to Google or
   Apple.
2. Camera/gallery images are resized and compressed to JPEG below 2 MB.
3. The authenticated app sends the JPEG as Base64 to the AI gateway. The Gemini
   API key exists only as a backend secret.
4. Wardrobe images are stored under the app-private local path
   `nera/users/{uid}/wardrobe/{itemId}.jpg`.
5. Metadata and AI results are written to Firestore. Outfit generation reads the
   authenticated user's profile and wardrobe directly from Firestore.

Because images are local, they do not sync to a second device and disappear if
the app is uninstalled or its data is cleared. Firestore metadata still syncs;
the UI shows a missing-image placeholder on devices that do not own the local
file. `imageUrl` remains an empty string for schema compatibility, while
`imagePath` contains the private device path. Migrate both fields when Firebase
Storage or another object store is enabled.

## Firestore layout

Firestore creates collections on the first document write. The app uses:

```text
artifacts/nera-mobile/users/{uid}/profile/style
  bodyType, skinTone, preferredStyles, updatedAt

artifacts/nera-mobile/users/{uid}/wardrobe/{itemId}
  name, category, imageUrl, imagePath, tags, createdAt

artifacts/nera-mobile/users/{uid}/outfit_history/{outfitId}
  eventType, wardrobeItemIds, rationale, suggestedPurchaseItem, createdAt
```

The included `firestore.rules` restricts every path to its authenticated owner
and validates the allowed fields, categories, events, list sizes, and timestamps.

## AI middleware

The Cloud Function exposes these authenticated `POST` routes:

- `/api/mobile/analyze-item`
- `/api/mobile/analyze-profile`
- `/api/mobile/generate-outfit`

Every request requires `Authorization: Bearer <Firebase ID token>`.
Image-analysis bodies use:

```json
{
  "imageBase64": "<base64 JPEG bytes>",
  "mimeType": "image/jpeg"
}
```

Outfit generation accepts only `{ "eventType": "Wedding" }`. The middleware
loads the profile and wardrobe for the token's UID, so another user's catalog
cannot be injected from the client.

## Local setup

Prerequisites: Flutter, Node.js 22, Firebase CLI, a configured Firebase project,
and a Gemini API key.

The gateway defaults to `gemini-3.6-flash`; the `gemini-2.0-flash` model from
the original handoff has been shut down.

```powershell
flutter pub get
Set-Location functions
npm ci
Set-Location ..
firebase functions:secrets:set GEMINI_API_KEY
```

Enable Anonymous, Google, and Apple providers in Firebase Authentication. Apple
Sign-In also needs the iOS capability and Apple/Firebase provider configuration.
The camera and photo-library permissions are already present in the Android and
iOS project files.

Run the app against the deployed API:

```powershell
flutter run
```

Or point it at an emulator/custom gateway:

```powershell
flutter run --dart-define=NERA_API_BASE_URL=http://10.0.2.2:5001/fashion-app-9d056/us-central1/api/mobile
```

`10.0.2.2` is the Android emulator's host-machine address. Use the host's LAN IP
for a physical device. The Functions emulator reads local secrets from
`functions/.secret.local`; this file is gitignored. Its contents should be:

```text
GEMINI_API_KEY=your-private-key
```

## Verification and deployment

```powershell
flutter analyze
flutter test
Set-Location functions
npm test
npm run check
Set-Location ..
firebase deploy --only firestore:rules,functions
```

Deploying Cloud Functions requires a Firebase project plan that supports
Functions deployment. This code does not deploy or depend on a Storage bucket.
