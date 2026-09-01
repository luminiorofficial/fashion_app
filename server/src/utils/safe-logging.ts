export function safeOperationalError(label: string, error: unknown, context: Record<string, string | number | boolean | null | undefined> = {}): void {
  const candidate = error as {name?: unknown; code?: unknown; status?: unknown};
  console.error(label, {
    ...context,
    errorName: typeof candidate?.name === "string" ? candidate.name.slice(0, 80) : "Error",
    errorCode: typeof candidate?.code === "string" || typeof candidate?.code === "number" ? String(candidate.code).slice(0, 80) : undefined,
    status: typeof candidate?.status === "number" ? candidate.status : undefined,
  });
}

// Which Gemini API key a call used, safe to print (never the key itself).
// TEXT/IMAGE mean the split GEMINI_TEXT_API_KEY/GEMINI_IMAGE_API_KEY was
// set; LEGACY_FALLBACK means that split key was missing and the call fell
// back to the shared GEMINI_API_KEY.
export type GeminiKeyLabel = "TEXT" | "IMAGE" | "LEGACY_FALLBACK";

// Reduces a caught error down to a short, safe-to-print reason: an ApiError
// code (already a generic, non-sensitive string like "ANALYSIS_TIMEOUT" or
// "AI_PROVIDER_BUSY"), falling back to the error's name. Never touches
// error.message/details, which could echo provider response text.
function describeGeminiFailure(error: unknown): string {
  const candidate = error as {code?: unknown; name?: unknown};
  if (typeof candidate?.code === "string" && candidate.code) return candidate.code.slice(0, 60);
  if (typeof candidate?.name === "string" && candidate.name) return candidate.name.slice(0, 60);
  return "UNKNOWN_ERROR";
}

// Backend-only Gemini usage logging: one line per call lifecycle stage, so
// local console output and Vercel Runtime Logs show which key type and
// model handled every Gemini request without ever printing the key value,
// prompts, images, or other request/response content.
export function logGeminiStart(keyLabel: GeminiKeyLabel, operation: string, model: string): void {
  console.info(`[Gemini] ${keyLabel} | ${operation} | ${model} | started`);
}

export function logGeminiSuccess(keyLabel: GeminiKeyLabel, operation: string, model: string, durationMs: number): void {
  console.info(`[Gemini] ${keyLabel} | ${operation} | ${model} | success | ${durationMs}ms`);
}

export function logGeminiFailure(keyLabel: GeminiKeyLabel, operation: string, model: string, durationMs: number, error: unknown): void {
  console.error(`[Gemini] ${keyLabel} | ${operation} | ${model} | failed | ${durationMs}ms | ${describeGeminiFailure(error)}`);
}
