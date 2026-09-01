import path from "node:path";
import {z} from "zod";

export interface AppConfig {
  env: string;
  host: string;
  port: number;
  publicBaseUrl: string;
  uploadDir: string;
  allowedOrigins: string[];
  trustProxy: boolean;
  otpHashSecret: string;
  otpTtlMinutes: number;
  otpMaxAttempts: number;
  otpRateLimitWindowMinutes: number;
  otpRateLimitMax: number;
  // Shared secret for api/cron/cleanup.ts. Vercel sends
  // `Authorization: Bearer <CRON_SECRET>` automatically on cron-triggered
  // requests when this is set as a project env var; left blank locally
  // since there's no cron caller to authenticate against.
  cronSecret: string;
  smsProvider: string;
  otpResendCooldownSeconds: number;
  otpDailyPhoneLimit: number;
  otpDailyIpLimit: number;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioMessagingServiceSid: string;
  twilioFromNumber: string;
  sessionTtlDays: number;
  // Legacy shared key/retry setting, kept as a fallback for whichever of
  // the two split settings below isn't explicitly configured.
  geminiApiKey: string;
  geminiMaxRetries: number;
  geminiModel: string;
  geminiRetryBaseDelayMs: number;
  // Text/JSON analysis (wardrobe + profile analysis, outfit styling) and
  // paid virtual try-on image generation are billed separately, so each
  // gets its own API key and retry budget. Both fall back to the shared
  // legacy settings above when unset, so a single-key setup keeps working.
  geminiTextApiKey: string;
  geminiTextMaxRetries: number;
  geminiTextFallbackModel: string;
  // Safe-to-log label for which key GEMINI_TEXT_API_KEY/GEMINI_IMAGE_API_KEY
  // actually came from, for backend usage logging only (see
  // utils/safe-logging.ts) — never derived from or exposing key values.
  geminiTextKeySource: "TEXT" | "LEGACY_FALLBACK";
  geminiImageApiKey: string;
  geminiImageKeySource: "IMAGE" | "LEGACY_FALLBACK";
  geminiImageMaxRetries: number;
  geminiImageModel: string;
  geminiImageFallbackModel: string;
  geminiImageProModel: string;
  geminiImageHighQualityMode: boolean;
  geminiImageSize: string;
  geminiImageAspectRatio: string;
  geminiImageTimeoutMs: number;
  // Garment/profile images are downscaled to this longest side before
  // being sent to the paid image model, independent of the (larger) size
  // kept in Cloudinary for display, to cut input token/image cost.
  geminiImageMaxInputPx: number;
  databaseUrl: string;
  databasePoolMax: number;
  databaseSsl: boolean;
  databaseSslRejectUnauthorized: boolean;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
  cloudinaryFolder: string;
  cloudinaryAuthTokenKey: string;
  cloudinarySignedUrlTtlSeconds: number;
  cleanupIntervalMinutes: number;
  otpRetentionDays: number;
  sessionRetentionDays: number;
  analysisJobRetentionDays: number;
  mediaAssetRetentionDays: number;
  tryonUnsavedRetentionHours: number;
  imageStorageProvider: string;
  rateLimitWindowSeconds: number;
  rateLimitAuthMax: number;
  rateLimitApiMax: number;
  rateLimitProfileAnalysisMax: number;
  rateLimitWardrobeAnalysisMax: number;
  rateLimitOutfitGenerationMax: number;
  rateLimitTryonMax: number;
  aiDailyProfileAnalysisLimit: number;
  aiDailyWardrobeAnalysisLimit: number;
  aiDailyOutfitGenerationLimit: number;
  aiDailyTryonLimit: number;
  aiMonthlyProfileAnalysisLimit: number;
  aiMonthlyWardrobeAnalysisLimit: number;
  aiMonthlyOutfitGenerationLimit: number;
  aiMonthlyTryonLimit: number;
  aiConcurrentRequestsPerUser: number;
  aiReservationTimeoutMinutes: number;
  aiUsageRetentionDays: number;
  weatherApiBaseUrl: string;
  weatherRequestTimeoutMs: number;
  weatherCacheTtlMinutes: number;
}

