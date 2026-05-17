import { ConfigService } from '@nestjs/config';
import { WapilotConfigService } from '../../wapilot/wapilot-config.service';
import { OtpConfigService } from './otp-config.service';

describe('OtpConfigService', () => {
  function service(env: Record<string, string | undefined>): OtpConfigService {
    const config = {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;
    const wapilotConfig = new WapilotConfigService(config);
    return new OtpConfigService(config, wapilotConfig);
  }

  it('allows dummy provider without WAPilot credentials', () => {
    const s = service({ OTP_PROVIDER: 'dummy' });
    expect(() => s.onModuleInit()).not.toThrow();
    expect(s.resolveOtpProvider()).toBe('dummy');
  });

  it('fails fast when whatsapp provider is missing WAPilot token', () => {
    const s = service({
      OTP_PROVIDER: 'whatsapp',
      WHATSAPP_PROVIDER: 'wapilot',
      WAPILOT_INSTANCE_ID: 'inst',
    });
    expect(() => s.onModuleInit()).toThrow(/WAPILOT_API_TOKEN/);
  });

  it('defaults WAPilot base URL', () => {
    const s = service({
      OTP_PROVIDER: 'whatsapp',
      WHATSAPP_PROVIDER: 'wapilot',
      WAPILOT_API_TOKEN: 't',
      WAPILOT_INSTANCE_ID: 'i',
    });
    expect(s.getWapilotApiBaseUrl()).toBe('https://api.wapilot.net/api/v2');
  });
});
