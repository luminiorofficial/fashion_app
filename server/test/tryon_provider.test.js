const test = require("node:test");
const assert = require("node:assert/strict");
const {GeminiVirtualTryOnProvider, UnavailableVirtualTryOnProvider} = require("../src/tryon_provider");

const FAST_RETRY = {geminiRetryBaseDelayMs: 0};
const profileFile = {mimetype: "image/jpeg", buffer: Buffer.from("profile-bytes")};
const garmentFiles = [{mimetype: "image/jpeg", buffer: Buffer.from("garment-bytes")}];

test("requests IMAGE output and sends the profile photo followed by each garment", async () => {
  const provider = new GeminiVirtualTryOnProvider({geminiApiKey: "test-key", geminiImageModel: "gemini-3-pro-image", geminiImageFallbackModel: "gemini-3.1-flash-image", geminiImageSize: "1K", geminiImageAspectRatio: "3:4", ...FAST_RETRY});
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return {candidates: [{content: {parts: [{text: "here you go"}, {inlineData: {mimeType: "image/png", data: Buffer.from("generated-image").toString("base64")}}]}}]};
      },
    };
  };

  try {
    const result = await provider.generate({profileFile, garmentFiles, notes: "Top: Silk Blouse"});
    assert.equal(result.mimeType, "image/png");
    assert.equal(result.buffer.toString(), "generated-image");
    assert.ok(!result.developmentFallback);

    assert.deepEqual(requestBody.generationConfig.responseModalities, ["TEXT", "IMAGE"]);
    assert.equal(requestBody.generationConfig.imageConfig.aspectRatio, "3:4");
    const parts = requestBody.contents[0].parts;
    assert.equal(parts.length, 3);
    assert.match(parts[0].text, /Styling notes: Top: Silk Blouse/);
    assert.equal(parts[1].inlineData.data, profileFile.buffer.toString("base64"));
    assert.equal(parts[2].inlineData.data, garmentFiles[0].buffer.toString("base64"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("falls back to the secondary image model once the primary model's retries are exhausted", async () => {
  const provider = new GeminiVirtualTryOnProvider({geminiApiKey: "test-key", geminiImageModel: "gemini-3-pro-image", geminiImageFallbackModel: "gemini-3.1-flash-image", geminiMaxRetries: 1, ...FAST_RETRY});
  const originalFetch = global.fetch;
  const modelsCalled = [];
  global.fetch = async (url) => {
    const model = url.match(/models\/([^:]+):/)[1];
    modelsCalled.push(model);
    if (model === "gemini-3-pro-image") {
      return {ok: false, status: 503, async json() { return {error: {message: "overloaded", status: "UNAVAILABLE"}}; }};
    }
    return {ok: true, async json() { return {candidates: [{content: {parts: [{inlineData: {mimeType: "image/png", data: "aGk="}}]}}]}; }};
  };

  try {
    const result = await provider.generate({profileFile, garmentFiles});
    assert.equal(result.mimeType, "image/png");
    assert.deepEqual(modelsCalled, ["gemini-3-pro-image", "gemini-3-pro-image", "gemini-3.1-flash-image"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("surfaces a friendly error once every model is exhausted", async () => {
  const provider = new GeminiVirtualTryOnProvider({geminiApiKey: "test-key", geminiImageModel: "gemini-3-pro-image", geminiImageFallbackModel: "gemini-3.1-flash-image", geminiMaxRetries: 0, ...FAST_RETRY});
  const originalFetch = global.fetch;
  global.fetch = async () => ({ok: false, status: 503, async json() { return {error: {message: "UNAVAILABLE", status: "UNAVAILABLE"}}; }});

  try {
    await assert.rejects(
      () => provider.generate({profileFile, garmentFiles}),
      (error) => {
        assert.equal(error.status, 503);
        assert.equal(error.code, "TRYON_SERVICE_UNAVAILABLE");
        assert.match(error.message, /temporarily unavailable/i);
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("rejects a response that carries no image part, surfaced as the generic unavailable error once both models are exhausted", async () => {
  // A missing image part is classified as a retryable/fallback-worthy 502,
  // like analyzer.js's own UNAVAILABLE_STATUSES handling, so the final error
  // is the friendly "service unavailable" message rather than the raw
  // INVALID_TRYON_RESULT code once every model has been tried.
  const provider = new GeminiVirtualTryOnProvider({geminiApiKey: "test-key", geminiImageModel: "gemini-3-pro-image", geminiImageFallbackModel: "gemini-3.1-flash-image", geminiMaxRetries: 0, ...FAST_RETRY});
  const originalFetch = global.fetch;
  global.fetch = async () => ({ok: true, async json() { return {candidates: [{content: {parts: [{text: "sorry, no image"}]}}]}; }});

  try {
    await assert.rejects(
      () => provider.generate({profileFile, garmentFiles}),
      (error) => {
        assert.equal(error.status, 503);
        assert.equal(error.code, "TRYON_SERVICE_UNAVAILABLE");
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("the unavailable provider returns a real service error", async () => {
  const provider = new UnavailableVirtualTryOnProvider();
  await assert.rejects(
    () => provider.generate({profileFile, garmentFiles}),
    (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.code, "TRYON_SERVICE_UNAVAILABLE");
      return true;
    },
  );
});
