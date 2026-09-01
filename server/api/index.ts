// Vercel serverless entry point. Unlike src/server.ts (used by `npm start`
// for local dev, which calls app.listen()), this exports a request handler
// and never listens on a port — Vercel's Node.js runtime invokes it per
// request. The built app/dependencies are cached at module scope so warm
// invocations reuse the same PostgreSQL pool instead of reconnecting every
// request.
import type {IncomingMessage, ServerResponse} from "node:http";
import type {Express} from "express";
import {loadConfig} from "../src/config/env";
import {buildDependencies} from "../src/bootstrap";
import {createApiApp} from "../src/container";
import {safeOperationalError} from "../src/utils/safe-logging";

let appPromise: Promise<Express> | undefined;

async function buildApp(): Promise<Express> {
  const config = loadConfig();
  const deps = await buildDependencies(config);
  return createApiApp(deps);
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!appPromise) {
    // Don't cache a failed build (e.g. a transient DB connection error) —
    // let the next invocation retry instead of failing forever.
    appPromise = buildApp().catch((error) => {
      appPromise = undefined;
      throw error;
    });
  }
  let app: Express;
  try {
    app = await appPromise;
  } catch (error) {
    safeOperationalError("NERA API failed to initialize", error);
    response.statusCode = 500;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({error: {code: "SERVER_INITIALIZATION_FAILED", message: "The server could not initialize."}}));
    return;
  }
  app(request, response);
}
