import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_WAPILOT_API_BASE_URL = 'https://api.wapilot.net/api/v2';

@Injectable()
export class OtpConfigService implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const provider = this.resolveOtpProvider();
    if (provider === 'whatsapp') {
      this.assertWhatsAppProviderConfigured();
    }
  }

  resolveOtpProvider(): 'dummy' | 'whatsapp' {
    const raw = (this.config.get<string>('OTP_PROVIDER') ?? 'dummy')
      .trim()
      .toLowerCase();
    if (raw === 'dummy') {
      return 'dummy';
    }
    if (raw === 'whatsapp') {
      return 'whatsapp';
    }
    throw new Error(
      `Unsupported OTP_PROVIDER "${raw}". Use "dummy" or "whatsapp".`,
    );
  }

  resolveWhatsAppProvider(): 'wapilot' {
    const raw = (this.config.get<string>('WHATSAPP_PROVIDER') ?? '')
      .trim()
      .toLowerCase();
    if (raw !== 'wapilot') {
      throw new Error(
        'WHATSAPP_PROVIDER must be "wapilot" when OTP_PROVIDER=whatsapp.',
      );
    }
    return 'wapilot';
  }

  getWapilotApiBaseUrl(): string {
    const configured = this.config.get<string>('WAPILOT_API_BASE_URL')?.trim();
    return (configured || DEFAULT_WAPILOT_API_BASE_URL).replace(/\/+$/, '');
  }

  private assertWhatsAppProviderConfigured(): void {
    this.resolveWhatsAppProvider();
    const required = ['WAPILOT_API_TOKEN', 'WAPILOT_INSTANCE_ID'] as const;
    for (const key of required) {
      const value = this.config.get<string>(key)?.trim();
      if (!value) {
        throw new Error(
          `${key} is required when OTP_PROVIDER=whatsapp and WHATSAPP_PROVIDER=wapilot.`,
        );
      }
    }
    this.getWapilotApiBaseUrl();
  }
}
