const path = require("node:path");

function loadConfig(overrides = {}) {
  const root = path.resolve(__dirname, "..");
  return {
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
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    databaseUrl: process.env.DATABASE_URL || "",
    databasePoolMax: Number(process.env.DATABASE_POOL_MAX || 10),
    databaseSsl: process.env.DATABASE_SSL === "true",
    databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
    ...overrides,
  };
}

module.exports = {loadConfig};
