const {loadConfig} = require("./config");
const {createApp} = require("./app");
const {InMemoryRepository} = require("./repository");
const {PostgresRepository} = require("./postgres_repository");
const {LocalAssetStore, CloudinaryAssetStore} = require("./storage");
const {FashionAnalyzer} = require("./analyzer");
const {GeminiVirtualTryOnProvider, UnavailableVirtualTryOnProvider} = require("./tryon_provider");
const {createSmsProvider} = require("./sms");

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
  const tryonProvider = config.geminiApiKey ? new GeminiVirtualTryOnProvider(config) : new UnavailableVirtualTryOnProvider();
  const smsProvider = createSmsProvider(config);
  const app = createApp({config, repository, assetStore, analyzer, smsProvider, tryonProvider});
  const server = app.listen(config.port, config.host, () => console.info(`NERA API listening on ${config.publicBaseUrl}/api/v1`));

  const shutdown = () => server.close(async () => {
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
