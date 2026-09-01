import sharp from "sharp";
import {ApiError} from "../../utils/api-error";
import {wait} from "../../utils/delay";
import {RETRYABLE_STATUSES, UNAVAILABLE_STATUSES, IMAGE_ASPECT_RATIO_ENUMS, IMAGE_SIZE_ENUMS} from "../../config/constants";
import type {AppConfig} from "../../config/env";
import type {TryOnProvider, ReadableAsset} from "../../types/provider.types";
import type {TryOnGenerateInput, TryOnGenerationResult} from "../../types/tryon.types";

// Every field is optional: the real app always supplies a fully-populated
// AppConfig, but this provider is also constructed directly in tests with a
// deliberately partial config to exercise its own retry/fallback behavior
// in isolation, so the type has to allow that.
export type GeminiImageConfig = Partial<
  Pick<
    AppConfig,
    | "geminiImageApiKey"
    | "geminiApiKey"
    | "geminiImageMaxRetries"
    | "geminiMaxRetries"
    | "geminiRetryBaseDelayMs"
    | "geminiImageMaxInputPx"
    | "geminiImageHighQualityMode"
    | "geminiImageProModel"
    | "geminiImageModel"
    | "geminiImageFallbackModel"
    | "geminiImageAspectRatio"
    | "geminiImageSize"
    | "geminiImageTimeoutMs"
    | "env"
  >
>;

interface AttemptOutcome {
  ok: boolean;
  result?: TryOnGenerationResult;
  error?: ApiError;
}

// Generates a photorealistic composite of a real person wearing selected
// wardrobe garments, using a multi-image-input, image-output Gemini model.
// This is a separate model family (and separate retry/fallback chain) from
// GeminiTextAnalyzerProvider's text/JSON calls, since the configured text
// model has no image-output capability.
export class GeminiVirtualTryOnProvider implements TryOnProvider {
  private readonly config: GeminiImageConfig;
  private readonly apiKey: string;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly maxInputDimension: number;

  constructor(config: GeminiImageConfig) {
    this.config = config;
    this.apiKey = config.geminiImageApiKey || config.geminiApiKey || "";
    this.maxRetries = config.geminiImageMaxRetries ?? config.geminiMaxRetries ?? 1;
    this.retryBaseDelayMs = config.geminiRetryBaseDelayMs ?? 500;
    this.maxInputDimension = config.geminiImageMaxInputPx || 1024;
  }

  async generate({profileFile, garmentFiles, notes}: TryOnGenerateInput): Promise<TryOnGenerationResult> {
    // Shrink inputs once up front (not per retry/model attempt) to cut the
    // paid model's input image size/token cost; the larger originals stay
    // in Cloudinary for display and are untouched by this.
    const [shrunkProfile, shrunkGarments] = await Promise.all([
      this.shrinkForModel(profileFile),
      Promise.all(garmentFiles.map((file) => this.shrinkForModel(file))),
    ]);

    // High-quality mode is an explicit opt-in (never reached by a normal
    // request's failure path) that swaps in the pricier pro model instead
    // of the default flash-lite/flash chain.
    const models = (this.config.geminiImageHighQualityMode
      ? [this.config.geminiImageProModel]
      : [this.config.geminiImageModel, this.config.geminiImageFallbackModel]
    ).filter((model, index, all) => model && all.indexOf(model) === index);
    let lastError: ApiError | undefined;

    for (const model of models) {
      try {
        return await this.callModel(model, shrunkProfile, shrunkGarments, notes);
      } catch (error) {
        lastError = error as ApiError;
        const canTryNextModel = RETRYABLE_STATUSES.has(lastError.status) || lastError.status === 404 || lastError.status === 400;
        if (!canTryNextModel) break;
      }
    }

    throw this.friendlyError(lastError as ApiError);
  }

  // Downscales an already-stored (up to ~1800px) image to a smaller longest
  // side before it is sent to the paid image model. Falls back to the
  // original bytes if the buffer can't be decoded as an image, so a decode
  // failure here never blocks generation.
  private async shrinkForModel(file: ReadableAsset): Promise<ReadableAsset> {
    try {
      const image = sharp(file.buffer).rotate();
      const metadata = await image.metadata();
      const longestSide = Math.max(metadata.width || 0, metadata.height || 0);
      if (longestSide <= this.maxInputDimension) return file;
      const scale = this.maxInputDimension / longestSide;
      const buffer = await image
        .resize({
          width: Math.max(1, Math.round((metadata.width || this.maxInputDimension) * scale)),
          height: Math.max(1, Math.round((metadata.height || this.maxInputDimension) * scale)),
          fit: "inside",
        })
        .jpeg({quality: 80})
        .toBuffer();
      return {...file, buffer, mimetype: "image/jpeg"};
    } catch {
      return file;
    }
  }

  private async callModel(model: string, profileFile: ReadableAsset, garmentFiles: ReadableAsset[], notes: string): Promise<TryOnGenerationResult> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    this.logDevelopment(`Gemini model=${model}`);

