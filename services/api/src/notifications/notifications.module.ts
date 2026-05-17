import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WapilotModule } from '../wapilot/wapilot.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingNotificationService } from './booking-notification.service';
import { BookingReminderScheduler } from './booking-reminder.scheduler';
import { DashboardNotificationsController } from './dashboard-notifications.controller';
import { DashboardNotificationsService } from './dashboard-notifications.service';
import { DummyWhatsAppNotificationProvider } from './dummy-whatsapp-notification.provider';
import { NotificationConfigService } from './notification-config.service';
import { NotificationLogService } from './notification-log.service';
import { WapilotWhatsAppNotificationProvider } from './wapilot-whatsapp-notification.provider';
import { WHATSAPP_NOTIFICATIONS } from './whatsapp-notification-provider.interface';
import { createWhatsAppNotificationProvider } from './whatsapp-notification.factory';

@Module({
  imports: [ConfigModule, PrismaModule, WapilotModule],
  controllers: [DashboardNotificationsController],
  providers: [
    DashboardNotificationsService,
    NotificationConfigService,
    NotificationLogService,
    DummyWhatsAppNotificationProvider,
    WapilotWhatsAppNotificationProvider,
    {
      provide: WHATSAPP_NOTIFICATIONS,
      useFactory: (
        config: NotificationConfigService,
        dummy: DummyWhatsAppNotificationProvider,
        wapilot: WapilotWhatsAppNotificationProvider,
      ) =>
        createWhatsAppNotificationProvider({
          config,
          dummy,
          wapilot,
        }),
      inject: [
        NotificationConfigService,
        DummyWhatsAppNotificationProvider,
        WapilotWhatsAppNotificationProvider,
      ],
    },
    BookingNotificationService,
    BookingReminderScheduler,
  ],
  exports: [
    BookingNotificationService,
    NotificationConfigService,
    DashboardNotificationsService,
  ],
})
export class NotificationsModule {}
