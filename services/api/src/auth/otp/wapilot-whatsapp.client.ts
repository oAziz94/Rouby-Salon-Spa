import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpConfigService } from './otp-config.service';

export type WapilotSendMessagePayload = {
  chat_id: string;
  text: string;
  priority: number;
};

@Injectable()
export class WapilotWhatsAppClient {
  private readonly logger = new Logger(WapilotWhatsAppClient.name);

  constructor(
    private readonly config: ConfigService,
    private readonly otpConfig: OtpConfigService,
  ) {}

  async sendMessage(chatId: string, text: string): Promise<void> {
    const baseUrl = this.otpConfig.getWapilotApiBaseUrl();
    const instanceId = this.config.getOrThrow<string>('WAPILOT_INSTANCE_ID');
    const token = this.config.getOrThrow<string>('WAPILOT_API_TOKEN');
    const url = `${baseUrl}/${encodeURIComponent(instanceId)}/send-message`;
    const body: WapilotSendMessagePayload = {
      chat_id: chatId,
      text,
      priority: 1,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      this.logger.error(
        `WAPilot request failed for chat_id suffix …${chatId.slice(-4)}`,
        error instanceof Error ? error.message : String(error),
      );
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: 'Unable to send verification code. Please try again shortly.',
        error: 'Service Unavailable',
        code: 'OTP_DELIVERY_FAILED',
      });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `WAPilot send-message returned ${response.status} for chat_id suffix …${chatId.slice(-4)}${detail ? ` (${detail.slice(0, 200)})` : ''}`,
      );
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: 'Unable to send verification code. Please try again shortly.',
        error: 'Service Unavailable',
        code: 'OTP_DELIVERY_FAILED',
      });
    }
  }
}
