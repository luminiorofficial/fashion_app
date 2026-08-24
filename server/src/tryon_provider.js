const {ApiError} = require("./errors");

// Statuses worth retrying/falling back to the next model, mirroring
// analyzer.js's classification for the text/JSON analysis calls.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const UNAVAILABLE_STATUSES = new Set([500, 502, 503, 504]);

// The REST API expects protobuf enum names here, while the environment
// variables intentionally use the shorter, human-readable values.
const IMAGE_ASPECT_RATIO_ENUMS = {
  "1:1": "ASPECT_RATIO_ONE_BY_ONE",
  "2:3": "ASPECT_RATIO_TWO_BY_THREE",
  "3:2": "ASPECT_RATIO_THREE_BY_TWO",
  "3:4": "ASPECT_RATIO_THREE_BY_FOUR",
  "4:3": "ASPECT_RATIO_FOUR_BY_THREE",
  "4:5": "ASPECT_RATIO_FOUR_BY_FIVE",
  "9:16": "ASPECT_RATIO_NINE_BY_SIXTEEN",
  "16:9": "ASPECT_RATIO_SIXTEEN_BY_NINE",
};

const IMAGE_SIZE_ENUMS = {
  "512": "IMAGE_SIZE_FIVE_TWELVE",
  "1K": "IMAGE_SIZE_ONE_K",
  "2K": "IMAGE_SIZE_TWO_K",
  "4K": "IMAGE_SIZE_FOUR_K",
};

// Generates a photorealistic composite of a real person wearing selected
// wardrobe garments, using a multi-image-input, image-output Gemini model.
// This is a separate model family (and separate retry/fallback chain) from
// FashionAnalyzer's text/JSON calls, since the configured text model has no
// image-output capability.
class GeminiVirtualTryOnProvider {
  constructor(config) {
    this.config = config;
    this.maxRetries = config.geminiMaxRetries ?? 3;
    this.retryBaseDelayMs = config.geminiRetryBaseDelayMs ?? 500;
  }

  // profileFile/garmentFiles are multer-style {buffer, mimetype} objects.
  async generate({profileFile, garmentFiles, notes}) {
    const models = [this.config.geminiImageModel, this.config.geminiImageFallbackModel]
      .filter((model, index, all) => model && all.indexOf(model) === index);
    let lastError;

    for (const model of models) {
      try {
        return await this.callModel(model, profileFile, garmentFiles, notes);
      } catch (error) {
        lastError = error;
        const canTryNextModel = RETRYABLE_STATUSES.has(error.status) || error.status === 404 || error.status === 400;
        if (!canTryNextModel) break;
      }
    }

    throw this.friendlyError(lastError);
  }

  async callModel(model, profileFile, garmentFiles, notes) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    this.logDevelopment(`Gemini model=${model}`);

    for (let attempt = 0; ; attempt += 1) {
      const outcome = await this.attemptModel(endpoint, model, profileFile, garmentFiles, notes);
      if (outcome.ok) return outcome.result;

      if (RETRYABLE_STATUSES.has(outcome.error.status) && attempt < this.maxRetries) {
        await this.wait(this.retryBaseDelayMs * 2 ** attempt);
        continue;
      }
      throw outcome.error;
    }
  }

  async attemptModel(endpoint, model, profileFile, garmentFiles, notes) {
    const instruction = [
      "You are a virtual try-on compositor. The first image is a real person (the subject). Every image after it is a single garment or accessory from their wardrobe.",
      "Generate one photorealistic image of the SAME person wearing all of the given garments together as a single coherent outfit.",
      "Preserve the subject's face, hair, skin tone, body proportions, and pose as closely as possible — this must still clearly be the same person. Do not change their identity.",
      "Replace only the clothing implied by the garments shown (for example a top garment replaces their existing top). Keep a clean, well-lit, full-body studio-style presentation with a neutral background.",
      notes ? `Styling notes: ${notes}` : "",
    ].filter(Boolean).join("\n");

    const parts = [
      {text: instruction},
      {inlineData: {mimeType: profileFile.mimetype, data: profileFile.buffer.toString("base64")}},
      ...garmentFiles.map((file) => ({inlineData: {mimeType: file.mimetype, data: file.buffer.toString("base64")}})),
    ];

    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {"content-type": "application/json", "x-goog-api-key": this.config.geminiApiKey},
        body: JSON.stringify({
          contents: [{parts}],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
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
      this.logDevelopment(`Gemini request error: model=${model} error=${error.name || "UNKNOWN"}`);
      return {ok: false, error: new ApiError(504, "TRYON_TIMEOUT", "The try-on service timed out. Please retry.")};
    }

    if (!response.ok) {
      const parsed = await this.parseError(response);
      this.logDevelopment(`Gemini HTTP error: model=${model} status=${response.status} code=${parsed.code} error=${JSON.stringify(parsed.message)}`);
      return {ok: false, error: new ApiError(parsed.status, parsed.code, parsed.message, parsed.details)};
    }
    this.logDevelopment(`Gemini HTTP status: model=${model} status=${response.status}`);

    const payload = await response.json();
    const responseParts = payload.candidates?.[0]?.content?.parts || [];
    // The model may also return a text part (e.g. a caption); the image is
    // whichever part actually carries inlineData, not necessarily parts[0].
    const imagePart = responseParts.find((part) => part.inlineData?.data);
    if (!imagePart) {
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

  wait(ms) {
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  }

  logDevelopment(message) {
    if (this.config.env === "development") console.info(`[NERA try-on] ${message}`);
  }

  friendlyError(error) {
    if (error instanceof ApiError && UNAVAILABLE_STATUSES.has(error.status)) {
      return new ApiError(503, "TRYON_SERVICE_UNAVAILABLE", "Our virtual try-on service is temporarily unavailable. Please try again in a moment.", error.details);
    }
    return error;
  }

  async parseError(response) {
    let payload;
    try { payload = await response.json(); } catch (_) { payload = null; }
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
// profile image would make clients present an unchanged photo as a successful
// virtual try-on.
class UnavailableVirtualTryOnProvider {
  async generate() {
    throw new ApiError(
      503,
      "TRYON_SERVICE_UNAVAILABLE",
      "Our virtual try-on service is unavailable because it is not configured.",
    );
  }
}

module.exports = {GeminiVirtualTryOnProvider, UnavailableVirtualTryOnProvider};
