const {ApiError} = require("./errors");

const categories = ["Top", "Bottom", "Outerwear", "Shoes", "Accessory", "Dress"];

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

  async analyzeProfile(file) {
    if (!this.config.geminiApiKey) return {body_shape: "Pending AI configuration", skin_tone: "Pending AI configuration", skin_undertone: null, hair_color: null, facial_structure: null, style_attributes: [], styling_notes: "Configure GEMINI_API_KEY to enable visual analysis."};
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
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.geminiModel}:generateContent`;
    let response;
    try {
      response = await fetch(endpoint, {method: "POST", headers: {"content-type": "application/json", "x-goog-api-key": this.config.geminiApiKey}, body: JSON.stringify({contents: [{parts: [{text: prompt}, {inlineData: {mimeType: file.mimetype, data: file.buffer.toString("base64")}}]}], generationConfig: {responseMimeType: "application/json", responseJsonSchema: schema}}), signal: AbortSignal.timeout(45_000)});
    } catch (_) { throw new ApiError(504, "ANALYSIS_TIMEOUT", "The analysis service timed out. Please retry."); }
    if (!response.ok) throw new ApiError(502, "ANALYSIS_FAILED", "The analysis service could not process the image.");
    const payload = await response.json();
    const output = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    try { return JSON.parse(output); } catch (_) { throw new ApiError(502, "INVALID_ANALYSIS", "The analysis service returned an invalid result."); }
  }
}

module.exports = {FashionAnalyzer, categories};
