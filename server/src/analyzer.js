const {ApiError} = require("./errors");
const {wardrobeCategories: categories} = require("./validation");

// Statuses worth retrying: rate limiting (429) and transient server-side
// failures (500/502/503/504) from Gemini.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
// Subset that reads as "the AI service itself is down" rather than a
// specific, actionable condition (e.g. quota) — these get a friendly
// message instead of the raw provider error once every model is exhausted.
const UNAVAILABLE_STATUSES = new Set([500, 502, 503, 504]);

const eventGuidance = {
  Office: "Polished, professional, and conservative for a business setting.",
  Meeting: "Sharp and put-together, slightly more formal than a normal office day.",
  Casual: "Everyday comfort suitable for running errands or a relaxed day out.",
  Date: "Attractive and confident, thoughtfully put-together without being overdressed.",
  Party: "Fun, expressive, and a little bold — statement pieces are welcome.",
  Wedding: "Elevated, formal attire appropriate for a wedding guest.",
  Travel: "Comfortable, easy to move in, and low-maintenance for a full day of travel.",
  Dinner: "Refined evening wear appropriate for a nice restaurant.",
  Other: "A versatile, well-balanced look appropriate for a general occasion.",
};

function summarizeProfile(profile) {
  if (!profile?.bodyType && !profile?.skinTone) return null;
  const {bodyType, skinTone, skinUndertone, hairColor, facialStructure, styleAttributes, stylingNotes} = profile;
  return {bodyType, skinTone, skinUndertone, hairColor, facialStructure, styleAttributes, stylingNotes};
}

class FashionAnalyzer {
  constructor(config) {
    this.config = config;
    this.maxRetries = config.geminiMaxRetries ?? 3;
    this.retryBaseDelayMs = config.geminiRetryBaseDelayMs ?? 500;
  }

  async analyzeWardrobe(file) {
    if (!this.config.geminiApiKey) return {item_name: "Wardrobe item", category: "Accessory", tags: ["pending-ai-review"], color: null, material: null, pattern: null, season: [], occasion: [], style: []};
    return this.call([
      "Analyze this single fashion item. Return an accurate concise catalog name, one allowed category, up to six styling tags, and structured attributes.",
      `Allowed categories: ${categories.join(", ")}.`,
      "color is the single dominant color as a common color name (e.g. 'Black', 'Navy Blue'), or null if unclear.",
      "material is the primary fabric or material if visually identifiable (e.g. 'Cotton', 'Leather', 'Denim'), or null if unclear.",
      "pattern is the visible pattern (e.g. 'Solid', 'Striped', 'Floral', 'Plaid'), or null if unclear.",
      "season lists every season this item suits, chosen from: Spring, Summer, Autumn, Winter.",
      "occasion lists suitable occasions, chosen from: Casual, Work, Formal, Party, Wedding, Athletic.",
      "style lists up to four style descriptors, e.g. 'Minimalist', 'Bohemian', 'Classic', 'Streetwear'.",
    ].join("\n"), file, {
      type: "object", properties: {
        item_name: {type: "string"}, category: {type: "string", enum: categories}, tags: {type: "array", items: {type: "string"}, maxItems: 6},
        color: {type: ["string", "null"]}, material: {type: ["string", "null"]}, pattern: {type: ["string", "null"]},
        season: {type: "array", items: {type: "string"}, maxItems: 4}, occasion: {type: "array", items: {type: "string"}, maxItems: 6}, style: {type: "array", items: {type: "string"}, maxItems: 4},
      }, required: ["item_name", "category", "tags", "color", "material", "pattern", "season", "occasion", "style"], additionalProperties: false,
    });
  }

  async validateFullLengthPhoto(file) {
    if (!this.config.geminiApiKey) return {is_full_length: true, reasons: []};
    return this.call([
      "Validate whether this image is a clear, full-length photo of exactly one person from head to feet.",
      "Do not perform a fashion style analysis yet. Only determine if the image is suitable for a full-body profile analysis.",
      "Return only a JSON object with is_full_length as a boolean and reasons as an array of short explanations when it is not valid.",
      "Use reasons such as: face/head not visible, upper body not visible, lower body not visible, legs or feet not visible, more than one person visible, image not clear enough.",
    ].join("\n"), file, {
      type: "object",
      properties: {
        is_full_length: {type: "boolean"},
        reasons: {type: "array", items: {type: "string"}},
      },
      required: ["is_full_length", "reasons"],
      additionalProperties: false,
    });
  }

