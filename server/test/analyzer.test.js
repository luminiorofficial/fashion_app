const test = require("node:test");
const assert = require("node:assert/strict");
const {FashionAnalyzer} = require("../src/analyzer");

// Keep retry backoff effectively instant in tests.
const FAST_RETRY = {geminiRetryBaseDelayMs: 0};

test("surfaces Gemini provider failures with the underlying reason after exhausting retries", async () => {
  const analyzer = new FashionAnalyzer({geminiApiKey: "test-key", geminiModel: "gemini-3.6-flash", ...FAST_RETRY});
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 429,
      async json() {
        return {error: {message: "You exceeded your current quota", status: "RESOURCE_EXHAUSTED"}};
      },
    };
  };

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
    // 1 initial attempt + 3 retries against the single (deduped) model.
    assert.equal(calls, 4);
  } finally {
    global.fetch = originalFetch;
  }
});

test("retries a network/timeout failure and succeeds once the connection recovers", async () => {
  const analyzer = new FashionAnalyzer({geminiApiKey: "test-key", geminiModel: "gemini-3.6-flash", ...FAST_RETRY});
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls < 3) throw new DOMException("The operation timed out.", "TimeoutError");
    return {
      ok: true,
      async json() {
        return {candidates: [{content: {parts: [{text: JSON.stringify({item_name: "Blazer", category: "Outerwear", tags: []})}]}}]};
      },
    };
  };

  try {
    const result = await analyzer.call("Describe the image", {mimetype: "image/jpeg", buffer: Buffer.from("abc")}, {type: "object"});
    assert.equal(result.item_name, "Blazer");
    assert.equal(calls, 3);
  } finally {
    global.fetch = originalFetch;
  }
});

test("gives up on repeated network/timeout failures after the max attempts", async () => {
  const analyzer = new FashionAnalyzer({geminiApiKey: "test-key", geminiModel: "gemini-3.6-flash", geminiMaxRetries: 2, ...FAST_RETRY});
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    throw new DOMException("The operation timed out.", "TimeoutError");
  };

  try {
    await assert.rejects(
      () => analyzer.call("Describe the image", {mimetype: "image/jpeg", buffer: Buffer.from("abc")}, {type: "object"}),
      (error) => {
        assert.equal(error.status, 503);
        assert.equal(error.code, "AI_SERVICE_UNAVAILABLE");
        assert.match(error.message, /temporarily unavailable/i);
        return true;
      },
    );
    // 1 initial attempt + 2 retries against the single (deduped) model.
    assert.equal(calls, 3);
  } finally {
    global.fetch = originalFetch;
  }
});

test("retries on a transient 503 and succeeds once Gemini recovers", async () => {
  const analyzer = new FashionAnalyzer({geminiApiKey: "test-key", geminiModel: "gemini-3.6-flash", ...FAST_RETRY});
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls < 3) {
      return {
        ok: false,
        status: 503,
        async json() {
          return {error: {message: "The model is overloaded", status: "UNAVAILABLE"}};
        },
      };
    }
    return {
      ok: true,
      async json() {
        return {candidates: [{content: {parts: [{text: JSON.stringify({item_name: "Blazer", category: "Outerwear", tags: []})}]}}]};
      },
    };
  };

  try {
    const result = await analyzer.call("Describe the image", {mimetype: "image/jpeg", buffer: Buffer.from("abc")}, {type: "object"});
    assert.equal(result.item_name, "Blazer");
    assert.equal(calls, 3);
  } finally {
    global.fetch = originalFetch;
  }
});

