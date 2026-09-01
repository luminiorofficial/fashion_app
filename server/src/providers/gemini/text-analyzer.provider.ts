import {ApiError} from "../../utils/api-error";
import {wait} from "../../utils/delay";
import {RETRYABLE_STATUSES, UNAVAILABLE_STATUSES, eventGuidance, wardrobeCategories, garmentVisibilityLevels} from "../../config/constants";
import {logGeminiStart, logGeminiSuccess, logGeminiFailure, type GeminiKeyLabel} from "../../utils/safe-logging";
import type {AppConfig} from "../../config/env";
import type {TextAnalysisProvider, UploadedFile} from "../../types/provider.types";
import type {WardrobeDraftAnalysis} from "../../types/wardrobe.types";
import type {ProfileAnalysisResult, FullLengthValidationResult, StyleProfile} from "../../types/profile.types";
import type {SuggestOutfitInput, OutfitSuggestion} from "../../types/outfit.types";
import type {WardrobeItem as OutfitWardrobeItem} from "../../types/wardrobe.types";

// Every field is optional: the real app always supplies a fully-populated
// AppConfig, but this provider is also constructed directly in tests with a
// deliberately partial config to exercise its own text/legacy-key and
// retry-count fallback chains (mirrored below), so the type has to allow
// that rather than force a full AppConfig shape.
export type GeminiTextConfig = Partial<Pick<AppConfig, "geminiTextApiKey" | "geminiApiKey" | "geminiTextMaxRetries" | "geminiMaxRetries" | "geminiRetryBaseDelayMs" | "geminiModel" | "geminiTextFallbackModel" | "geminiTextKeySource">>;

interface AttemptOutcome<T> {
  ok: boolean;
  result?: T;
  error?: ApiError;
}

interface JsonSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

function summarizeProfile(profile: StyleProfile | undefined): Partial<StyleProfile> | null {
  if (!profile?.bodyType && !profile?.skinTone) return null;
  const {bodyType, skinTone, skinUndertone, hairColor, facialStructure, styleAttributes, stylingNotes} = profile;
  return {bodyType, skinTone, skinUndertone, hairColor, facialStructure, styleAttributes, stylingNotes};
}

// Gemini text/JSON provider: wardrobe item analysis, style profile
// analysis, and outfit styling. All three share the same model/retry/
// fallback infrastructure (this.call/callModel/attemptModel below), which
// is why they live in one provider rather than three.
export class GeminiTextAnalyzerProvider implements TextAnalysisProvider {
  private readonly config: GeminiTextConfig;
  private readonly apiKey: string;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly keyLabel: GeminiKeyLabel;

  constructor(config: GeminiTextConfig) {
    this.config = config;
    this.apiKey = config.geminiTextApiKey || config.geminiApiKey || "";
    this.maxRetries = config.geminiTextMaxRetries ?? config.geminiMaxRetries ?? 3;
    this.retryBaseDelayMs = config.geminiRetryBaseDelayMs ?? 500;
    this.keyLabel = config.geminiTextKeySource ?? "LEGACY_FALLBACK";
  }

