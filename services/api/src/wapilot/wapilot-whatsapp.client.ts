import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WapilotConfigService } from './wapilot-config.service';

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
    private readonly wapilotConfig: WapilotConfigService,
  ) {}

  /**
   * WHATSAPP_ONLY_TO (comma-separated numbers, digits only matter): when set, messages to
   * anyone else are dropped. For dev/test databases that hold real client phones.
   * Unset in production.
   */
  private isRecipientAllowed(chatId: string): boolean {
    const allowed = (this.config.get<string>('WHATSAPP_ONLY_TO') ?? '')
      .split(',')
      .map((n) => n.replace(/\D/g, ''))
      .filter((n) => n.length >= 8);
    if (allowed.length === 0) return true;
    const to = chatId.split('@')[0].replace(/\D/g, '');
    return allowed.includes(to);
  }

  async sendTextMessage(chatId: string, text: string): Promise<void> {
    if (!this.isRecipientAllowed(chatId)) {
      this.logger.warn(
        `WHATSAPP_ONLY_TO is set: message to chat_id suffix …${chatId.slice(-4)} was NOT sent`,
      );
      return;
    }
    const baseUrl = this.wapilotConfig.getApiBaseUrl();
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
        message: 'Unable to send WhatsApp message. Please try again shortly.',
        error: 'Service Unavailable',
        code: 'WHATSAPP_DELIVERY_FAILED',
      });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `WAPilot send-message returned ${response.status} for chat_id suffix …${chatId.slice(-4)}${detail ? ` (${detail.slice(0, 200)})` : ''}`,
      );
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: 'Unable to send WhatsApp message. Please try again shortly.',
        error: 'Service Unavailable',
        code: 'WHATSAPP_DELIVERY_FAILED',
      });
    }
  }

  /** @deprecated Use {@link sendTextMessage}. */
  async sendMessage(chatId: string, text: string): Promise<void> {
    return this.sendTextMessage(chatId, text);
  }
}