export type ConfigOverrides = Partial<AppConfig>;

// Validates the fully-assembled config: field-level shape (so a malformed
// env var fails clearly at startup instead of silently becoming NaN deep
// inside a request handler) plus the same cross-field production rules
// config.js previously enforced by hand.
const configSchema = z
  .object({
    env: z.string().min(1),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    publicBaseUrl: z.string().min(1),
    uploadDir: z.string().min(1),
    allowedOrigins: z.array(z.string().url()),
    trustProxy: z.boolean(),
    otpHashSecret: z.string().min(1),
    otpTtlMinutes: z.number(),
    otpMaxAttempts: z.number(),
    otpRateLimitWindowMinutes: z.number(),
    otpRateLimitMax: z.number(),
    cronSecret: z.string(),
    smsProvider: z.string(),
    otpResendCooldownSeconds: z.number().int().min(1),
    otpDailyPhoneLimit: z.number().int().min(1),
    otpDailyIpLimit: z.number().int().min(1),
    twilioAccountSid: z.string(),
    twilioAuthToken: z.string(),
    twilioMessagingServiceSid: z.string(),
    twilioFromNumber: z.string(),
    sessionTtlDays: z.number(),
    geminiApiKey: z.string(),
    geminiMaxRetries: z.number(),
    geminiModel: z.string().min(1),
    geminiRetryBaseDelayMs: z.number(),
    geminiTextApiKey: z.string(),
    geminiTextMaxRetries: z.number(),
    geminiTextFallbackModel: z.string(),
    geminiTextKeySource: z.enum(["TEXT", "LEGACY_FALLBACK"]),
    geminiImageApiKey: z.string(),
    geminiImageKeySource: z.enum(["IMAGE", "LEGACY_FALLBACK"]),
    geminiImageMaxRetries: z.number(),
    geminiImageModel: z.string().min(1),
    geminiImageFallbackModel: z.string(),
    geminiImageProModel: z.string().min(1),
    geminiImageHighQualityMode: z.boolean(),
    geminiImageSize: z.string().min(1),
    geminiImageAspectRatio: z.string().min(1),
    geminiImageTimeoutMs: z.number(),
    geminiImageMaxInputPx: z.number(),
    databaseUrl: z.string(),
    databasePoolMax: z.number(),
    databaseSsl: z.boolean(),
    databaseSslRejectUnauthorized: z.boolean(),
    cloudinaryCloudName: z.string(),
    cloudinaryApiKey: z.string(),
    cloudinaryApiSecret: z.string(),
    cloudinaryFolder: z.string(),
    cloudinaryAuthTokenKey: z.string(),
    cloudinarySignedUrlTtlSeconds: z.number(),
    cleanupIntervalMinutes: z.number(),
    otpRetentionDays: z.number(),
    sessionRetentionDays: z.number(),
    analysisJobRetentionDays: z.number(),
    mediaAssetRetentionDays: z.number(),
    tryonUnsavedRetentionHours: z.number(),
    imageStorageProvider: z.string(),
    rateLimitWindowSeconds: z.number().int().min(1),
    rateLimitAuthMax: z.number().int().min(1),
    rateLimitApiMax: z.number().int().min(1),
    rateLimitProfileAnalysisMax: z.number().int().min(1),
    rateLimitWardrobeAnalysisMax: z.number().int().min(1),
    rateLimitOutfitGenerationMax: z.number().int().min(1),
    rateLimitTryonMax: z.number().int().min(1),
    aiDailyProfileAnalysisLimit: z.number().int().min(1),
    aiDailyWardrobeAnalysisLimit: z.number().int().min(1),
    aiDailyOutfitGenerationLimit: z.number().int().min(1),
    aiDailyTryonLimit: z.number().int().min(1),
    aiMonthlyProfileAnalysisLimit: z.number().int().min(1),
    aiMonthlyWardrobeAnalysisLimit: z.number().int().min(1),
    aiMonthlyOutfitGenerationLimit: z.number().int().min(1),
    aiMonthlyTryonLimit: z.number().int().min(1),
    aiConcurrentRequestsPerUser: z.number().int().min(1),
    aiReservationTimeoutMinutes: z.number().int().min(1),
    aiUsageRetentionDays: z.number().int().min(1),
    weatherApiBaseUrl: z.string().min(1),
    weatherRequestTimeoutMs: z.number().int().min(1000),
    weatherCacheTtlMinutes: z.number().int().min(1),
  })
  .superRefine((config, ctx) => {
    const cloudinaryFields = [config.cloudinaryCloudName, config.cloudinaryApiKey, config.cloudinaryApiSecret];
    const cloudinaryConfigured = cloudinaryFields.every(Boolean);
    const cloudinaryPartiallyConfigured = cloudinaryFields.some(Boolean) && !cloudinaryConfigured;

    if (!["console", "twilio"].includes(config.smsProvider)) {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: ["smsProvider"], message: "SMS_PROVIDER must be either console or twilio."});
    }
    if (config.smsProvider === "twilio") {
      if (!(config.twilioAccountSid && config.twilioAuthToken && (config.twilioMessagingServiceSid || config.twilioFromNumber))) {
        ctx.addIssue({code: z.ZodIssueCode.custom, path: ["twilioAccountSid"], message: "Twilio requires credentials and a Messaging Service SID or sender number."});
      }
    }

    if (!["local", "cloudinary"].includes(config.imageStorageProvider)) {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: ["imageStorageProvider"], message: "IMAGE_STORAGE_PROVIDER must be one of 'cloudinary' or 'local'."});
    }
    if (cloudinaryPartiallyConfigured || (config.imageStorageProvider === "cloudinary" && !cloudinaryConfigured)) {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: ["cloudinaryCloudName"], message: "Cloudinary image storage requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."});
    }
    if (config.env === "production" && config.imageStorageProvider !== "cloudinary") {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: ["imageStorageProvider"], message: "Production image storage must use Cloudinary."});
    }
    if (config.env === "production" && !config.databaseUrl) {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: ["databaseUrl"], message: "Production requires DATABASE_URL; the in-memory repository is not allowed in production."});
    }
    if (config.env === "production" && config.smsProvider === "console") {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: ["smsProvider"], message: "Production requires a real SMS provider; console OTP is never allowed."});
    }
    if (config.env === "production" && !config.cronSecret) {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: ["cronSecret"], message: "Production requires CRON_SECRET."});
    }
    if (config.env === "production" && config.allowedOrigins.length === 0) {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: ["allowedOrigins"], message: "Production requires at least one ALLOWED_ORIGIN."});
    }
    if (config.env === "production" && !config.databaseSsl) {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: ["databaseSsl"], message: "Production requires DATABASE_SSL=true."});
    }
    if (config.env === "production" && (config.otpHashSecret.length < 32 || config.otpHashSecret.includes("development-only"))) {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: ["otpHashSecret"], message: "Production requires a unique OTP_HASH_SECRET of at least 32 characters."});
    }
    if (config.env === "production" && config.cronSecret.length < 32) {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: ["cronSecret"], message: "Production CRON_SECRET must be at least 32 characters."});
    }
    if (config.env === "production" && !config.cloudinaryAuthTokenKey) {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: ["cloudinaryAuthTokenKey"], message: "Production requires CLOUDINARY_AUTH_TOKEN_KEY so signed media URLs expire."});
    }
    if (config.env === "production" && !config.publicBaseUrl.startsWith("https://")) {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: ["publicBaseUrl"], message: "Production PUBLIC_BASE_URL must use HTTPS."});
    }
    if (config.cloudinarySignedUrlTtlSeconds < 60 || config.cloudinarySignedUrlTtlSeconds > 3600) {
      ctx.addIssue({code: z.ZodIssueCode.custom, path: ["cloudinarySignedUrlTtlSeconds"], message: "CLOUDINARY_SIGNED_URL_TTL_SECONDS must be between 60 and 3600."});
    }
  });

