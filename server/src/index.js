const {loadConfig} = require("./config");
const {createApp} = require("./app");
const {InMemoryRepository} = require("./repository");
const {PostgresRepository} = require("./postgres_repository");
const {LocalAssetStore, CloudinaryAssetStore} = require("./storage");
const {FashionAnalyzer} = require("./analyzer");
const {GeminiVirtualTryOnProvider, UnavailableVirtualTryOnProvider} = require("./tryon_provider");
const {createSmsProvider} = require("./sms");
const {runCleanup} = require("./cleanup");

async function start() {
  const config = loadConfig();
  const repository = config.databaseUrl ? new PostgresRepository(config) : new InMemoryRepository();
  if (repository instanceof PostgresRepository) {
    const connection = await repository.connect();
    console.info(`Connected to PostgreSQL database ${connection.database} as ${connection.username}.`);
  } else {
    console.warn("DATABASE_URL is not configured; data will use temporary in-memory storage.");
  }
  const assetStore = config.imageStorageProvider === "cloudinary" ? new CloudinaryAssetStore(config) : new LocalAssetStore(config);
  if (assetStore instanceof CloudinaryAssetStore) {
    console.info(`Using Cloudinary (cloud "${config.cloudinaryCloudName}") for private image storage.`);
  } else {
    console.warn("Image storage is not configured for Cloudinary; images will be stored on local disk (development only).");
  }
  const analyzer = new FashionAnalyzer(config);
  const tryonProvider = config.geminiImageApiKey ? new GeminiVirtualTryOnProvider(config) : new UnavailableVirtualTryOnProvider();
  const smsProvider = createSmsProvider(config);
  const app = createApp({config, repository, assetStore, analyzer, smsProvider, tryonProvider});
  const server = app.listen(config.port, config.host, () => console.info(`NERA API listening on ${config.publicBaseUrl}/api/v1`));

  // Periodic DB/Cloudinary housekeeping. Only meaningful against a real
  // database; skipped for the temporary in-memory dev adapter.
  let cleanupTimer;
  if (repository instanceof PostgresRepository) {
    const runAndLog = () => runCleanup({repository, assetStore, config})
      .then((summary) => { if (config.env === "development") console.info("[NERA cleanup]", summary); })
      .catch((error) => console.error("NERA cleanup failed:", error.message));
    runAndLog();
    cleanupTimer = setInterval(runAndLog, config.cleanupIntervalMinutes * 60_000);
    cleanupTimer.unref();
  }

  const shutdown = () => server.close(async () => {
    clearInterval(cleanupTimer);
    await repository.close?.();
    process.exit(0);
  });
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("NERA API failed to start:", error.message);
  process.exitCode = 1;
});
