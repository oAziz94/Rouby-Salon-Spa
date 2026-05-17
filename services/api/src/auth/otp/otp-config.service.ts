import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WapilotConfigService } from '../../wapilot/wapilot-config.service';

@Injectable()
export class OtpConfigService implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly wapilotConfig: WapilotConfigService,
  ) {}

  onModuleInit(): void {
    if (this.resolveOtpProvider() === 'whatsapp') {
      this.wapilotConfig.assertWapilotCredentials();
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
    const provider = this.wapilotConfig.resolveWhatsAppProvider();
    if (provider !== 'wapilot') {
      throw new Error(
        'WHATSAPP_PROVIDER must be "wapilot" when OTP_PROVIDER=whatsapp.',
      );
    }
    return 'wapilot';
  }

  getWapilotApiBaseUrl(): string {
    return this.wapilotConfig.getApiBaseUrl();
  }
}