function readNumber(value: string | undefined, fallback: number): number {
  return value === undefined || value === "" ? fallback : Number(value);
}

function readBoolean(value: string | undefined, matchValue = "true"): boolean {
  return value === matchValue;
}

function readCsv(value: string | undefined): string[] {
  return (value || "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

/** Builds the raw config object straight from process.env, mirroring every
 * default the server has always shipped with. `overrides` (used heavily by
 * tests) is applied on top before validation, exactly like the legacy
 * config.js did with its trailing `...overrides` spread. */
function readEnvConfig(overrides: ConfigOverrides): Omit<AppConfig, "imageStorageProvider"> & {imageStorageProvider?: string} {
  const root = path.resolve(__dirname, "../..");
  return {
    env: process.env.NODE_ENV || "development",
    host: process.env.HOST || "0.0.0.0",
    port: readNumber(process.env.PORT, 8080),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:8080",
    uploadDir: path.resolve(root, process.env.UPLOAD_DIR || "data/uploads"),
    allowedOrigins: readCsv(process.env.ALLOWED_ORIGINS),
    trustProxy: readBoolean(process.env.TRUST_PROXY),
    otpHashSecret: process.env.OTP_HASH_SECRET || "development-only-secret-change-me-now",
    otpTtlMinutes: readNumber(process.env.OTP_TTL_MINUTES, 5),
    otpMaxAttempts: readNumber(process.env.OTP_MAX_ATTEMPTS, 5),
    otpRateLimitWindowMinutes: readNumber(process.env.OTP_RATE_LIMIT_WINDOW_MINUTES, 15),
    otpRateLimitMax: readNumber(process.env.OTP_RATE_LIMIT_MAX, 5),
    cronSecret: process.env.CRON_SECRET || "",
    smsProvider: process.env.SMS_PROVIDER || "console",
    otpResendCooldownSeconds: readNumber(process.env.OTP_RESEND_COOLDOWN_SECONDS, 60),
    otpDailyPhoneLimit: readNumber(process.env.OTP_DAILY_PHONE_LIMIT, 10),
    otpDailyIpLimit: readNumber(process.env.OTP_DAILY_IP_LIMIT, 30),
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
    twilioMessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || "",
    twilioFromNumber: process.env.TWILIO_FROM_NUMBER || "",
    sessionTtlDays: readNumber(process.env.SESSION_TTL_DAYS, 30),
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiMaxRetries: readNumber(process.env.GEMINI_MAX_RETRIES, 1),
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
    geminiRetryBaseDelayMs: readNumber(process.env.GEMINI_RETRY_BASE_DELAY_MS, 500),
    geminiTextApiKey: process.env.GEMINI_TEXT_API_KEY || process.env.GEMINI_API_KEY || "",
    geminiTextMaxRetries: readNumber(process.env.GEMINI_TEXT_MAX_RETRIES || process.env.GEMINI_MAX_RETRIES, 1),
    geminiTextFallbackModel: process.env.GEMINI_TEXT_FALLBACK_MODEL || "",
    geminiTextKeySource: (process.env.GEMINI_TEXT_API_KEY ? "TEXT" : "LEGACY_FALLBACK") as "TEXT" | "LEGACY_FALLBACK",
    geminiImageApiKey: process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY || "",
    geminiImageKeySource: (process.env.GEMINI_IMAGE_API_KEY ? "IMAGE" : "LEGACY_FALLBACK") as "IMAGE" | "LEGACY_FALLBACK",
    // 0 by default: image calls are expensive and slow. Operators may opt
    // into same-model retries and/or a separate fallback model explicitly.
    geminiImageMaxRetries: readNumber(process.env.GEMINI_IMAGE_MAX_RETRIES, 0),
    // Primary model is the cheapest/fastest flash-lite variant. No fallback
    // model is selected unless GEMINI_IMAGE_FALLBACK_MODEL is configured.
    // The pricier pro model is never used automatically — only when
    // GEMINI_IMAGE_HIGH_QUALITY_MODE=true — so a normal request never
    // silently upgrades to it.
    geminiImageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image",
    geminiImageFallbackModel: process.env.GEMINI_IMAGE_FALLBACK_MODEL || "",
    geminiImageProModel: process.env.GEMINI_IMAGE_PRO_MODEL || "gemini-3-pro-image",
    geminiImageHighQualityMode: readBoolean(process.env.GEMINI_IMAGE_HIGH_QUALITY_MODE),
    geminiImageSize: process.env.GEMINI_IMAGE_SIZE || "1K",
    geminiImageAspectRatio: process.env.GEMINI_IMAGE_ASPECT_RATIO || "3:4",
    // Per-attempt Gemini image request timeout. Image generation can take
    // longer than ordinary APIs, so this must remain at least 120000ms.
    geminiImageTimeoutMs: readNumber(process.env.GEMINI_IMAGE_TIMEOUT_MS, 120_000),
    geminiImageMaxInputPx: readNumber(process.env.GEMINI_IMAGE_MAX_INPUT_PX, 1024),
    databaseUrl: process.env.DATABASE_URL || "",
    databasePoolMax: readNumber(process.env.DATABASE_POOL_MAX, 10),
    databaseSsl: readBoolean(process.env.DATABASE_SSL),
    databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
    cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
    // Base path prefix; each new upload is routed into a purpose-specific
    // sub-folder beneath it (see CLOUDINARY_PURPOSE_FOLDERS in constants.ts).
    cloudinaryFolder: process.env.CLOUDINARY_FOLDER || "nera",
    // Optional: a token-based authentication key created in the Cloudinary
    // console (Settings > Security). Without it, signed Cloudinary URLs are
    // still private/authenticated but do not expire.
    cloudinaryAuthTokenKey: process.env.CLOUDINARY_AUTH_TOKEN_KEY || "",
    cloudinarySignedUrlTtlSeconds: readNumber(process.env.CLOUDINARY_SIGNED_URL_TTL_SECONDS, 900),
    // Periodic housekeeping: how often the server purges expired/orphaned
    // rows (and their Cloudinary objects, for unsaved try-on results) so
    // Postgres storage doesn't grow unbounded. See services/maintenance.service.ts.
    cleanupIntervalMinutes: readNumber(process.env.CLEANUP_INTERVAL_MINUTES, 360),
    otpRetentionDays: readNumber(process.env.OTP_RETENTION_DAYS, 7),
    sessionRetentionDays: readNumber(process.env.SESSION_RETENTION_DAYS, 30),
    analysisJobRetentionDays: readNumber(process.env.ANALYSIS_JOB_RETENTION_DAYS, 14),
    mediaAssetRetentionDays: readNumber(process.env.MEDIA_ASSET_RETENTION_DAYS, 14),
    // Generated virtual try-on images the user never saved are deleted
    // (Cloudinary object + DB row) after this many hours. Saved looks
    // (is_saved = true) are never touched by this cleanup.
    tryonUnsavedRetentionHours: readNumber(process.env.TRYON_UNSAVED_RETENTION_HOURS, 24),
    rateLimitWindowSeconds: readNumber(process.env.RATE_LIMIT_WINDOW_SECONDS, 60),
    rateLimitAuthMax: readNumber(process.env.RATE_LIMIT_AUTH_MAX, 20),
    rateLimitApiMax: readNumber(process.env.RATE_LIMIT_API_MAX, 120),
    rateLimitProfileAnalysisMax: readNumber(process.env.RATE_LIMIT_PROFILE_ANALYSIS_MAX, 3),
    rateLimitWardrobeAnalysisMax: readNumber(process.env.RATE_LIMIT_WARDROBE_ANALYSIS_MAX, 10),
    rateLimitOutfitGenerationMax: readNumber(process.env.RATE_LIMIT_OUTFIT_GENERATION_MAX, 10),
    rateLimitTryonMax: readNumber(process.env.RATE_LIMIT_TRYON_MAX, 2),
    aiDailyProfileAnalysisLimit: readNumber(process.env.AI_DAILY_PROFILE_ANALYSIS_LIMIT, 3),
    aiDailyWardrobeAnalysisLimit: readNumber(process.env.AI_DAILY_WARDROBE_ANALYSIS_LIMIT, 30),
    aiDailyOutfitGenerationLimit: readNumber(process.env.AI_DAILY_OUTFIT_GENERATION_LIMIT, 30),
    aiDailyTryonLimit: readNumber(process.env.AI_DAILY_TRYON_LIMIT, 5),
    aiMonthlyProfileAnalysisLimit: readNumber(process.env.AI_MONTHLY_PROFILE_ANALYSIS_LIMIT, 20),
    aiMonthlyWardrobeAnalysisLimit: readNumber(process.env.AI_MONTHLY_WARDROBE_ANALYSIS_LIMIT, 300),
    aiMonthlyOutfitGenerationLimit: readNumber(process.env.AI_MONTHLY_OUTFIT_GENERATION_LIMIT, 300),
    aiMonthlyTryonLimit: readNumber(process.env.AI_MONTHLY_TRYON_LIMIT, 50),
    aiConcurrentRequestsPerUser: readNumber(process.env.AI_CONCURRENT_REQUESTS_PER_USER, 1),
    aiReservationTimeoutMinutes: readNumber(process.env.AI_RESERVATION_TIMEOUT_MINUTES, 10),
    aiUsageRetentionDays: readNumber(process.env.AI_USAGE_RETENTION_DAYS, 400),
    // Open-Meteo is free and keyless, so these only ever need overriding in
    // unusual deployments (a self-hosted mirror, tighter timeouts, etc).
    weatherApiBaseUrl: process.env.WEATHER_API_BASE_URL || "https://api.open-meteo.com/v1/forecast",
    weatherRequestTimeoutMs: readNumber(process.env.WEATHER_REQUEST_TIMEOUT_MS, 8_000),
    // How long a rounded-coordinate weather reading is reused before the
    // next request re-fetches it (30-60 minutes, per product requirements).
    weatherCacheTtlMinutes: readNumber(process.env.WEATHER_CACHE_TTL_MINUTES, 45),
    // Auto-selected below (Cloudinary if fully configured, otherwise local)
    // unless explicitly set via IMAGE_STORAGE_PROVIDER or an override.
    imageStorageProvider: process.env.IMAGE_STORAGE_PROVIDER || "",
    ...overrides,
  };
}

export function loadConfig(overrides: ConfigOverrides = {}): AppConfig {
  const draft = readEnvConfig(overrides);

  const cloudinaryFields = [draft.cloudinaryCloudName, draft.cloudinaryApiKey, draft.cloudinaryApiSecret];
  const cloudinaryConfigured = cloudinaryFields.every(Boolean);
  draft.imageStorageProvider = draft.imageStorageProvider || (cloudinaryConfigured ? "cloudinary" : "local");

  const result = configSchema.safeParse(draft);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `- ${issue.message}`).join("\n");
    throw new Error(`Invalid server configuration:\n${issues}`);
  }
  return result.data;
}
