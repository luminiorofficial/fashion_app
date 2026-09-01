import type {Request, Response, NextFunction} from "express";

export function createCorsMiddleware(allowedOrigins: string[]) {
 return function corsMiddleware(request: Request, response: Response, next: NextFunction): void {
  const origin = request.get("origin");
  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.set({
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key, X-Request-Id",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  });
  if (request.method === "OPTIONS") {
    response.sendStatus(!origin || allowedOrigins.includes(origin) ? 204 : 403);
    return;
  }
  next();
 };
}
