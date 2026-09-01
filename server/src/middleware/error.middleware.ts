import multer from "multer";
import type {Request, Response, NextFunction, ErrorRequestHandler} from "express";
import {ApiError} from "../utils/api-error";
import type {AppConfig} from "../config/env";
import type {ApiErrorResponse} from "../types/api-error.types";

export function notFoundMiddleware(_request: Request, _response: Response, next: NextFunction): void {
  next(new ApiError(404, "NOT_FOUND", "Endpoint not found."));
}

export function createErrorMiddleware(config: Pick<AppConfig, "env">): ErrorRequestHandler {
  return (rawError, _request, response, _next) => {
    let error = rawError as ApiError;
    if (rawError instanceof multer.MulterError) {
      const isTooLarge = rawError.code === "LIMIT_FILE_SIZE";
      error = new ApiError(isTooLarge ? 413 : 400, rawError.code, isTooLarge ? "Images must be 5 MB or smaller." : rawError.message);
    }
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    if (config.env === "development") console.error(`[NERA API ${error.code || "INTERNAL_ERROR"}]`, error.message);
    const message = error.code === "WARDROBE_ITEM_HAS_NO_IMAGE" || status < 500 ? error.message : "The server could not complete the request.";
    const body: ApiErrorResponse = {error: {code: error.code || "INTERNAL_ERROR", message, ...(error.details ? {details: error.details} : {})}};
    response.status(status).json(body);
  };
}
