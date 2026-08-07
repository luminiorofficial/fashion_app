const test = require("node:test");
const assert = require("node:assert/strict");
const {FashionAnalyzer} = require("../src/analyzer");

test("surfaces Gemini provider failures with the underlying reason", async () => {
  const analyzer = new FashionAnalyzer({geminiApiKey: "test-key", geminiModel: "gemini-3.6-flash"});
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 429,
    async json() {
      return {error: {message: "You exceeded your current quota", status: "RESOURCE_EXHAUSTED"}};
    },
  });

  try {
    await assert.rejects(
      () => analyzer.call("Describe the image", {mimetype: "image/jpeg", buffer: Buffer.from("abc")}, {type: "object"}),
      (error) => {
        assert.equal(error.status, 429);
        assert.equal(error.code, "RESOURCE_EXHAUSTED");
        assert.match(error.message, /quota/i);
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("rejects profile analysis when the image is not a full-length photo", async () => {
  const analyzer = new FashionAnalyzer({geminiApiKey: "test-key", geminiModel: "gemini-3.6-flash"});
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {candidates: [{content: {parts: [{text: JSON.stringify({is_full_length: false, reasons: ["upper body not visible", "legs not visible"]})}]}}]};
    },
  });

  try {
    await assert.rejects(
      () => analyzer.analyzeProfile({mimetype: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff])}),
      (error) => {
        assert.equal(error.status, 400);
        assert.equal(error.code, "FULL_LENGTH_PHOTO_REQUIRED");
        assert.match(error.message, /Full-length photo required/i);
        assert.deepEqual(error.details, {reasons: ["upper body not visible", "legs not visible"]});
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});
