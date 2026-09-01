// Standalone entry point for services/maintenance.service.ts, for an
// external cron/scheduled task instead of (or in addition to) the
// in-process interval started by src/server.ts.
// Usage: node --env-file-if-exists=.env -r tsx/cjs scripts/cleanup.ts (or `npm run db:cleanup`)
import {loadConfig} from "../src/config/env";
import {createPostgresRepositories} from "../src/database/repositories/postgres";
import {LocalAssetStore} from "../src/providers/storage/local.provider";
import {CloudinaryAssetStore} from "../src/providers/cloudinary/cloudinary.provider";
import {MaintenanceService} from "../src/services/maintenance.service";

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required. Add it to server/.env before running cleanup.");

  const repositories = createPostgresRepositories(config);
  const assetStore = config.imageStorageProvider === "cloudinary" ? new CloudinaryAssetStore(config) : new LocalAssetStore(config);
  try {
    const connection = await repositories.connect();
    console.info(`Connected to ${connection.database} as ${connection.username}.`);
    const maintenance = new MaintenanceService(repositories, assetStore, config);
    const summary = await maintenance.runCleanup();
    console.info("Cleanup complete:", summary);
  } finally {
    await repositories.close();
  }
}

main().catch((error: Error) => {
  console.error(`Cleanup failed: ${error.message}`);
  process.exitCode = 1;
});