  async analyzeWardrobe(file: UploadedFile): Promise<WardrobeDraftAnalysis> {
    if (!this.apiKey) {
      return {
        item_name: "Wardrobe item", category: "Accessory", tags: ["pending-ai-review"], color: null, material: null, pattern: null,
        season: [], occasion: [], style: [], contains_person: false, garment_visibility: "full", virtual_tryon_eligible: true,
      };
    }
    return this.call([
      "Analyze this fashion item photo, which may show the garment alone (flat lay, hanger, mannequin, product shot) or worn by a person/model. Either is valid wardrobe input.",
      "Always identify the actual clothing item itself, not the person wearing it: return an accurate concise catalog name, one allowed category, up to six styling tags, and structured attributes for that garment.",
      `Allowed categories: ${wardrobeCategories.join(", ")}.`,
      "color is the single dominant color as a common color name (e.g. 'Black', 'Navy Blue'), or null if unclear.",
      "material is the primary fabric or material if visually identifiable (e.g. 'Cotton', 'Leather', 'Denim'), or null if unclear.",
      "pattern is the visible pattern (e.g. 'Solid', 'Striped', 'Floral', 'Plaid'), or null if unclear.",
      "season lists every season this item suits, chosen from: Spring, Summer, Autumn, Winter.",
      "occasion lists suitable occasions, chosen from: Casual, Work, Formal, Party, Wedding, Athletic.",
      "style lists up to four style descriptors, e.g. 'Minimalist', 'Bohemian', 'Classic', 'Streetwear'.",
      "contains_person is true if any part of a human body (face, hands, or a body wearing the item) is visible anywhere in the image; false if it shows only the garment/product (flat lay, hanger, mannequin, plain background).",
      `garment_visibility describes how cleanly the garment itself can be seen, chosen from: ${garmentVisibilityLevels.join(", ")}. Use 'full' when the whole garment is unobstructed (a product-only shot, or a model shot where the garment is fully visible and not overlapped by other garments, bags, or hair). Use 'partial' when most of it is visible but part is cropped, layered under/behind another item, or partly covered. Use 'occluded' when most of the garment is hidden, blurry, or covered.`,
      "virtual_tryon_eligible is true only when this exact photo could be used directly, as-is, to dress a different person in this garment for a virtual try-on composite — that requires contains_person to be false (a clean product-only photo). If a person is visible, always set this false, since the photo cannot be used directly without first isolating the garment from that person.",
    ].join("\n"), file, {
      type: "object",
      properties: {
        item_name: {type: "string"}, category: {type: "string", enum: wardrobeCategories}, tags: {type: "array", items: {type: "string"}, maxItems: 6},
        color: {type: ["string", "null"]}, material: {type: ["string", "null"]}, pattern: {type: ["string", "null"]},
        season: {type: "array", items: {type: "string"}, maxItems: 4}, occasion: {type: "array", items: {type: "string"}, maxItems: 6}, style: {type: "array", items: {type: "string"}, maxItems: 4},
        contains_person: {type: "boolean"}, garment_visibility: {type: "string", enum: garmentVisibilityLevels}, virtual_tryon_eligible: {type: "boolean"},
      },
      required: ["item_name", "category", "tags", "color", "material", "pattern", "season", "occasion", "style", "contains_person", "garment_visibility", "virtual_tryon_eligible"],
      additionalProperties: false,
    }, "wardrobe_analysis");
  }

  async validateFullLengthPhoto(file: UploadedFile): Promise<FullLengthValidationResult> {
    if (!this.apiKey) return {is_full_length: true, reasons: []};
    return this.call([
      "Validate whether this image is a clear, full-length photo of exactly one person from head to feet.",
      "Do not perform a fashion style analysis yet. Only determine if the image is suitable for a full-body profile analysis.",
      "Return only a JSON object with is_full_length as a boolean and reasons as an array of short explanations when it is not valid.",
      "Use reasons such as: face/head not visible, upper body not visible, lower body not visible, legs or feet not visible, more than one person visible, image not clear enough.",
    ].join("\n"), file, {
      type: "object",
      properties: {is_full_length: {type: "boolean"}, reasons: {type: "array", items: {type: "string"}}},
      required: ["is_full_length", "reasons"],
      additionalProperties: false,
    }, "full_length_validation");
  }

  async analyzeProfile(file: UploadedFile): Promise<ProfileAnalysisResult> {
    if (!this.apiKey) {
      return {
        body_shape: "Pending AI configuration", skin_tone: "Pending AI configuration", skin_undertone: null, hair_color: null,
        facial_structure: null, style_attributes: [], styling_notes: "Configure GEMINI_TEXT_API_KEY (or GEMINI_API_KEY) to enable visual analysis.",
      };
    }

    const validation = await this.validateFullLengthPhoto(file);
    if (!validation.is_full_length) {
      throw new ApiError(
        400,
        "FULL_LENGTH_PHOTO_REQUIRED",
        "Full-length photo required. We need a clear photo showing you from head to feet to create your style profile. Please upload another photo.",
        {reasons: validation.reasons},
      );
    }

    return this.call([
      "Analyze the visible, non-sensitive fashion styling characteristics in this full-body image.",
      "Describe body shape (not health or a weight estimate), skin-tone color harmony and undertone, visible hair color, facial structure useful for accessories, and other styling attributes.",
      "Be inclusive and factual. Do not infer ethnicity, health, disability, gender identity, or exact age/weight. Mention uncertainty when features are obscured.",
    ].join("\n"), file, {
      type: "object",
      properties: {
        body_shape: {type: "string"}, skin_tone: {type: "string"}, skin_undertone: {type: ["string", "null"]}, hair_color: {type: ["string", "null"]},
        facial_structure: {type: ["string", "null"]}, style_attributes: {type: "array", items: {type: "string"}, maxItems: 12}, styling_notes: {type: "string"},
      },
      required: ["body_shape", "skin_tone", "skin_undertone", "hair_color", "facial_structure", "style_attributes", "styling_notes"],
      additionalProperties: false,
    }, "profile_analysis");
  }

