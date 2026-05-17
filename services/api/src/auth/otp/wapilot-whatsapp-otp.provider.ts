import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizePhoneToWhatsAppChatId } from '../../common/phone/phone.util';
import type { OtpProvider } from './otp-provider.interface';
import { WapilotWhatsAppClient } from '../../wapilot/wapilot-whatsapp.client';

@Injectable()
export class WapilotWhatsAppOtpProvider implements OtpProvider {
  constructor(
    private readonly wapilot: WapilotWhatsAppClient,
    private readonly config: ConfigService,
  ) {}

  async sendOtp(phone: string, otp: string, context?: string): Promise<void> {
    void context;
    const chatId = normalizePhoneToWhatsAppChatId(phone);
    const ttlSeconds = Number(
      this.config.get<string>('CLIENT_OTP_TTL_SECONDS', '300'),
    );
    const ttlMinutes = Math.max(1, Math.round(ttlSeconds / 60));
    const text = `Your AlRouby verification code is: ${otp}. This code expires in ${ttlMinutes} minute${ttlMinutes === 1 ? '' : 's'}. Do not share it with anyone.`;
    await this.wapilot.sendTextMessage(chatId, text);
  }
}
