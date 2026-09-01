import express, {type Express, type Router} from "express";
import {createCorsMiddleware} from "./middleware/cors.middleware";
import {requestContextMiddleware, secureHeadersMiddleware} from "./middleware/request-context.middleware";
import {notFoundMiddleware, createErrorMiddleware} from "./middleware/error.middleware";
import type {AppConfig} from "./config/env";

export interface CreateAppOptions {
  config: Pick<AppConfig, "env" | "imageStorageProvider" | "uploadDir" | "allowedOrigins" | "trustProxy">;
  apiRouter: Router;
}

// Express wiring only: global middleware, the /api/v1 router (built by
// container.ts), 404 handling, and error handling. All business logic
// lives in services; all persistence lives in repositories/providers — see
// container.ts for how they're wired together.
export function createApp({config, apiRouter}: CreateAppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);
  app.use(requestContextMiddleware);
  app.use(secureHeadersMiddleware);
  app.use(express.json({limit: "256kb"}));
  app.use(createCorsMiddleware(config.allowedOrigins));

  if (config.imageStorageProvider === "local") {
    app.use("/uploads", express.static(config.uploadDir, {fallthrough: false, immutable: true, maxAge: "1d"}));
  }

  app.use("/api/v1", apiRouter);
  app.use(notFoundMiddleware);
  app.use(createErrorMiddleware(config));

  return app;
}
