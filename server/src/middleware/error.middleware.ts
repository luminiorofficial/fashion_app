import multer from "multer";
import type {Request, Response, NextFunction, ErrorRequestHandler} from "express";
import {ApiError} from "../utils/api-error";
import type {AppConfig} from "../config/env";
import type {ApiErrorResponse} from "../types/api-error.types";
import {safeOperationalError} from "../utils/safe-logging";

export function notFoundMiddleware(_request: Request, _response: Response, next: NextFunction): void {
  next(new ApiError(404, "NOT_FOUND", "Endpoint not found."));
}

export function createErrorMiddleware(config: Pick<AppConfig, "env">): ErrorRequestHandler {
  return (rawError, request, response, _next) => {
    let error = rawError instanceof ApiError ? rawError : new ApiError(500, "INTERNAL_ERROR", "The server could not complete the request.");
    if (rawError instanceof multer.MulterError) {
      const isTooLarge = rawError.code === "LIMIT_FILE_SIZE";
      error = new ApiError(isTooLarge ? 413 : 400, rawError.code, isTooLarge ? "Images must be 5 MB or smaller." : rawError.message);
    }
    const status = error.status || 500;
    const code = error.code || "INTERNAL_ERROR";
    if (status >= 500) safeOperationalError("NERA API request failed", rawError, {requestId: request.requestId, status, code});
    if (config.env === "development" && status < 500) console.error(`[NERA API ${error.code || "INTERNAL_ERROR"}]`, error.message);
    const message = error.code === "WARDROBE_ITEM_HAS_NO_IMAGE" || status < 500 ? error.message : "The server could not complete the request.";
    const body: ApiErrorResponse = {error: {code, message, ...(status < 500 && error.details ? {details: error.details} : {})}};
    response.status(status).json(body);
  };
}
