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
