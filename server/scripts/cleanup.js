// Standalone entry point for src/cleanup.js, for an external cron/scheduled
// task instead of (or in addition to) the in-process interval started by
// src/index.js. Usage: node --env-file-if-exists=.env scripts/cleanup.js
const {loadConfig} = require("../src/config");
const {PostgresRepository} = require("../src/postgres_repository");
const {LocalAssetStore, CloudinaryAssetStore} = require("../src/storage");
const {runCleanup} = require("../src/cleanup");

async function main() {
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required. Add it to server/.env before running cleanup.");

  const repository = new PostgresRepository(config);
  const assetStore = config.imageStorageProvider === "cloudinary" ? new CloudinaryAssetStore(config) : new LocalAssetStore(config);
  try {
    const connection = await repository.connect();
    console.info(`Connected to ${connection.database} as ${connection.username}.`);
    const summary = await runCleanup({repository, assetStore, config});
    console.info("Cleanup complete:", summary);
  } finally {
    await repository.close();
  }
}

main().catch((error) => {
  console.error(`Cleanup failed: ${error.message}`);
  process.exitCode = 1;
});
