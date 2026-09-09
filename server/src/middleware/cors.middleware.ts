import type {Request, Response, NextFunction} from "express";

export function createCorsMiddleware(allowedOrigins: string[]) {
  return function corsMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    const origin = request.get("origin");

    const isLocalhost =
      !!origin &&
      /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

    const isAllowed =
      !origin ||
      allowedOrigins.includes(origin) ||
      isLocalhost;

    if (origin && isAllowed) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
    }

    response.set({
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, Idempotency-Key, X-Request-Id",
      "Access-Control-Allow-Methods":
        "GET, POST, DELETE, OPTIONS",
    });

    if (request.method === "OPTIONS") {
      response.sendStatus(isAllowed ? 204 : 403);
      return;
    }

    next();
  };
}