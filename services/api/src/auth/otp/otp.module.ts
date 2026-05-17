import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WapilotModule } from '../../wapilot/wapilot.module';
import { WapilotWhatsAppClient } from '../../wapilot/wapilot-whatsapp.client';
import { DummyOtpProvider } from './dummy-otp.provider';
import { OTP_DELIVERY } from './otp-provider.interface';
import { createOtpProvider } from './otp-provider.factory';
import { OtpConfigService } from './otp-config.service';
import { WapilotWhatsAppOtpProvider } from './wapilot-whatsapp-otp.provider';

@Module({
  imports: [ConfigModule, WapilotModule],
  providers: [
    OtpConfigService,
    DummyOtpProvider,
    WapilotWhatsAppOtpProvider,
    {
      provide: OTP_DELIVERY,
      useFactory: (
        config: ConfigService,
        otpConfig: OtpConfigService,
        wapilotClient: WapilotWhatsAppClient,
        dummyProvider: DummyOtpProvider,
        wapilotOtpProvider: WapilotWhatsAppOtpProvider,
      ) =>
        createOtpProvider({
          config,
          otpConfig,
          wapilotClient,
          dummyProvider,
          wapilotOtpProvider,
        }),
      inject: [
        ConfigService,
        OtpConfigService,
        WapilotWhatsAppClient,
        DummyOtpProvider,
        WapilotWhatsAppOtpProvider,
      ],
    },
  ],
  exports: [OTP_DELIVERY, OtpConfigService],
})
export class OtpModule {}
