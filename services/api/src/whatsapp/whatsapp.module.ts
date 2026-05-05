import { Module } from '@nestjs/common';
import { DashboardWhatsappDeepLinkController } from './dashboard-whatsapp-deep-link.controller';
import { DashboardWhatsappTemplatesController } from './dashboard-whatsapp-templates.controller';
import { WhatsappDeepLinkService } from './whatsapp-deep-link.service';
import { WhatsappTemplatesService } from './whatsapp-templates.service';

@Module({
  controllers: [
    DashboardWhatsappTemplatesController,
    DashboardWhatsappDeepLinkController,
  ],
  providers: [WhatsappTemplatesService, WhatsappDeepLinkService],
})
export class WhatsappModule {}
