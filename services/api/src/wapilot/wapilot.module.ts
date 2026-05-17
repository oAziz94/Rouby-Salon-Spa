import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WapilotConfigService } from './wapilot-config.service';
import { WapilotWhatsAppClient } from './wapilot-whatsapp.client';

@Module({
  imports: [ConfigModule],
  providers: [WapilotConfigService, WapilotWhatsAppClient],
  exports: [WapilotConfigService, WapilotWhatsAppClient],
})
export class WapilotModule {}
