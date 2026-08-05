const test = require("node:test");
const assert = require("node:assert/strict");
const {ApiError} = require("../src/errors");
const {DevelopmentSmsProvider, TwilioSmsProvider, createSmsProvider} = require("../src/sms");

const config = {
  env: "test",
  smsProvider: "twilio",
  otpTtlMinutes: 5,
  twilioAccountSid: `AC${"1".repeat(32)}`,
  twilioAuthToken: "secret",
  twilioMessagingServiceSid: `MG${"2".repeat(32)}`,
  twilioFromNumber: "",
};

test("submits OTP messages through a Twilio Messaging Service", async () => {
  let submitted;
  const client = {messages: {create: async (message) => { submitted = message; return {sid: "SM123"}; }}};
  const provider = new TwilioSmsProvider(config, {client});
  const result = await provider.sendOtp("+919876543210", "123456");
  assert.equal(result.messageId, "SM123");
  assert.equal(submitted.to, "+919876543210");
  assert.equal(submitted.messagingServiceSid, `MG${"2".repeat(32)}`);
  assert.equal(submitted.from, undefined);
  assert.match(submitted.body, /123456/);
});

test("uses a Twilio sender number when no Messaging Service is configured", async () => {
  let submitted;
  const client = {messages: {create: async (message) => { submitted = message; return {sid: "SM456"}; }}};
  const provider = new TwilioSmsProvider({...config, twilioMessagingServiceSid: "", twilioFromNumber: "+15005550006"}, {client});
  await provider.sendOtp("+919876543210", "654321");
  assert.equal(submitted.from, "+15005550006");
  assert.equal(submitted.messagingServiceSid, undefined);
});

test("converts Twilio failures into a safe API error", async () => {
  const client = {messages: {create: async () => { throw {status: 400, code: 21211}; }}};
  const provider = new TwilioSmsProvider(config, {client, logger: {error() {}}});
  await assert.rejects(provider.sendOtp("+919876543210", "123456"), (error) => error instanceof ApiError && error.code === "SMS_DELIVERY_FAILED" && error.status === 502);
});

test("requires complete Twilio credentials and a sender", () => {
  assert.throws(() => createSmsProvider({...config, twilioAuthToken: ""}), /TWILIO_AUTH_TOKEN/);
  assert.throws(() => createSmsProvider({...config, twilioMessagingServiceSid: "", twilioFromNumber: ""}), /TWILIO_MESSAGING_SERVICE_SID/);
  assert.equal(createSmsProvider({...config, smsProvider: "console"}) instanceof DevelopmentSmsProvider, true);
});
