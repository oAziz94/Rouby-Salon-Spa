import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const DEFAULT_WAPILOT_API_BASE_URL = 'https://api.wapilot.net/api/v2';

@Injectable()
export class WapilotConfigService {
  constructor(private readonly config: ConfigService) {}

  resolveWhatsAppProvider(): 'wapilot' | null {
    const raw = (this.config.get<string>('WHATSAPP_PROVIDER') ?? '')
      .trim()
      .toLowerCase();
    if (!raw) {
      return null;
    }
    if (raw !== 'wapilot') {
      throw new Error(
        `Unsupported WHATSAPP_PROVIDER "${raw}". Only "wapilot" is supported.`,
      );
    }
    return 'wapilot';
  }

  getApiBaseUrl(): string {
    const configured = this.config.get<string>('WAPILOT_API_BASE_URL')?.trim();
    return (configured || DEFAULT_WAPILOT_API_BASE_URL).replace(/\/+$/, '');
  }

  assertWapilotCredentials(): void {
    this.resolveWhatsAppProvider();
    const required = ['WAPILOT_API_TOKEN', 'WAPILOT_INSTANCE_ID'] as const;
    for (const key of required) {
      const value = this.config.get<string>(key)?.trim();
      if (!value) {
        throw new Error(`${key} is required when WHATSAPP_PROVIDER=wapilot.`);
      }
    }
    this.getApiBaseUrl();
  }
}
