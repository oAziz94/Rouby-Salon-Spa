import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BookingStatus, NotificationType } from '@prisma/client';
import {
  getCairoNowCompositeKey,
  isSlotStartStrictlyInFutureCairo,
} from '../common/cairo-slot-time';
import { PrismaService } from '../prisma/prisma.service';
import { bookingSlotStartUtcMs } from './booking-slot-format';
import {
  is24HourReminderDue,
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
    const nowMs = reminderComparisonNowMs();
    const todayYmd = getCairoNowCompositeKey().slice(0, 10);
    const minSlotDate = new Date(`${todayYmd}T00:00:00.000Z`);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: ACTIVE_REMINDER_STATUSES },
        slot: { date: { gte: minSlotDate } },
      },
      include: {
        slot: true,
      },
      orderBy: [{ slot: { date: 'asc' } }, { slot: { startTime: 'asc' } }],
    });

    let sent = 0;
    for (const booking of bookings) {
      if (!isSlotStartStrictlyInFutureCairo(booking.slot)) {
        continue;
      }

      const slotMs = bookingSlotStartUtcMs(booking.slot);
      if (slotMs === null) {
        continue;
      }

      if (is24HourReminderDue(slotMs, nowMs, hoursBefore, minutesBeforeFinal)) {
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
