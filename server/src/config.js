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
    databaseUrl: process.env.DATABASE_URL || "",
    databasePoolMax: Number(process.env.DATABASE_POOL_MAX || 10),
    databaseSsl: process.env.DATABASE_SSL === "true",
    databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
    r2AccountId: process.env.R2_ACCOUNT_ID || "",
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    r2Bucket: process.env.R2_BUCKET || "",
    r2Endpoint: process.env.R2_ENDPOINT || "",
    r2SignedUrlTtlSeconds: Number(process.env.R2_SIGNED_URL_TTL_SECONDS || 900),
    ...overrides,
  };
  const r2Fields = [config.r2AccountId, config.r2AccessKeyId, config.r2SecretAccessKey, config.r2Bucket];
  const r2Configured = r2Fields.every(Boolean);
  const r2PartiallyConfigured = r2Fields.some(Boolean) && !r2Configured;
  config.imageStorageProvider = config.imageStorageProvider || (r2Configured ? "r2" : "local");

  if (!["local", "r2"].includes(config.imageStorageProvider)) {
    throw new Error("IMAGE_STORAGE_PROVIDER must be either 'r2' or 'local'.");
  }
  if (r2PartiallyConfigured || (config.imageStorageProvider === "r2" && !r2Configured)) {
    throw new Error("R2 image storage requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.");
  }
  if (config.env === "production" && config.imageStorageProvider !== "r2") {
    throw new Error("Production image storage must use private Cloudflare R2.");
  }

  return config;
}

module.exports = {loadConfig};
