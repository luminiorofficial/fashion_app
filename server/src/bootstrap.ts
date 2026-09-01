import type {AppConfig} from "./config/env";
import {createRepositories, isPostgresRepositories} from "./database/repositories";
import {LocalAssetStore} from "./providers/storage/local.provider";
import {CloudinaryAssetStore} from "./providers/cloudinary/cloudinary.provider";
import {GeminiTextAnalyzerProvider} from "./providers/gemini/text-analyzer.provider";
import {GeminiVirtualTryOnProvider, UnavailableVirtualTryOnProvider} from "./providers/gemini/image-tryon.provider";
import {createSmsProvider} from "./providers/sms";
import type {AppDependencies} from "./container";
import type {AssetStore} from "./types/provider.types";

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
    await repositories.connect();
    console.info("Connected to PostgreSQL.");
  } else {
    console.warn("DATABASE_URL is not configured; data will use temporary in-memory storage.");
  }

  const assetStore: AssetStore = config.imageStorageProvider === "cloudinary" ? new CloudinaryAssetStore(config) : new LocalAssetStore(config);
  if (config.imageStorageProvider === "cloudinary") {
    console.info("Using Cloudinary for private image storage.");
  } else {
    console.warn("Image storage is not configured for Cloudinary; images will be stored on local disk (development only).");
  }

  const textAnalyzer = new GeminiTextAnalyzerProvider(config);
  const tryonProvider = config.geminiImageApiKey ? new GeminiVirtualTryOnProvider(config) : new UnavailableVirtualTryOnProvider();
  const smsProvider = createSmsProvider(config);

  return {config, repositories, assetStore, textAnalyzer, tryonProvider, smsProvider};
}
