import type {SmsProvider, SmsSendResult} from "../../types/provider.types";

export class DevelopmentSmsProvider implements SmsProvider {
  name = "development_console";
  exposeOtp = true;

  async sendOtp(phoneNumber: string, otp: string): Promise<SmsSendResult> {
    console.info(`[development OTP] ${phoneNumber}: ${otp}`);
    return {messageId: null};
  }
}
