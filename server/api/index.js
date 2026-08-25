// Vercel serverless entry point. Unlike src/index.js (used by `npm start`
// for local dev, which calls app.listen()), this exports a request handler
// and never listens on a port — Vercel's Node.js runtime invokes it per
// request. The built app/repository/asset store are cached at module scope
// so warm invocations reuse the same PostgreSQL pool instead of reconnecting
// every request.
const {loadConfig} = require("../src/config");
const {createApp} = require("../src/app");
const {InMemoryRepository} = require("../src/repository");
const {PostgresRepository} = require("../src/postgres_repository");
const {LocalAssetStore, CloudinaryAssetStore} = require("../src/storage");
const {FashionAnalyzer} = require("../src/analyzer");
const {GeminiVirtualTryOnProvider, UnavailableVirtualTryOnProvider} = require("../src/tryon_provider");
const {createSmsProvider} = require("../src/sms");

let appPromise;

async function buildApp() {
  const config = loadConfig();
  const repository = config.databaseUrl ? new PostgresRepository(config) : new InMemoryRepository();
  if (repository instanceof PostgresRepository) {
    const connection = await repository.connect();
    console.info(`Connected to PostgreSQL database ${connection.database} as ${connection.username}.`);
  } else {
    console.warn("DATABASE_URL is not configured; data will use temporary in-memory storage.");
  }
  const assetStore = config.imageStorageProvider === "cloudinary" ? new CloudinaryAssetStore(config) : new LocalAssetStore(config);
  const analyzer = new FashionAnalyzer(config);
  const tryonProvider = config.geminiImageApiKey ? new GeminiVirtualTryOnProvider(config) : new UnavailableVirtualTryOnProvider();
  const smsProvider = createSmsProvider(config);
  return createApp({config, repository, assetStore, analyzer, smsProvider, tryonProvider});
}

module.exports = async (request, response) => {
  if (!appPromise) {
    // Don't cache a failed build (e.g. a transient DB connection error) —
    // let the next invocation retry instead of failing forever.
    appPromise = buildApp().catch((error) => {
      appPromise = undefined;
      throw error;
    });
  }
  let app;
  try {
    app = await appPromise;
  } catch (error) {
    // Without this, the rejection propagates uncaught and Vercel's platform
    // wrapper replaces it with an opaque "SERVER_INITIALIZATION_FAILED"
    // response, hiding the real cause. Logging the full error here is what
    // makes it visible in the Vercel deployment's Runtime Logs.
    console.error("NERA API failed to initialize:", error);
    response.status(500).json({error: {code: "SERVER_INITIALIZATION_FAILED", message: "The server could not initialize.", detail: error.message}});
    return;
  }
  return app(request, response);
};
