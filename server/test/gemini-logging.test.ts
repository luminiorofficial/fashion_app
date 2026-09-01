import test from "node:test";
import assert from "node:assert/strict";
import {GeminiTextAnalyzerProvider} from "../src/providers/gemini/text-analyzer.provider";
import {GeminiVirtualTryOnProvider} from "../src/providers/gemini/image-tryon.provider";

const FAST_RETRY = {geminiRetryBaseDelayMs: 0};

// Captures console.info/console.error lines during a callback, without ever
// letting a failing assertion leave the real console patched.
async function captureConsole(run: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (...args: unknown[]) => {lines.push(args.map(String).join(" "));};
  console.error = (...args: unknown[]) => {lines.push(args.map(String).join(" "));};
  try {
    await run();
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }
  return lines;
}

test("logs TEXT key label, operation, model, and duration for a successful wardrobe analysis call", async () => {
  const analyzer = new GeminiTextAnalyzerProvider({geminiTextApiKey: "text-key", geminiTextKeySource: "TEXT", geminiModel: "gemini-3.6-flash", ...FAST_RETRY});
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {candidates: [{content: {parts: [{text: JSON.stringify({item_name: "Blazer", category: "Outerwear", tags: []})}]}}]};
    },
  }) as Response;

  try {
    const lines = await captureConsole(async () => {
      await analyzer.analyzeWardrobe({mimetype: "image/jpeg", buffer: Buffer.from("abc"), size: 3});
    });

    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /^\[Gemini\] TEXT \| wardrobe_analysis \| gemini-3\.6-flash \| started$/);
    assert.match(lines[1]!, /^\[Gemini\] TEXT \| wardrobe_analysis \| gemini-3\.6-flash \| success \| \d+ms$/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("labels the call LEGACY_FALLBACK when the split text key is missing and the shared key is used", async () => {
  const analyzer = new GeminiTextAnalyzerProvider({geminiApiKey: "shared-key", geminiTextKeySource: "LEGACY_FALLBACK", geminiModel: "gemini-3.6-flash", ...FAST_RETRY});
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {candidates: [{content: {parts: [{text: JSON.stringify({wardrobe_item_ids: ["item-1"], rationale: "ok", suggested_purchase_item: null})}]}}]};
    },
  }) as Response;

  try {
    const lines = await captureConsole(async () => {
      await analyzer.suggestOutfit({eventType: "Casual", profile: {}, wardrobe: [{id: "item-1", name: "Tee", category: "Top"}] as never, affinityNotes: null});
    });

    assert.match(lines[0]!, /^\[Gemini\] LEGACY_FALLBACK \| outfit_generation \| gemini-3\.6-flash \| started$/);
    assert.match(lines[1]!, /^\[Gemini\] LEGACY_FALLBACK \| outfit_generation \| gemini-3\.6-flash \| success \| \d+ms$/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("logs a failure line with a safe error code and duration, never the raw provider response", async () => {
  const analyzer = new GeminiTextAnalyzerProvider({geminiTextApiKey: "text-key", geminiTextKeySource: "TEXT", geminiModel: "gemini-3.6-flash", geminiMaxRetries: 0, ...FAST_RETRY});
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 500,
    async json() {
      return {error: {message: "some secret upstream detail that must never be logged", status: "INTERNAL"}};
    },
  }) as Response;

  try {
    const lines = await captureConsole(async () => {
      await assert.rejects(() => analyzer.analyzeWardrobe({mimetype: "image/jpeg", buffer: Buffer.from("abc"), size: 3}));
    });

    assert.equal(lines.length, 2);
    assert.match(lines[1]!, /^\[Gemini\] TEXT \| wardrobe_analysis \| gemini-3\.6-flash \| failed \| \d+ms \| \S+$/);
    for (const line of lines) {
      assert.doesNotMatch(line, /secret upstream detail/);
      assert.doesNotMatch(line, /text-key/);
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test("does not log anything when no Gemini API key is configured (no call is made)", async () => {
  const analyzer = new GeminiTextAnalyzerProvider({geminiTextApiKey: "", ...FAST_RETRY});
  const lines = await captureConsole(async () => {
    await analyzer.analyzeWardrobe({mimetype: "image/jpeg", buffer: Buffer.from("abc"), size: 3});
  });
  assert.deepEqual(lines, []);
});

test("logs IMAGE key label for a successful virtual try-on call", async () => {
  const provider = new GeminiVirtualTryOnProvider({geminiImageApiKey: "image-key", geminiImageKeySource: "IMAGE", geminiImageModel: "gemini-3.1-flash-image", geminiImageSize: "1K", geminiImageAspectRatio: "3:4", ...FAST_RETRY});
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {candidates: [{content: {parts: [{inlineData: {mimeType: "image/png", data: Buffer.from("img").toString("base64")}}]}}]};
    },
  }) as Response;

  try {
    const lines = await captureConsole(async () => {
      await provider.generate({
        profileFile: {mimetype: "image/jpeg", buffer: Buffer.from("profile")},
        garmentFiles: [{mimetype: "image/jpeg", buffer: Buffer.from("garment")}],
        notes: "",
      });
    });

    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /^\[Gemini\] IMAGE \| virtual_tryon \| gemini-3\.1-flash-image \| started$/);
    assert.match(lines[1]!, /^\[Gemini\] IMAGE \| virtual_tryon \| gemini-3\.1-flash-image \| success \| \d+ms$/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("logs a failure line for virtual try-on with a safe reason and no image bytes", async () => {
  const provider = new GeminiVirtualTryOnProvider({geminiImageApiKey: "image-key", geminiImageKeySource: "IMAGE", geminiImageModel: "gemini-3.1-flash-image", geminiMaxRetries: 0, ...FAST_RETRY});
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new DOMException("The operation timed out.", "TimeoutError");
  };

  try {
    const lines = await captureConsole(async () => {
      await assert.rejects(() => provider.generate({
        profileFile: {mimetype: "image/jpeg", buffer: Buffer.from("profile")},
        garmentFiles: [{mimetype: "image/jpeg", buffer: Buffer.from("garment")}],
        notes: "",
      }));
    });

    assert.equal(lines.length, 2);
    assert.match(lines[1]!, /^\[Gemini\] IMAGE \| virtual_tryon \| gemini-3\.1-flash-image \| failed \| \d+ms \| \S+$/);
    for (const line of lines) {
      assert.doesNotMatch(line, /image-key/);
      assert.doesNotMatch(line, /profile/);
      assert.doesNotMatch(line, /garment/);
    }
  } finally {
    global.fetch = originalFetch;
  }
});