    for (let attempt = 0; ; attempt += 1) {
      const outcome = await this.attemptModel(endpoint, model, profileFile, garmentFiles, notes);
      if (outcome.ok) return outcome.result as TryOnGenerationResult;

      if (RETRYABLE_STATUSES.has((outcome.error as ApiError).status) && attempt < this.maxRetries) {
        await wait(this.retryBaseDelayMs * 2 ** attempt);
        continue;
      }
      throw outcome.error;
    }
  }

  private async attemptModel(endpoint: string, model: string, profileFile: ReadableAsset, garmentFiles: ReadableAsset[], notes: string): Promise<AttemptOutcome> {
    const instruction = [
      "You are a virtual try-on compositor.",
      "IMAGE 1 IS THE IDENTITY ANCHOR: the real person whose exact likeness must be kept. Every image after Image 1 is a GARMENT REFERENCE ONLY, showing clothing/accessories to render on that person — never a person to copy identity, body, or pose from, even if a person happens to be visible in it.",
      "Generate one photorealistic image of the EXACT SAME person from Image 1 wearing the garment(s) shown in the reference images, combined into one coherent outfit.",
      "Preserve, unchanged from Image 1: face and facial structure, eyes, nose, lips, jaw, eyebrows, hairstyle and hair color, skin tone, body shape and proportions, pose, and facial expression.",
      "Do not beautify, retouch, smooth skin, change apparent age, or alter makeup. Do not substitute the face, body, skin tone, hair, or pose of any person shown in a garment reference image — those images are for clothing only.",
      "Only change the person's clothing/accessories to match the garment references; replace only the implied clothing (e.g. a top garment replaces their existing top). Clean, well-lit, full-body studio look, neutral background.",
      notes ? `Styling notes: ${notes}` : "",
    ].filter(Boolean).join("\n");

    const parts = [
      {text: instruction},
      {inlineData: {mimeType: profileFile.mimetype, data: profileFile.buffer.toString("base64")}},
      ...garmentFiles.map((file) => ({inlineData: {mimeType: file.mimetype, data: file.buffer.toString("base64")}})),
    ];

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {"content-type": "application/json", "x-goog-api-key": this.apiKey},
        body: JSON.stringify({
          contents: [{parts}],
          generationConfig: {
            // IMAGE only (not TEXT + IMAGE): a text caption isn't used, and
            // dropping it reduces the paid model's output cost/latency.
            responseModalities: ["IMAGE"],
            responseFormat: {
              image: {
                aspectRatio: IMAGE_ASPECT_RATIO_ENUMS[this.config.geminiImageAspectRatio],
                imageSize: IMAGE_SIZE_ENUMS[this.config.geminiImageSize],
              },
            },
          },
        }),
        signal: AbortSignal.timeout(this.config.geminiImageTimeoutMs ?? 120_000),
      });
    } catch (error) {
      this.logDevelopment(`Gemini request error: model=${model} error=${(error as Error).name || "UNKNOWN"}`);
      return {ok: false, error: new ApiError(504, "TRYON_TIMEOUT", "The try-on service timed out. Please retry.")};
    }

    if (!response.ok) {
      const parsed = await this.parseError(response);
      this.logDevelopment(`Gemini HTTP error: model=${model} status=${response.status} code=${parsed.code} error=${JSON.stringify(parsed.message)}`);
      return {ok: false, error: new ApiError(parsed.status, parsed.code, parsed.message, parsed.details)};
    }
    this.logDevelopment(`Gemini HTTP status: model=${model} status=${response.status}`);

    const payload = await response.json();
    const responseParts: Array<{inlineData?: {data?: string; mimeType?: string}}> = payload.candidates?.[0]?.content?.parts || [];
    // The model may also return a text part (e.g. a caption); the image is
    // whichever part actually carries inlineData, not necessarily parts[0].
    const imagePart = responseParts.find((part) => part.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      return {ok: false, error: new ApiError(502, "INVALID_TRYON_RESULT", "The try-on service did not return an image.")};
    }
    return {
      ok: true,
      result: {
        buffer: Buffer.from(imagePart.inlineData.data, "base64"),
        mimeType: imagePart.inlineData.mimeType || "image/png",
      },
    };
  }

  private logDevelopment(message: string): void {
    if (this.config.env === "development") console.info(`[NERA try-on] ${message}`);
  }

  private friendlyError(error: ApiError): ApiError {
    if (error instanceof ApiError && UNAVAILABLE_STATUSES.has(error.status)) {
      return new ApiError(503, "TRYON_SERVICE_UNAVAILABLE", "Our virtual try-on service is temporarily unavailable. Please try again in a moment.", error.details);
    }
    return error;
  }

  private async parseError(response: Response): Promise<{status: number; code: string; message: string; details?: unknown}> {
    let payload: {error?: {status?: string; message?: string; details?: unknown}} | null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const error = payload?.error;
    return {
      status: response.status || 502,
      code: error?.status || "TRYON_FAILED",
      message: error?.message || "The try-on service could not process the images.",
      details: error?.details,
    };
  }
}

// A missing image-generation provider must be a real error. Echoing the
// profile image would make clients present an unchanged photo as a
// successful virtual try-on.
export class UnavailableVirtualTryOnProvider implements TryOnProvider {
  async generate(): Promise<TryOnGenerationResult> {
    throw new ApiError(503, "TRYON_SERVICE_UNAVAILABLE", "Our virtual try-on service is unavailable because it is not configured.");
  }
}
