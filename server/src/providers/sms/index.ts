import {DevelopmentSmsProvider} from "./console-sms.provider";
import {TwilioSmsProvider, type TwilioProviderDependencies} from "./twilio-sms.provider";
import type {SmsProvider} from "../../types/provider.types";
import type {AppConfig} from "../../config/env";

export {DevelopmentSmsProvider} from "./console-sms.provider";
export {TwilioSmsProvider} from "./twilio-sms.provider";

export function createSmsProvider(config: AppConfig, dependencies: TwilioProviderDependencies = {}): SmsProvider {
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
