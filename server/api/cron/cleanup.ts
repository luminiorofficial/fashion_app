// Vercel Cron target (see the "crons" entry in server/vercel.json). The
// setInterval-based cleanup in src/server.ts only runs inside a persistent
// process, which serverless functions are not, so scheduled housekeeping
// (expired OTPs, stale sessions, unsaved try-on results) has to be invoked
// this way instead. Vercel automatically sends
// `Authorization: Bearer <CRON_SECRET>` on cron-triggered requests when a
// CRON_SECRET env var is set on the project; set one so this endpoint can't
// be triggered by anyone who finds the URL.
import type {IncomingMessage, ServerResponse} from "node:http";
import {loadConfig} from "../../src/config/env";
import {createPostgresRepositories} from "../../src/database/repositories/postgres";
import {LocalAssetStore} from "../../src/providers/storage/local.provider";
import {CloudinaryAssetStore} from "../../src/providers/cloudinary/cloudinary.provider";
import {MaintenanceService} from "../../src/services/maintenance.service";

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const config = loadConfig();
  if (config.cronSecret) {
    const expected = `Bearer ${config.cronSecret}`;
    if (request.headers.authorization !== expected) {
      sendJson(response, 401, {error: {code: "UNAUTHORIZED", message: "Missing or invalid cron secret."}});
      return;
    }
  }
  if (!config.databaseUrl) {
    sendJson(response, 200, {skipped: true, reason: "DATABASE_URL is not configured."});
    return;
  }
  const repositories = createPostgresRepositories(config);
  const assetStore = config.imageStorageProvider === "cloudinary" ? new CloudinaryAssetStore(config) : new LocalAssetStore(config);
  try {
    await repositories.connect();
    const maintenance = new MaintenanceService(repositories, assetStore, config);
    const summary = await maintenance.runCleanup();
    sendJson(response, 200, {status: "ok", summary});
  } catch (error) {
    console.error("Cron cleanup failed:", error);
    sendJson(response, 500, {error: {code: "CLEANUP_FAILED", message: (error as Error).message}});
  } finally {
    await repositories.close();
  }
}
