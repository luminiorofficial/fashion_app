const twilio = require("twilio");
const {ApiError} = require("./errors");

class DevelopmentSmsProvider {
  constructor() {
    this.name = "development_console";
    this.exposeOtp = true;
  }

  async sendOtp(phoneNumber, otp) {
    console.info(`[development OTP] ${phoneNumber}: ${otp}`);
    return {messageId: null};
  }
}

class TwilioSmsProvider {
  constructor(config, {client, logger = console} = {}) {
    this.name = "twilio";
    this.exposeOtp = false;
    this.config = config;
    this.logger = logger;
    this.client = client || twilio(config.twilioAccountSid, config.twilioAuthToken, {
      autoRetry: true,
      maxRetries: 2,
    });
  }

  async sendOtp(phoneNumber, otp) {
    const sender = this.config.twilioMessagingServiceSid
      ? {messagingServiceSid: this.config.twilioMessagingServiceSid}
      : {from: this.config.twilioFromNumber};
    try {
      const message = await this.client.messages.create({
        body: `Your NERA verification code is ${otp}. It expires in ${this.config.otpTtlMinutes} minutes. Do not share this code.`,
        to: phoneNumber,
        ...sender,
      });
      return {messageId: message.sid};
    } catch (error) {
      this.logger.error("Twilio SMS submission failed", {status: error?.status, code: error?.code});
      throw new ApiError(502, "SMS_DELIVERY_FAILED", "The verification SMS could not be sent. Please try again.");
    }
  }
}

function createSmsProvider(config, dependencies = {}) {
  if (config.smsProvider === "console") {
    if (config.env === "production" && !config.allowConsoleOtpInProduction) {
      throw new Error("SMS_PROVIDER=console is not allowed in production unless ALLOW_CONSOLE_OTP_IN_PRODUCTION=true.");
    }
    if (config.env === "production") {
      console.warn("WARNING: Console OTP is enabled in production for temporary testing only.");
    }
    return new DevelopmentSmsProvider();
  }
  if (config.smsProvider !== "twilio") throw new Error("SMS_PROVIDER must be either console or twilio.");

  const hasCredentials = Boolean(config.twilioAccountSid && config.twilioAuthToken);
  const hasSender = Boolean(config.twilioMessagingServiceSid || config.twilioFromNumber);
  if (!hasCredentials || !hasSender) {
    throw new Error("Twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER.");
  }
  if (!/^AC[0-9a-f]{32}$/i.test(config.twilioAccountSid)) throw new Error("TWILIO_ACCOUNT_SID must be a valid AC-prefixed SID.");
  if (config.twilioMessagingServiceSid && !/^MG[0-9a-f]{32}$/i.test(config.twilioMessagingServiceSid)) throw new Error("TWILIO_MESSAGING_SERVICE_SID must be a valid MG-prefixed SID.");
  if (config.twilioFromNumber && !/^\+[1-9]\d{7,14}$/.test(config.twilioFromNumber)) throw new Error("TWILIO_FROM_NUMBER must use E.164 format.");
  return new TwilioSmsProvider(config, dependencies);
}

module.exports = {DevelopmentSmsProvider, TwilioSmsProvider, createSmsProvider};