test("falls back to the secondary model once the primary model's retries are exhausted", async () => {
  const analyzer = new FashionAnalyzer({geminiApiKey: "test-key", geminiModel: "gemini-2.5-pro", geminiMaxRetries: 1, ...FAST_RETRY});
  const originalFetch = global.fetch;
  const modelsCalled = [];
  global.fetch = async (url) => {
    const model = url.match(/models\/([^:]+):/)[1];
    modelsCalled.push(model);
    if (model === "gemini-2.5-pro") {
      return {
        ok: false,
        status: 503,
        async json() {
          return {error: {message: "The model is overloaded", status: "UNAVAILABLE"}};
        },
      };
    }
    return {
      ok: true,
      async json() {
        return {candidates: [{content: {parts: [{text: JSON.stringify({item_name: "Blazer", category: "Outerwear", tags: []})}]}}]};
      },
    };
  };

  try {
    const result = await analyzer.call("Describe the image", {mimetype: "image/jpeg", buffer: Buffer.from("abc")}, {type: "object"});
    assert.equal(result.item_name, "Blazer");
    // 1 initial + 1 retry against the primary model, then the fallback model succeeds first try.
    assert.deepEqual(modelsCalled, ["gemini-2.5-pro", "gemini-2.5-pro", "gemini-3.6-flash"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("shows a friendly message instead of a raw 503/UNAVAILABLE once every model is exhausted", async () => {
  const analyzer = new FashionAnalyzer({geminiApiKey: "test-key", geminiModel: "gemini-2.5-pro", geminiMaxRetries: 1, ...FAST_RETRY});
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 503,
    async json() {
      return {error: {message: "UNAVAILABLE", status: "UNAVAILABLE"}};
    },
  });

  try {
    await assert.rejects(
      () => analyzer.call("Describe the image", {mimetype: "image/jpeg", buffer: Buffer.from("abc")}, {type: "object"}),
      (error) => {
        assert.equal(error.status, 503);
        assert.equal(error.code, "AI_SERVICE_UNAVAILABLE");
        assert.doesNotMatch(error.message, /UNAVAILABLE/);
        assert.match(error.message, /temporarily unavailable/i);
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("falls back to a static wardrobe item without calling Gemini when no API key is configured", async () => {
  const analyzer = new FashionAnalyzer({geminiApiKey: "", ...FAST_RETRY});
  const result = await analyzer.analyzeWardrobe({mimetype: "image/jpeg", buffer: Buffer.from("abc")});
  assert.equal(result.category, "Accessory");
  assert.deepEqual(result.season, []);
  assert.deepEqual(result.occasion, []);
  assert.deepEqual(result.style, []);
  assert.equal(result.color, null);
});

test("suggestOutfit sends a text-only prompt (no image) naming only the user's wardrobe item ids", async () => {
  const analyzer = new FashionAnalyzer({geminiApiKey: "test-key", geminiModel: "gemini-3.6-flash", ...FAST_RETRY});
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return {candidates: [{content: {parts: [{text: JSON.stringify({wardrobe_item_ids: ["item-1"], rationale: "A polished work-appropriate look."})}]}}]};
      },
    };
  };

  try {
    const wardrobe = [
      {id: "item-1", name: "Silk Blouse", category: "Top", primaryColor: "White", tags: ["silk"]},
      {id: "item-2", name: "Tailored Trouser", category: "Bottom"},
    ];
    const result = await analyzer.suggestOutfit({eventType: "Work Meeting", profile: {bodyType: "Rectangle", skinTone: "Medium"}, wardrobe});
    assert.deepEqual(result.wardrobe_item_ids, ["item-1"]);
    assert.equal(result.rationale, "A polished work-appropriate look.");

    assert.equal(requestBody.contents[0].parts.length, 1);
    assert.ok(!("inlineData" in requestBody.contents[0].parts[0]));
    assert.match(requestBody.contents[0].parts[0].text, /Work Meeting/);
    assert.match(requestBody.contents[0].parts[0].text, /item-1/);
    assert.match(requestBody.contents[0].parts[0].text, /item-2/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("suggestOutfit falls back to a deterministic pick from the wardrobe when no API key is configured", async () => {
  const analyzer = new FashionAnalyzer({geminiApiKey: "", ...FAST_RETRY});
  const wardrobe = [
    {id: "top-1", name: "Silk Blouse", category: "Top"},
    {id: "bottom-1", name: "Tailored Trouser", category: "Bottom"},
    {id: "shoes-1", name: "Loafers", category: "Shoes"},
  ];
  const result = await analyzer.suggestOutfit({eventType: "Daily", profile: {}, wardrobe});
  assert.deepEqual(new Set(result.wardrobe_item_ids), new Set(["top-1", "bottom-1", "shoes-1"]));
  assert.match(result.rationale, /daily/i);
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
