import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BookingStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { bookingSlotStartUtcMs } from './booking-slot-format';
import {
  is24HourReminderCronDue,
  is90MinuteReminderDue,
  reminderComparisonNowMs,
} from './booking-reminder-timing';
import { BookingNotificationService } from './booking-notification.service';
import { NotificationConfigService } from './notification-config.service';

const ACTIVE_REMINDER_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.RESCHEDULED,
];

@Injectable()
export class BookingReminderScheduler {
  private readonly logger = new Logger(BookingReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: NotificationConfigService,
    private readonly notifications: BookingNotificationService,
  ) {}

  @Cron('*/15 * * * *')
  async dispatchDueReminders(): Promise<void> {
    if (!this.config.isEnabled()) {
      return;
    }

    const hoursBefore = this.config.getReminderHoursBefore();
    const minutesBeforeFinal = this.config.getReminderMinutesBeforeFinal();
    const windowMs = this.config.getReminderCronWindowMs();
    const nowMs = reminderComparisonNowMs();

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: ACTIVE_REMINDER_STATUSES },
      },
      include: {
        slot: true,
      },
      take: 500,
    });

    let sent = 0;
    for (const booking of bookings) {
      const slotMs = bookingSlotStartUtcMs(booking.slot);
      if (slotMs === null) {
        continue;
      }

      if (is24HourReminderCronDue(slotMs, nowMs, hoursBefore, windowMs)) {
        const ok = await this.notifications.sendAppointmentReminderForBooking(
          booking.id,
          NotificationType.APPOINTMENT_REMINDER,
        );
        if (ok) {
          sent += 1;
        }
      }

      if (is90MinuteReminderDue(slotMs, nowMs, minutesBeforeFinal)) {
        const ok = await this.notifications.sendAppointmentReminderForBooking(
          booking.id,
          NotificationType.APPOINTMENT_REMINDER_90M,
        );
        if (ok) {
          sent += 1;
        }
      }
    }

    if (sent > 0) {
      this.logger.log(`Sent ${sent} appointment reminder(s) via WhatsApp`);
    }
  }
}
