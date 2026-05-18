import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WapilotConfigService } from '../wapilot/wapilot-config.service';

@Injectable()
export class NotificationConfigService implements OnModuleInit {
  private readonly logger = new Logger(NotificationConfigService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly wapilotConfig: WapilotConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      return;
    }
    if (!this.usesWapilot()) {
      throw new Error(
        'NOTIFICATIONS_ENABLED=true requires WHATSAPP_PROVIDER=wapilot. ' +
          'Messages are not delivered with the dummy provider.',
      );
    }
    this.wapilotConfig.assertWapilotCredentials();
    this.logger.log('WhatsApp booking notifications enabled (WAPilot)');
  }

  isEnabled(): boolean {
    return (
      this.config
        .get<string>('NOTIFICATIONS_ENABLED', 'false')
        .toLowerCase() === 'true'
    );
  }

  usesWapilot(): boolean {
    return this.wapilotConfig.resolveWhatsAppProvider() === 'wapilot';
  }

  getReminderHoursBefore(): number {
    const raw = Number(
      this.config.get<string>('BOOKING_REMINDER_HOURS_BEFORE', '24'),
    );
    return Number.isFinite(raw) && raw > 0 ? raw : 24;
  }

  /** Final reminder lead time (minutes before appointment). Default 90. */
  getReminderMinutesBeforeFinal(): number {
    const raw = Number(
      this.config.get<string>('BOOKING_REMINDER_MINUTES_BEFORE_FINAL', '90'),
    );
    return Number.isFinite(raw) && raw > 0 ? raw : 90;
  }
}
