import {sha256} from "../utils/crypto";
import {ApiError} from "../utils/api-error";
import type {Request, Response, NextFunction, RequestHandler} from "express";
import type {AppConfig} from "../config/env";
import type {AiOperation, SecurityRepository} from "../types/repositories";
import {safeOperationalError} from "../utils/safe-logging";

function setRateHeaders(response: Response, remaining: number, resetAt: string): void {
  response.setHeader("RateLimit-Remaining", String(remaining));
  response.setHeader("RateLimit-Reset", String(Math.ceil(new Date(resetAt).getTime() / 1000)));
}

export function createRateLimitMiddleware(options: {
  security: SecurityRepository;
  namespace: string;
  limit: number;
  windowSeconds: number;
  key: (request: Request) => string;
}): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction) => {
    const rawKey = options.key(request);
    const bucketKey = `${options.namespace}:${sha256(rawKey || "unknown")}`;
    const result = await options.security.consumeRateLimit({bucketKey, limit: options.limit, windowSeconds: options.windowSeconds});
    setRateHeaders(response, result.remaining, result.resetAt);
    if (!result.allowed) {
      response.setHeader("Retry-After", String(Math.max(1, Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000))));
      throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please wait before trying again.");
    }
    next();
  };
}

const quotaConfig: Record<AiOperation, {daily: keyof AppConfig; monthly: keyof AppConfig; rate: keyof AppConfig}> = {
  profile_analysis: {daily: "aiDailyProfileAnalysisLimit", monthly: "aiMonthlyProfileAnalysisLimit", rate: "rateLimitProfileAnalysisMax"},
  wardrobe_analysis: {daily: "aiDailyWardrobeAnalysisLimit", monthly: "aiMonthlyWardrobeAnalysisLimit", rate: "rateLimitWardrobeAnalysisMax"},
  outfit_generation: {daily: "aiDailyOutfitGenerationLimit", monthly: "aiMonthlyOutfitGenerationLimit", rate: "rateLimitOutfitGenerationMax"},
  virtual_tryon: {daily: "aiDailyTryonLimit", monthly: "aiMonthlyTryonLimit", rate: "rateLimitTryonMax"},
};

export function createAiProtectionMiddleware(security: SecurityRepository, config: AppConfig, operation: AiOperation): RequestHandler[] {
  const limits = quotaConfig[operation];
  const perWindow = createRateLimitMiddleware({
    security,
    namespace: `ai:${operation}`,
    limit: config[limits.rate] as number,
    windowSeconds: config.rateLimitWindowSeconds,
    key: (request) => request.auth!.user.id,
  });
  const quota: RequestHandler = async (request, response, next) => {
    const idempotencyKey = request.get("idempotency-key")?.trim() || null;
    if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw new ApiError(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 8 to 128 safe characters.");
    const imageOperation = operation === "virtual_tryon";
    const reservation = await security.reserveAiUsage({
      userId: request.auth!.user.id,
      operation,
      provider: "gemini",
      model: imageOperation ? config.geminiImageModel : config.geminiModel,
      requestKey: idempotencyKey ? sha256(`${request.auth!.user.id}:${operation}:${idempotencyKey}`) : null,
      dailyLimit: config[limits.daily] as number,
      monthlyLimit: config[limits.monthly] as number,
      concurrentLimit: config.aiConcurrentRequestsPerUser,
      reservationTimeoutMinutes: config.aiReservationTimeoutMinutes,
    });
    if (reservation.reason === "duplicate") throw new ApiError(409, "DUPLICATE_AI_REQUEST", "This AI request was already submitted. Use a new Idempotency-Key for a new operation.");
    if (reservation.reason === "concurrent") throw new ApiError(429, "AI_CONCURRENCY_LIMIT", "Another AI request is already running. Please wait for it to finish.");
    if (reservation.reason) throw new ApiError(429, "AI_QUOTA_EXCEEDED", `The ${reservation.reason} quota for this operation has been reached.`);
    const startedAt = Date.now();
    let recorded = false;
    const record = () => {
      if (recorded) return;
      recorded = true;
      const wardrobeCount = Array.isArray(request.body?.wardrobeItemIds) ? request.body.wardrobeItemIds.length : 0;
      const estimatedInputUnits = operation === "profile_analysis" || operation === "wardrobe_analysis" ? 1 : operation === "virtual_tryon" ? wardrobeCount + 1 : null;
      const estimatedOutputUnits = operation === "virtual_tryon" && response.statusCode < 400 ? 1 : null;
      void security.completeAiUsage(reservation.id, {success: response.statusCode < 400, durationMs: Date.now() - startedAt, estimatedInputUnits, estimatedOutputUnits})
        .catch((error) => safeOperationalError("AI usage recording failed", error, {requestId: request.requestId, operation}));
    };
    response.once("finish", record);
    next();
  };
  return [perWindow, quota];
}
