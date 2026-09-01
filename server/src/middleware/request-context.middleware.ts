import crypto from "node:crypto";
import type {Request, Response, NextFunction} from "express";

export function requestContextMiddleware(request: Request, response: Response, next: NextFunction): void {
  const supplied = request.get("x-request-id")?.trim();
  const requestId = supplied && /^[A-Za-z0-9._:-]{8,100}$/.test(supplied) ? supplied : crypto.randomUUID();
  request.requestId = requestId;
  response.setHeader("x-request-id", requestId);
  next();
}

export function secureHeadersMiddleware(request: Request, response: Response, next: NextFunction): void {
  response.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Resource-Policy": "same-site",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  });
  if (request.secure) response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}
