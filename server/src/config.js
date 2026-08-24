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
    smsProvider: process.env.SMS_PROVIDER || "console",
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
    twilioMessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || "",
    twilioFromNumber: process.env.TWILIO_FROM_NUMBER || "",
    sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
    geminiMaxRetries: Number(process.env.GEMINI_MAX_RETRIES || 3),
    geminiRetryBaseDelayMs: Number(process.env.GEMINI_RETRY_BASE_DELAY_MS || 500),
    // Virtual try-on uses a separate, image-capable model family from the
    // text/JSON analysis calls above, with its own fallback model.
    geminiImageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image",
    geminiImageFallbackModel: process.env.GEMINI_IMAGE_FALLBACK_MODEL || "gemini-3.1-flash-image",
    geminiImageSize: process.env.GEMINI_IMAGE_SIZE || "1K",
    geminiImageAspectRatio: process.env.GEMINI_IMAGE_ASPECT_RATIO || "3:4",
    databaseUrl: process.env.DATABASE_URL || "",
    databasePoolMax: Number(process.env.DATABASE_POOL_MAX || 10),
    databaseSsl: process.env.DATABASE_SSL === "true",
    databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
    cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
    cloudinaryFolder: process.env.CLOUDINARY_FOLDER || "nera",
    // Optional: a token-based authentication key created in the Cloudinary
    // console (Settings > Security). Without it, signed Cloudinary URLs are
    // still private/authenticated but do not expire.
    cloudinaryAuthTokenKey: process.env.CLOUDINARY_AUTH_TOKEN_KEY || "",
    cloudinarySignedUrlTtlSeconds: Number(process.env.CLOUDINARY_SIGNED_URL_TTL_SECONDS || 900),
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
