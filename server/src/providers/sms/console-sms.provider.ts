import type {SmsProvider, SmsSendResult} from "../../types/provider.types";

export class DevelopmentSmsProvider implements SmsProvider {
  name = "development_console";
  exposeOtp = true;

  async sendOtp(_phoneNumber: string, _otp: string): Promise<SmsSendResult> {
    return {messageId: null};
  }
}