  // Picks a complete outfit using only the wardrobe items the user already
  // owns. Text-only Gemini call (no image), so it shares call()/callModel()
  // with the image-analysis methods above to reuse the same retry/fallback
  // and friendly-error behavior.
  async suggestOutfit({eventType, profile, wardrobe, affinityNotes}: SuggestOutfitInput): Promise<OutfitSuggestion> {
    if (!this.apiKey) return this.fallbackOutfit(eventType, wardrobe);

    const catalog = wardrobe.map((item: OutfitWardrobeItem) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      color: item.primaryColor || undefined,
      material: item.material || undefined,
      pattern: item.pattern || undefined,
      season: item.season?.length ? item.season : undefined,
      occasion: item.occasion?.length ? item.occasion : undefined,
      tags: item.tags?.length ? item.tags : undefined,
    }));
    const profileSummary = summarizeProfile(profile);

    const prompt = [
      `Choose a complete outfit for the event "${eventType}" using ONLY the wardrobe items listed below.`,
      eventGuidance[eventType] ? `Event guidance: ${eventGuidance[eventType]}` : "",
      "Never invent an item or id that is not in the wardrobe list. Prefer 2 to 5 complementary items that form a coherent outfit for the event.",
      profileSummary ? `User's style profile: ${JSON.stringify(profileSummary)}` : "No style profile is available yet; style conservatively.",
      affinityNotes ? `Learned preferences from the user's past reactions to outfits (higher affinity = they liked or wore similar items before, lower/negative = they disliked or rejected similar items): ${JSON.stringify(affinityNotes)}. Lean toward items with positive affinity and away from items with negative affinity when a few choices would otherwise be equally valid.` : "",
      `Wardrobe items (JSON array): ${JSON.stringify(catalog)}`,
      "Return wardrobe_item_ids as the chosen items' ids (each must exactly match an id from the wardrobe list) and a short rationale (2-3 sentences) explaining the choice for this event and profile.",
      "If one complementary piece is genuinely missing from the wardrobe and would elevate this outfit for the event (for example a bag, shoes, a belt, or jewelry), set suggested_purchase_item to a short generic item name and its category type. Do not invent a specific brand, product, or store. Only suggest a purchase when a piece is genuinely missing; otherwise set suggested_purchase_item to null.",
    ].filter(Boolean).join("\n");

    return this.call(prompt, null, {
      type: "object",
      properties: {
        wardrobe_item_ids: {type: "array", items: {type: "string"}, minItems: 1, maxItems: 6},
        rationale: {type: "string"},
        suggested_purchase_item: {
          type: ["object", "null"],
          properties: {name: {type: "string"}, type: {type: "string"}},
          required: ["name", "type"],
          additionalProperties: false,
        },
      },
      required: ["wardrobe_item_ids", "rationale", "suggested_purchase_item"],
      additionalProperties: false,
    }, "outfit_generation");
  }

  // Deterministic outfit pick used when no Gemini API key is configured,
  // mirroring the plain fallbacks used by the other analyze* methods above.
  private fallbackOutfit(eventType: string, wardrobe: OutfitWardrobeItem[]): OutfitSuggestion {
    const byCategory = (category: string) => wardrobe.find((item) => item.category === category);
    const dress = byCategory("Dress");
    const picks = dress
      ? [dress, byCategory("Shoes"), byCategory("Outerwear")]
      : [byCategory("Top"), byCategory("Bottom"), byCategory("Shoes"), byCategory("Outerwear")];
    const ids = picks.filter((item): item is OutfitWardrobeItem => Boolean(item)).map((item) => item.id);
    const missingShoes = !byCategory("Shoes");
    return {
      wardrobe_item_ids: ids.length ? ids : wardrobe.slice(0, 2).map((item) => item.id),
      rationale: `A simple ${eventType.toLowerCase()} look put together from your wardrobe. Configure GEMINI_API_KEY to enable AI-personalized styling.`,
      suggested_purchase_item: missingShoes ? {name: "Complementary shoes", type: "Shoes"} : null,
    };
  }

  // Public (rather than private) so the retry/model-fallback/friendly-error
  // behavior can be exercised directly in tests via a generic prompt/schema,
  // independent of any specific analyze* method's own no-API-key fallback.
  // `operation` is a safe, fixed label (e.g. "wardrobe_analysis") used only
  // for backend usage logging — never user/request-derived content.
  async call<T>(prompt: string, file: UploadedFile | null, schema: JsonSchema, operation: string): Promise<T> {
    const models = [this.config.geminiModel, this.config.geminiTextFallbackModel].filter(
      (model, index, all): model is string => Boolean(model) && all.indexOf(model) === index,
    );
    let lastError: ApiError | undefined;
    const startedAt = Date.now();
    const startModel = models[0] || this.config.geminiModel || "unknown";
    logGeminiStart(this.keyLabel, operation, startModel);

    for (const model of models) {
      try {
        const result = await this.callModel<T>(model, prompt, file, schema);
        logGeminiSuccess(this.keyLabel, operation, model, Date.now() - startedAt);
        return result;
      } catch (error) {
        lastError = error as ApiError;
        const canTryNextModel = RETRYABLE_STATUSES.has(lastError.status) || lastError.status === 404 || lastError.status === 400;
        if (!canTryNextModel) break;
      }
    }

    const finalError = this.friendlyError(lastError as ApiError);
    logGeminiFailure(this.keyLabel, operation, models[models.length - 1] || startModel, Date.now() - startedAt, finalError);
    throw finalError;
  }

  // Calls a single model, retrying in-place with exponential backoff on
  // 429/500/502/503/504 responses and on network/timeout failures, before
  // giving up on this model.
  private async callModel<T>(model: string, prompt: string, file: UploadedFile | null, schema: JsonSchema): Promise<T> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    for (let attempt = 0; ; attempt += 1) {
      const outcome = await this.attemptModel<T>(endpoint, prompt, file, schema);
      if (outcome.ok) return outcome.result as T;

      if (RETRYABLE_STATUSES.has((outcome.error as ApiError).status) && attempt < this.maxRetries) {
        await wait(this.retryBaseDelayMs * 2 ** attempt);
        continue;
      }
      throw outcome.error;
    }
  }

  // Makes a single request attempt. Network/timeout failures are reported
  // the same way as HTTP error responses so callModel can retry both alike.
  private async attemptModel<T>(endpoint: string, prompt: string, file: UploadedFile | null, schema: JsonSchema): Promise<AttemptOutcome<T>> {
    const parts = file ? [{text: prompt}, {inlineData: {mimeType: file.mimetype, data: file.buffer.toString("base64")}}] : [{text: prompt}];
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {"content-type": "application/json", "x-goog-api-key": this.apiKey},
        body: JSON.stringify({contents: [{parts}], generationConfig: {responseMimeType: "application/json", responseJsonSchema: schema}}),
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      return {ok: false, error: new ApiError(504, "ANALYSIS_TIMEOUT", "The analysis service timed out. Please retry.")};
    }

    if (!response.ok) {
      const parsed = await this.parseError(response);
      return {ok: false, error: new ApiError(parsed.status, parsed.code, parsed.message, parsed.details)};
    }

    const payload = await response.json() as {candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>};
    const output = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    try {
      return {ok: true, result: JSON.parse(output || "")};
    } catch {
      return {ok: false, error: new ApiError(502, "INVALID_ANALYSIS", "The analysis service returned an invalid result.")};
    }
  }

  // Hides opaque "service unavailable" failures behind a friendly message
  // once every model/retry has been exhausted. Statuses like 429 keep their
  // specific, actionable provider message (e.g. quota exceeded).
  private friendlyError(error: ApiError): ApiError {
    if (error instanceof ApiError && UNAVAILABLE_STATUSES.has(error.status)) {
      return new ApiError(503, "AI_SERVICE_UNAVAILABLE", "Our styling AI is temporarily unavailable. Please try again in a moment.", error.details);
    }
    return error;
  }

  private async parseError(response: Response): Promise<{status: number; code: string; message: string; details?: unknown}> {
    const status = response.status || 502;
    return {
      status: status === 429 ? 503 : status,
      code: status === 429 ? "AI_PROVIDER_BUSY" : "ANALYSIS_FAILED",
      message: status === 429 ? "The analysis service is temporarily busy. Please try again later." : "The analysis service could not process the request.",
    };
  }
}