  async analyzeProfile(file) {
    if (!this.config.geminiApiKey) return {body_shape: "Pending AI configuration", skin_tone: "Pending AI configuration", skin_undertone: null, hair_color: null, facial_structure: null, style_attributes: [], styling_notes: "Configure GEMINI_API_KEY to enable visual analysis."};

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
      type: "object", properties: {
        body_shape: {type: "string"}, skin_tone: {type: "string"}, skin_undertone: {type: ["string", "null"]}, hair_color: {type: ["string", "null"]}, facial_structure: {type: ["string", "null"]}, style_attributes: {type: "array", items: {type: "string"}, maxItems: 12}, styling_notes: {type: "string"},
      }, required: ["body_shape", "skin_tone", "skin_undertone", "hair_color", "facial_structure", "style_attributes", "styling_notes"], additionalProperties: false,
    });
  }

  // Picks a complete outfit using only the wardrobe items the user already
  // owns. Text-only Gemini call (no image), so it shares call()/callModel()
  // with the image-analysis methods to reuse the same retry/fallback and
  // friendly-error behavior.
  async suggestOutfit({eventType, profile, wardrobe, affinityNotes}) {
    if (!this.config.geminiApiKey) return this.fallbackOutfit(eventType, wardrobe);

    const catalog = wardrobe.map((item) => ({
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
          properties: {
            name: {type: "string"},
            type: {type: "string"},
          },
          required: ["name", "type"],
          additionalProperties: false,
        },
      },
      required: ["wardrobe_item_ids", "rationale", "suggested_purchase_item"], additionalProperties: false,
    });
  }

  // Deterministic outfit pick used when GEMINI_API_KEY is unset, mirroring
  // the plain fallbacks used by the other analyze* methods above.
  fallbackOutfit(eventType, wardrobe) {
    const byCategory = (category) => wardrobe.find((item) => item.category === category);
    const dress = byCategory("Dress");
    const picks = dress
      ? [dress, byCategory("Shoes"), byCategory("Outerwear")]
      : [byCategory("Top"), byCategory("Bottom"), byCategory("Shoes"), byCategory("Outerwear")];
    const ids = picks.filter(Boolean).map((item) => item.id);
    const missingShoes = !byCategory("Shoes");
    return {
      wardrobe_item_ids: ids.length ? ids : wardrobe.slice(0, 2).map((item) => item.id),
      rationale: `A simple ${eventType.toLowerCase()} look put together from your wardrobe. Configure GEMINI_API_KEY to enable AI-personalized styling.`,
      suggested_purchase_item: missingShoes ? {name: "Complementary shoes", type: "Shoes"} : null,
    };
  }

  async call(prompt, file, schema) {
    const models = [this.config.geminiModel, "gemini-3.6-flash"].filter((model, index, all) => model && all.indexOf(model) === index);
    let lastError;

    for (const model of models) {
      try {
        return await this.callModel(model, prompt, file, schema);
      } catch (error) {
        lastError = error;
        const canTryNextModel = RETRYABLE_STATUSES.has(error.status) || error.status === 404 || error.status === 400;
        if (!canTryNextModel) break;
      }
    }

    throw this.friendlyError(lastError);
  }

  // Calls a single model, retrying in-place with exponential backoff on
  // 429/500/502/503/504 responses and on network/timeout failures, before
  // giving up on this model.
  async callModel(model, prompt, file, schema) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    for (let attempt = 0; ; attempt += 1) {
      const outcome = await this.attemptModel(endpoint, prompt, file, schema);
      if (outcome.ok) return outcome.result;

      if (RETRYABLE_STATUSES.has(outcome.error.status) && attempt < this.maxRetries) {
        await this.wait(this.retryBaseDelayMs * 2 ** attempt);
        continue;
      }
      throw outcome.error;
    }
  }

  // Makes a single request attempt. Network/timeout failures are reported
  // the same way as HTTP error responses so callModel can retry both alike.
  async attemptModel(endpoint, prompt, file, schema) {
    const parts = file ? [{text: prompt}, {inlineData: {mimeType: file.mimetype, data: file.buffer.toString("base64")}}] : [{text: prompt}];
    let response;
    try {
      response = await fetch(endpoint, {method: "POST", headers: {"content-type": "application/json", "x-goog-api-key": this.config.geminiApiKey}, body: JSON.stringify({contents: [{parts}], generationConfig: {responseMimeType: "application/json", responseJsonSchema: schema}}), signal: AbortSignal.timeout(45_000)});
    } catch (_) {
      return {ok: false, error: new ApiError(504, "ANALYSIS_TIMEOUT", "The analysis service timed out. Please retry.")};
    }

    if (!response.ok) {
      const parsed = await this.parseError(response);
      return {ok: false, error: new ApiError(parsed.status, parsed.code, parsed.message, parsed.details)};
    }

    const payload = await response.json();
    const output = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    try {
      return {ok: true, result: JSON.parse(output)};
    } catch (_) {
      return {ok: false, error: new ApiError(502, "INVALID_ANALYSIS", "The analysis service returned an invalid result.")};
    }
  }

  wait(ms) {
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  }

  // Hides opaque "service unavailable" failures behind a friendly message
  // once every model/retry has been exhausted. Statuses like 429 keep their
  // specific, actionable provider message (e.g. quota exceeded).
  friendlyError(error) {
    if (error instanceof ApiError && UNAVAILABLE_STATUSES.has(error.status)) {
      return new ApiError(503, "AI_SERVICE_UNAVAILABLE", "Our styling AI is temporarily unavailable. Please try again in a moment.", error.details);
    }
    return error;
  }

  async parseError(response) {
    let payload;
    try { payload = await response.json(); } catch (_) { payload = null; }
    const error = payload?.error;
    return {
      status: response.status || 502,
      code: error?.status || "ANALYSIS_FAILED",
      message: error?.message || "The analysis service could not process the image.",
      details: error?.details,
    };
  }
}

module.exports = {FashionAnalyzer, categories};
