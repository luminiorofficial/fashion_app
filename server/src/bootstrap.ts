import {ConfigValidationError, type AppConfig} from "./config/env";
import {describeFailure} from "./utils/safe-logging";
import {createRepositories, isPostgresRepositories} from "./database/repositories";
import {LocalAssetStore} from "./providers/storage/local.provider";
import {CloudinaryAssetStore} from "./providers/cloudinary/cloudinary.provider";
import {GeminiTextAnalyzerProvider} from "./providers/gemini/text-analyzer.provider";
import {GeminiVirtualTryOnProvider, UnavailableVirtualTryOnProvider} from "./providers/gemini/image-tryon.provider";
import {createSmsProvider} from "./providers/sms";
import {OpenMeteoWeatherProvider} from "./providers/weather/open-meteo.provider";
import {GoogleGmailApiClient} from "./commerce/gmail/gmail-api-client";
import type {AppDependencies} from "./container";
import type {AssetStore} from "./types/provider.types";

// Thrown by buildDependencies() when a specific external dependency fails to
// come up, tagged with which one so describeStartupFailure() below can log a
// safe, actionable reason without ever touching the wrapped error's message
// — driver/SDK error messages can embed connection details (host, user,
// etc.) that shouldn't reach logs.
export class DependencyInitializationError extends Error {
  constructor(public readonly phase: "postgresql_connection" | "cloudinary_setup", cause: unknown) {
    super(phase);
    this.name = "DependencyInitializationError";
    this.cause = cause;
  }
}

// Builds the real, deployable set of dependencies from config: PostgreSQL
// or the temporary in-memory adapter, Cloudinary or local-disk image
// storage, the Gemini text/image providers, and the console/Twilio SMS
// provider. Used by server.ts (local/persistent process) and the Vercel
// entrypoints (api/index.ts, api/cron/cleanup.ts) — both need the exact
// same wiring, so it lives here once instead of being duplicated across
// entrypoints.
export async function buildDependencies(config: AppConfig): Promise<AppDependencies> {
  const repositories = createRepositories(config);
  if (isPostgresRepositories(repositories)) {
    try {
      await repositories.connect();
    } catch (error) {
      throw new DependencyInitializationError("postgresql_connection", error);
    }
    console.info("Connected to PostgreSQL.");
  } else {
    console.warn("DATABASE_URL is not configured; data will use temporary in-memory storage.");
  }

  let assetStore: AssetStore;
  if (config.imageStorageProvider === "cloudinary") {
    try {
      assetStore = new CloudinaryAssetStore(config);
    } catch (error) {
      throw new DependencyInitializationError("cloudinary_setup", error);
    }
    console.info("Using Cloudinary for private image storage.");
  } else {
    assetStore = new LocalAssetStore(config);
    console.warn("Image storage is not configured for Cloudinary; images will be stored on local disk (development only).");
  }

  const textAnalyzer = new GeminiTextAnalyzerProvider(config);
  const tryonProvider = config.geminiImageApiKey ? new GeminiVirtualTryOnProvider(config) : new UnavailableVirtualTryOnProvider();
  const smsProvider = createSmsProvider(config);
  const weatherProvider = new OpenMeteoWeatherProvider(config);
  // Always constructed, like GeminiTextAnalyzerProvider above — harmless
  // when googleClientId/googleClientSecret are unset, since every /commerce
  // route except the OAuth callback is gated on them being configured
  // (see commerce.controller.ts's assertGmailConfigured).
  const gmailApiClient = new GoogleGmailApiClient(config);

  return {config, repositories, assetStore, textAnalyzer, tryonProvider, smsProvider, weatherProvider, gmailApiClient};
}

const DEPENDENCY_PHASE_LABELS: Record<DependencyInitializationError["phase"], string> = {
  postgresql_connection: "PostgreSQL connection failure",
  cloudinary_setup: "Cloudinary setup failure",
};

// Reduces a loadConfig()/buildDependencies() failure to one safe, human-
// readable line for startup logging (see api/index.ts and server.ts).
// ConfigValidationError messages are always safe to show in full (see its
// definition); DependencyInitializationError only ever surfaces the
// underlying error's name/code via describeFailure, never its message,
// since driver/SDK error messages can echo connection details.
export function describeStartupFailure(error: unknown): string {
  if (error instanceof ConfigValidationError) return error.message;
  if (error instanceof DependencyInitializationError) return `${DEPENDENCY_PHASE_LABELS[error.phase]} (${describeFailure(error.cause)})`;
  return `Unexpected startup failure (${describeFailure(error)})`;
}
