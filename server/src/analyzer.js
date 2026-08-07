const {ApiError} = require("./errors");
const {wardrobeCategories: categories} = require("./validation");

class FashionAnalyzer {
  constructor(config) { this.config = config; }

  async analyzeWardrobe(file) {
    if (!this.config.geminiApiKey) return {item_name: "Wardrobe item", category: "Accessory", tags: ["pending-ai-review"]};
    return this.call([
      "Analyze this single fashion item. Return an accurate concise catalog name, one allowed category, and up to six styling tags.",
      `Allowed categories: ${categories.join(", ")}.`,
    ].join("\n"), file, {
      type: "object", properties: {item_name: {type: "string"}, category: {type: "string", enum: categories}, tags: {type: "array", items: {type: "string"}, maxItems: 6}}, required: ["item_name", "category", "tags"], additionalProperties: false,
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

  async call(prompt, file, schema) {
    const models = [this.config.geminiModel, "gemini-3.6-flash"].filter((model, index, all) => model && all.indexOf(model) === index);
    let lastError;

    for (const model of models) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      let response;
      try {
        response = await fetch(endpoint, {method: "POST", headers: {"content-type": "application/json", "x-goog-api-key": this.config.geminiApiKey}, body: JSON.stringify({contents: [{parts: [{text: prompt}, {inlineData: {mimeType: file.mimetype, data: file.buffer.toString("base64")}}]}], generationConfig: {responseMimeType: "application/json", responseJsonSchema: schema}}), signal: AbortSignal.timeout(45_000)});
      } catch (_) { throw new ApiError(504, "ANALYSIS_TIMEOUT", "The analysis service timed out. Please retry."); }

      if (response.ok) {
        const payload = await response.json();
        const output = payload.candidates?.[0]?.content?.parts?.[0]?.text;
        try { return JSON.parse(output); } catch (_) { throw new ApiError(502, "INVALID_ANALYSIS", "The analysis service returned an invalid result."); }
      }

      lastError = await this.parseError(response);
      if (response.status !== 404 && response.status !== 400) break;
    }

    throw new ApiError(lastError.status, lastError.code, lastError.message, lastError.details);
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
