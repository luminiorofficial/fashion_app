const path = require("node:path");

function loadConfig(overrides = {}) {
  const root = path.resolve(__dirname, "..");
  const config = {
    env: process.env.NODE_ENV || "development",
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT || 8080),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:8080",
    uploadDir: path.resolve(root, process.env.UPLOAD_DIR || "data/uploads"),
    otpHashSecret: process.env.OTP_HASH_SECRET || "development-only-secret-change-me-now",
    otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES || 5),
    otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
    otpRateLimitWindowMinutes: Number(process.env.OTP_RATE_LIMIT_WINDOW_MINUTES || 15),
    otpRateLimitMax: Number(process.env.OTP_RATE_LIMIT_MAX || 5),
    // Shared secret for api/cron/cleanup.js. Vercel sends
    // `Authorization: Bearer <CRON_SECRET>` automatically on cron-triggered
    // requests when this is set as a project env var; left blank locally
    // since there's no cron caller to authenticate against.
    cronSecret: process.env.CRON_SECRET || "",
    smsProvider: process.env.SMS_PROVIDER || "console",
    allowConsoleOtpInProduction: process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION === "true",
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
    twilioMessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || "",
    twilioFromNumber: process.env.TWILIO_FROM_NUMBER || "",
    sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
    // Legacy shared key/retry setting, kept as a fallback for whichever of
    // the two split settings below isn't explicitly configured.
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiMaxRetries: Number(process.env.GEMINI_MAX_RETRIES || 3),
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
    geminiRetryBaseDelayMs: Number(process.env.GEMINI_RETRY_BASE_DELAY_MS || 500),
    // Text/JSON analysis (wardrobe + profile analysis, outfit styling) and
    // paid virtual try-on image generation are billed separately, so each
    // gets its own API key and retry budget. Both fall back to the shared
    // legacy settings above when unset, so a single-key setup keeps working.
    geminiTextApiKey: process.env.GEMINI_TEXT_API_KEY || process.env.GEMINI_API_KEY || "",
    geminiTextMaxRetries: Number(process.env.GEMINI_TEXT_MAX_RETRIES || process.env.GEMINI_MAX_RETRIES || 3),
    geminiImageApiKey: process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY || "",
    // Image generation retries are kept at 0 by default: the primary/
    // fallback model chain below already gives every try-on a second
    // attempt on a different model, so a same-model retry on top of that
    // just doubles worst-case latency for no real benefit. Raise this only
    // if you deliberately want same-model retries before falling back.
    geminiImageMaxRetries: Number(process.env.GEMINI_IMAGE_MAX_RETRIES || 0),
    // Virtual try-on uses a separate, image-capable model family from the
    // text/JSON analysis calls above. The default primary model is the
    // cheapest/fastest flash-lite variant, with the standard flash model as
    // fallback if it's unavailable or fails. The higher-quality (and
    // pricier) pro model is never used automatically — only when
    // GEMINI_IMAGE_HIGH_QUALITY_MODE=true, so a normal request never
    // silently upgrades to it.
    geminiImageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image",
    geminiImageFallbackModel: process.env.GEMINI_IMAGE_FALLBACK_MODEL || "gemini-3.1-flash-image",
    geminiImageProModel: process.env.GEMINI_IMAGE_PRO_MODEL || "gemini-3-pro-image",
    geminiImageHighQualityMode: process.env.GEMINI_IMAGE_HIGH_QUALITY_MODE === "true",
    geminiImageSize: process.env.GEMINI_IMAGE_SIZE || "1K",
    geminiImageAspectRatio: process.env.GEMINI_IMAGE_ASPECT_RATIO || "3:4",
    geminiImageTimeoutMs: Number(process.env.GEMINI_IMAGE_TIMEOUT_MS || 120_000),
    // Garment/profile images are downscaled to this longest side before
    // being sent to the paid image model, independent of the (larger) size
    // kept in Cloudinary for display, to cut input token/image cost.
    geminiImageMaxInputPx: Number(process.env.GEMINI_IMAGE_MAX_INPUT_PX || 1024),
    databaseUrl: process.env.DATABASE_URL || "",
    databasePoolMax: Number(process.env.DATABASE_POOL_MAX || 10),
    databaseSsl: process.env.DATABASE_SSL === "true",
    databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
    cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
    // Base path prefix; storage.js routes each upload into a purpose-specific
    // sub-folder beneath it (see PURPOSE_FOLDERS in src/storage.js).
    cloudinaryFolder: process.env.CLOUDINARY_FOLDER || "nera",
    // Optional: a token-based authentication key created in the Cloudinary
    // console (Settings > Security). Without it, signed Cloudinary URLs are
    // still private/authenticated but do not expire.
    cloudinaryAuthTokenKey: process.env.CLOUDINARY_AUTH_TOKEN_KEY || "",
    cloudinarySignedUrlTtlSeconds: Number(process.env.CLOUDINARY_SIGNED_URL_TTL_SECONDS || 900),
    // Periodic housekeeping: how often the server purges expired/orphaned
    // rows (and their Cloudinary objects, for unsaved try-on results) so
    // Postgres storage doesn't grow unbounded. See src/cleanup.js.
    cleanupIntervalMinutes: Number(process.env.CLEANUP_INTERVAL_MINUTES || 360),
    otpRetentionDays: Number(process.env.OTP_RETENTION_DAYS || 7),
    sessionRetentionDays: Number(process.env.SESSION_RETENTION_DAYS || 30),
    analysisJobRetentionDays: Number(process.env.ANALYSIS_JOB_RETENTION_DAYS || 14),
    mediaAssetRetentionDays: Number(process.env.MEDIA_ASSET_RETENTION_DAYS || 14),
    // Generated virtual try-on images the user never saved are deleted
    // (Cloudinary object + DB row) after this many hours. Saved looks
    // (is_saved = true) are never touched by this cleanup.
    tryonUnsavedRetentionHours: Number(process.env.TRYON_UNSAVED_RETENTION_HOURS || 24),
    ...overrides,
  };
  const cloudinaryFields = [config.cloudinaryCloudName, config.cloudinaryApiKey, config.cloudinaryApiSecret];
  const cloudinaryConfigured = cloudinaryFields.every(Boolean);
  const cloudinaryPartiallyConfigured = cloudinaryFields.some(Boolean) && !cloudinaryConfigured;
  config.imageStorageProvider = config.imageStorageProvider || (cloudinaryConfigured ? "cloudinary" : "local");

  if (!["local", "cloudinary"].includes(config.imageStorageProvider)) {
    throw new Error("IMAGE_STORAGE_PROVIDER must be one of 'cloudinary' or 'local'.");
  }
  if (cloudinaryPartiallyConfigured || (config.imageStorageProvider === "cloudinary" && !cloudinaryConfigured)) {
    throw new Error("Cloudinary image storage requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.");
  }
  if (config.env === "production" && config.imageStorageProvider !== "cloudinary") {
    throw new Error("Production image storage must use Cloudinary.");
  }
  if (config.env === "production" && !config.databaseUrl) {
    throw new Error("Production requires DATABASE_URL; the in-memory repository is not allowed in production.");
  }

  return config;
}

module.exports = {loadConfig};
