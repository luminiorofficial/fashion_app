import path from "node:path";
import {z} from "zod";

export interface AppConfig {
  env: string;
  host: string;
  port: number;
  publicBaseUrl: string;
  uploadDir: string;
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
  allowConsoleOtpInProduction: boolean;
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
  geminiImageApiKey: string;
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
    otpHashSecret: z.string().min(1),
    otpTtlMinutes: z.number(),
    otpMaxAttempts: z.number(),
    otpRateLimitWindowMinutes: z.number(),
    otpRateLimitMax: z.number(),
    cronSecret: z.string(),
    smsProvider: z.string(),
    allowConsoleOtpInProduction: z.boolean(),
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
    geminiImageApiKey: z.string(),
    geminiImageMaxRetries: z.number(),
    geminiImageModel: z.string().min(1),
    geminiImageFallbackModel: z.string().min(1),
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
  })
  .superRefine((config, ctx) => {
    const cloudinaryFields = [config.cloudinaryCloudName, config.cloudinaryApiKey, config.cloudinaryApiSecret];
    const cloudinaryConfigured = cloudinaryFields.every(Boolean);
    const cloudinaryPartiallyConfigured = cloudinaryFields.some(Boolean) && !cloudinaryConfigured;

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
  });

function readNumber(value: string | undefined, fallback: number): number {
  return value === undefined || value === "" ? fallback : Number(value);
}

function readBoolean(value: string | undefined, matchValue = "true"): boolean {
  return value === matchValue;
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
    otpHashSecret: process.env.OTP_HASH_SECRET || "development-only-secret-change-me-now",
    otpTtlMinutes: readNumber(process.env.OTP_TTL_MINUTES, 5),
    otpMaxAttempts: readNumber(process.env.OTP_MAX_ATTEMPTS, 5),
    otpRateLimitWindowMinutes: readNumber(process.env.OTP_RATE_LIMIT_WINDOW_MINUTES, 15),
    otpRateLimitMax: readNumber(process.env.OTP_RATE_LIMIT_MAX, 5),
    cronSecret: process.env.CRON_SECRET || "",
    smsProvider: process.env.SMS_PROVIDER || "console",
    allowConsoleOtpInProduction: readBoolean(process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION),
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
    twilioMessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || "",
    twilioFromNumber: process.env.TWILIO_FROM_NUMBER || "",
    sessionTtlDays: readNumber(process.env.SESSION_TTL_DAYS, 30),
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiMaxRetries: readNumber(process.env.GEMINI_MAX_RETRIES, 3),
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
    geminiRetryBaseDelayMs: readNumber(process.env.GEMINI_RETRY_BASE_DELAY_MS, 500),
    geminiTextApiKey: process.env.GEMINI_TEXT_API_KEY || process.env.GEMINI_API_KEY || "",
    geminiTextMaxRetries: readNumber(process.env.GEMINI_TEXT_MAX_RETRIES || process.env.GEMINI_MAX_RETRIES, 3),
    geminiImageApiKey: process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY || "",
    // 0 by default: the primary/fallback model chain already gives every
    // try-on a second attempt on a different model, so a same-model retry
    // on top of that just doubles worst-case latency for no real benefit.
    geminiImageMaxRetries: readNumber(process.env.GEMINI_IMAGE_MAX_RETRIES, 0),
    // Primary model is the cheapest/fastest flash-lite variant; the
    // standard flash model is the fallback if it's unavailable or fails.
    // The pricier pro model is never used automatically — only when
    // GEMINI_IMAGE_HIGH_QUALITY_MODE=true — so a normal request never
    // silently upgrades to it.
    geminiImageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image",
    geminiImageFallbackModel: process.env.GEMINI_IMAGE_FALLBACK_MODEL || "gemini-3.1-flash-image",
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
