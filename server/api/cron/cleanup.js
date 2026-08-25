// Vercel Cron target (see the "crons" entry in server/vercel.json). The
// setInterval-based cleanup in src/index.js only runs inside a persistent
// process, which serverless functions are not, so scheduled housekeeping
// (expired OTPs, stale sessions, unsaved try-on results) has to be invoked
// this way instead. Vercel automatically sends
// `Authorization: Bearer <CRON_SECRET>` on cron-triggered requests when a
// CRON_SECRET env var is set on the project; set one so this endpoint can't
// be triggered by anyone who finds the URL.
const {loadConfig} = require("../../src/config");
const {PostgresRepository} = require("../../src/postgres_repository");
const {LocalAssetStore, CloudinaryAssetStore} = require("../../src/storage");
const {runCleanup} = require("../../src/cleanup");

module.exports = async (request, response) => {
  const config = loadConfig();
  if (config.cronSecret) {
    const expected = `Bearer ${config.cronSecret}`;
    if (request.headers.authorization !== expected) {
      response.status(401).json({error: {code: "UNAUTHORIZED", message: "Missing or invalid cron secret."}});
      return;
    }
  }
  if (!config.databaseUrl) {
    response.status(200).json({skipped: true, reason: "DATABASE_URL is not configured."});
    return;
  }
  const repository = new PostgresRepository(config);
  const assetStore = config.imageStorageProvider === "cloudinary" ? new CloudinaryAssetStore(config) : new LocalAssetStore(config);
  try {
    await repository.connect();
    const summary = await runCleanup({repository, assetStore, config});
    response.status(200).json({status: "ok", summary});
  } catch (error) {
    console.error("Cron cleanup failed:", error);
    response.status(500).json({error: {code: "CLEANUP_FAILED", message: error.message}});
  } finally {
    await repository.close();
  }
};
