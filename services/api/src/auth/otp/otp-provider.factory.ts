import type { ConfigService } from '@nestjs/config';
import { DummyOtpProvider } from './dummy-otp.provider';
import type { OtpProvider } from './otp-provider.interface';
import { OtpConfigService } from './otp-config.service';
import { WapilotWhatsAppClient } from '../../wapilot/wapilot-whatsapp.client';
import { WapilotWhatsAppOtpProvider } from './wapilot-whatsapp-otp.provider';

export function createOtpProvider(deps: {
  config: ConfigService;
  otpConfig: OtpConfigService;
  wapilotClient: WapilotWhatsAppClient;
  dummyProvider: DummyOtpProvider;
  wapilotOtpProvider: WapilotWhatsAppOtpProvider;
}): OtpProvider {
  const mode = deps.otpConfig.resolveOtpProvider();
  if (mode === 'dummy') {
    return deps.dummyProvider;
  }
  deps.otpConfig.resolveWhatsAppProvider();
  return deps.wapilotOtpProvider;
}
