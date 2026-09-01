import {loadConfig} from "./config/env";
import {buildDependencies} from "./bootstrap";
import {createApiApp} from "./container";
import {isPostgresRepositories} from "./database/repositories";
import {MaintenanceService} from "./services/maintenance.service";

async function start(): Promise<void> {
  const config = loadConfig();
  const deps = await buildDependencies(config);
  const app = createApiApp(deps);
  const server = app.listen(config.port, config.host, () => console.info(`NERA API listening on ${config.publicBaseUrl}/api/v1`));

  // Periodic DB/Cloudinary housekeeping. Only meaningful against a real
  // database; skipped for the temporary in-memory dev adapter.
  let cleanupTimer: NodeJS.Timeout | undefined;
  if (isPostgresRepositories(deps.repositories)) {
    const maintenance = new MaintenanceService(deps.repositories, deps.assetStore, config);
    const runAndLog = () =>
      maintenance
        .runCleanup()
        .then((summary) => {
          if (config.env === "development") console.info("[NERA cleanup]", summary);
        })
        .catch((error: Error) => console.error("NERA cleanup failed:", error.message));
    runAndLog();
    cleanupTimer = setInterval(runAndLog, config.cleanupIntervalMinutes * 60_000);
    cleanupTimer.unref();
  }

  const shutdown = () =>
    server.close(async () => {
      if (cleanupTimer) clearInterval(cleanupTimer);
      await deps.repositories.close();
      process.exit(0);
    });
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

start().catch((error: Error) => {
  console.error("NERA API failed to start:", error.message);
  process.exitCode = 1;
});
