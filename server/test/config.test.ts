import test from "node:test";
import assert from "node:assert/strict";
import {loadConfig} from "../src/config/env";

const cloudinary = {
  cloudinaryCloudName: "nera-cloud",
  cloudinaryApiKey: "api-key",
  cloudinaryApiSecret: "api-secret",
};

const databaseUrl = "postgresql://postgres:secret@localhost:5432/nera";
const productionSecurity = {
  smsProvider: "twilio",
  cronSecret: "test-cron-secret-at-least-32-characters",
  allowedOrigins: ["https://app.example.com"],
  databaseSsl: true,
  otpHashSecret: "test-otp-hash-secret-at-least-32-characters",
  cloudinaryAuthTokenKey: "test-cloudinary-token-key",
  twilioAccountSid: `AC${"1".repeat(32)}`,
  twilioAuthToken: "test-twilio-token",
  twilioMessagingServiceSid: `MG${"2".repeat(32)}`,
  publicBaseUrl: "https://api.example.com",
};

test("uses local image storage by default outside production", () => {
  const config = loadConfig({env: "test"});
  assert.equal(config.imageStorageProvider, "local");
});

test("selects Cloudinary when all private storage credentials are configured", () => {
  const config = loadConfig({env: "production", ...cloudinary, ...productionSecurity, databaseUrl});
  assert.equal(config.imageStorageProvider, "cloudinary");
});

test("rejects partially configured Cloudinary credentials", () => {
  assert.throws(
    () => loadConfig({env: "development", cloudinaryCloudName: "nera-cloud"}),
    /Cloudinary image storage requires/,
  );
});

test("rejects local image storage in production", () => {
  assert.throws(
    () => loadConfig({env: "production", imageStorageProvider: "local", databaseUrl}),
    /Production image storage must use Cloudinary/,
  );
});

test("rejects an unknown image storage provider", () => {
  assert.throws(
    () => loadConfig({env: "test", imageStorageProvider: "public"}),
    /IMAGE_STORAGE_PROVIDER must be one of/,
  );
});

test("rejects production without DATABASE_URL, refusing to fall back to the in-memory repository", () => {
  assert.throws(
    () => loadConfig({env: "production", ...cloudinary, databaseUrl: ""}),
    /Production requires DATABASE_URL/,
  );
});

test("allows production with DATABASE_URL configured", () => {
  const config = loadConfig({env: "production", ...cloudinary, ...productionSecurity, databaseUrl});
  assert.equal(config.databaseUrl, databaseUrl);
});

test("rejects every console OTP override in production", () => {
  process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION = "true";
  try {
    assert.throws(() => loadConfig({env: "production", ...cloudinary, databaseUrl, cronSecret: "cron", allowedOrigins: ["https://app.example.com"], databaseSsl: true, smsProvider: "console"}), /console OTP is never allowed/);
  } finally {
    delete process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION;
  }
});

test("requires production cron authentication, explicit CORS origins, and database SSL", () => {
  assert.throws(() => loadConfig({env: "production", ...cloudinary, databaseUrl, smsProvider: "twilio"}), /CRON_SECRET[\s\S]*ALLOWED_ORIGIN[\s\S]*DATABASE_SSL/);
});
