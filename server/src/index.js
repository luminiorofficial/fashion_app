const {loadConfig} = require("./config");
const {createApp} = require("./app");
const {InMemoryRepository} = require("./repository");
const {PostgresRepository} = require("./postgres_repository");
const {LocalAssetStore} = require("./storage");
const {FashionAnalyzer} = require("./analyzer");
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
  const assetStore = new LocalAssetStore(config);
  const analyzer = new FashionAnalyzer(config);
  const smsProvider = createSmsProvider(config);
  const app = createApp({config, repository, assetStore, analyzer, smsProvider});
  const server = app.listen(config.port, () => console.info(`NERA API listening on ${config.publicBaseUrl}/api/v1`));

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
