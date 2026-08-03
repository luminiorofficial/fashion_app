const assert = require("node:assert/strict");
const test = require("node:test");

const {readInlineImage, stringValue} = require("../index")._test;

test("readInlineImage accepts a small supported Base64 image", () => {
  const result = readInlineImage({
    imageBase64: Buffer.from([0xff, 0xd8, 0xff]).toString("base64"),
    mimeType: "image/jpeg",
  });

  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(result.data, "/9j/");
});

test("readInlineImage rejects malformed data and unsupported formats", () => {
  assert.throws(
      () => readInlineImage({imageBase64: "not base64", mimeType: "image/jpeg"}),
      /not valid Base64/,
  );
  assert.throws(
      () => readInlineImage({imageBase64: "/9j/", mimeType: "image/svg+xml"}),
      /Unsupported image format/,
  );
  assert.throws(
      () => readInlineImage({
        imageBase64: Buffer.from("plain text").toString("base64"),
        mimeType: "image/jpeg",
      }),
      /do not match/,
  );
});

test("stringValue trims input and rejects empty values", () => {
  assert.equal(stringValue("  Wedding  ", "eventType"), "Wedding");
  assert.throws(() => stringValue("", "eventType"), /eventType is required/);
});
