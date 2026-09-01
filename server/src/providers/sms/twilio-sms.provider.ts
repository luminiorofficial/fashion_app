import twilio, {type Twilio} from "twilio";
import {ApiError} from "../../utils/api-error";
import type {SmsProvider, SmsSendResult} from "../../types/provider.types";
import type {AppConfig} from "../../config/env";

export type TwilioConfig = Pick<AppConfig, "twilioAccountSid" | "twilioAuthToken" | "twilioMessagingServiceSid" | "twilioFromNumber" | "otpTtlMinutes">;

export interface TwilioProviderDependencies {
  client?: Pick<Twilio, "messages">;
  logger?: Pick<Console, "error">;
}

export class TwilioSmsProvider implements SmsProvider {
  name = "twilio";
  exposeOtp = false;
  private readonly config: TwilioConfig;
  private readonly logger: Pick<Console, "error">;
  private readonly client: Pick<Twilio, "messages">;

  constructor(config: TwilioConfig, {client, logger = console}: TwilioProviderDependencies = {}) {
    this.config = config;
    this.logger = logger;
    this.client = client || twilio(config.twilioAccountSid, config.twilioAuthToken, {autoRetry: true, maxRetries: 2});
  }

  async sendOtp(phoneNumber: string, otp: string): Promise<SmsSendResult> {
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
      const twilioError = error as {status?: number; code?: number | string};
      this.logger.error("Twilio SMS submission failed", {status: twilioError?.status, code: twilioError?.code});
      throw new ApiError(502, "SMS_DELIVERY_FAILED", "The verification SMS could not be sent. Please try again.");
    }
  }
}
