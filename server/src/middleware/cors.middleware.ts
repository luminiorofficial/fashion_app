import type {Request, Response, NextFunction} from "express";

export function corsMiddleware(request: Request, response: Response, next: NextFunction): void {
  response.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  });
  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
}
