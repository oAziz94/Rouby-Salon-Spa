import { Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationLogService {
  constructor(private readonly prisma: PrismaService) {}

  async hasSuccessfulBookingNotification(
    bookingId: string,
    type: NotificationType,
  ): Promise<boolean> {
    const row = await this.prisma.notificationLog.findFirst({
      where: {
        bookingId,
        type,
        status: NotificationStatus.SENT,
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  /**
   * Automatic retries give up after `maxAttempts` failures for the same booking + type, so a
   * broken provider token does not produce a message attempt every scheduler tick. A manual
   * "Retry" from Notification logs still works (it bypasses this check).
   */
  async hasExhaustedAutomaticAttempts(
    bookingId: string,
    type: NotificationType,
    maxAttempts = 3,
  ): Promise<boolean> {
    const failed = await this.prisma.notificationLog.count({
      where: { bookingId, type, status: NotificationStatus.FAILED },
    });
    return failed >= maxAttempts;
  }

  async hasSuccessfulChangeRequestNotification(
    changeRequestId: string,
  ): Promise<boolean> {
    const row = await this.prisma.notificationLog.findFirst({
      where: {
        changeRequestId,
        type: NotificationType.CHANGE_REQUEST_UPDATE,
        status: NotificationStatus.SENT,
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  async createPending(args: {
    branchId?: string;
    bookingId?: string;
    changeRequestId?: string;
    type: NotificationType;
    recipientPhone: string;
    provider?: string;
  }) {
    return this.prisma.notificationLog.create({
      data: {
        branchId: args.branchId,
        bookingId: args.bookingId,
        changeRequestId: args.changeRequestId,
        channel: NotificationChannel.WHATSAPP,
        type: args.type,
        recipientPhone: args.recipientPhone,
        provider: args.provider ?? 'wapilot',
        status: NotificationStatus.PENDING,
      },
    });
  }

  async markSent(id: string, providerMessageId?: string): Promise<void> {
    await this.prisma.notificationLog.update({
      where: { id },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        providerMessageId: providerMessageId ?? null,
        errorMessage: null,
      },
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.prisma.notificationLog.update({
      where: { id },
      data: {
        status: NotificationStatus.FAILED,
        errorMessage: errorMessage.slice(0, 500),
      },
    });
  }

  sanitizeProviderError(error: unknown): string {
    if (error instanceof Error) {
      return error.message.slice(0, 500);
    }
    return 'WhatsApp delivery failed';
  }

  async runLoggedDelivery(args: {
    branchId?: string;
    bookingId?: string;
    changeRequestId?: string;
    type: NotificationType;
    recipientPhoneE164: string;
    send: () => Promise<void>;
  }): Promise<{ id: string; status: NotificationStatus }> {
    const log = await this.createPending({
      branchId: args.branchId,
      bookingId: args.bookingId,
      changeRequestId: args.changeRequestId,
      type: args.type,
      recipientPhone: args.recipientPhoneE164,
    });
    try {
      await args.send();
      await this.markSent(log.id);
      return { id: log.id, status: NotificationStatus.SENT };
    } catch (error) {
      await this.markFailed(log.id, this.sanitizeProviderError(error));
      throw error;
    }
  }

  bookingReminderWhere(bookingIds: string[]): Prisma.NotificationLogWhereInput {
    return {
      bookingId: { in: bookingIds },
      type: {
        in: [
          NotificationType.APPOINTMENT_REMINDER,
          NotificationType.APPOINTMENT_REMINDER_90M,
        ],
      },
      status: NotificationStatus.SENT,
    };
  }
}
