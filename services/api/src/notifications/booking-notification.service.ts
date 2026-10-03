import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingChangeRequestStatus,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  bookingSlotStartUtcMs,
  formatBookingDateLabel,
  formatBookingTimeLabel,
} from './booking-slot-format';
import {
  is24HourReminderDue,
  is90MinuteReminderDue,
  reminderComparisonNowMs,
} from './booking-reminder-timing';
import type {
  AppointmentReminderVariant,
  ChangeRequestApprovedPayload,
  ChangeRequestRejectedPayload,
} from './booking-notification.types';
import { NotificationConfigService } from './notification-config.service';
import { NotificationLogService } from './notification-log.service';
import {
  WHATSAPP_NOTIFICATIONS,
  type WhatsAppNotificationProvider,
} from './whatsapp-notification-provider.interface';

type BookingWithRelations = NonNullable<
  Awaited<ReturnType<BookingNotificationService['loadBookingContext']>>
>;

function requireBooking(
  row: BookingWithRelations | null,
  bookingId: string,
): BookingWithRelations {
  if (!row) {
    throw new Error(`Booking not found: ${bookingId}`);
  }
  return row;
}

@Injectable()
export class BookingNotificationService {
  private readonly logger = new Logger(BookingNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: NotificationConfigService,
    private readonly logs: NotificationLogService,
    @Inject(WHATSAPP_NOTIFICATIONS)
    private readonly whatsapp: WhatsAppNotificationProvider,
  ) {}

  notifyBookingConfirmed(bookingId: string): void {
    void this.safeRun(async () => {
      if (!this.config.isEnabled()) {
        this.logger.debug(
          `Skipping booking confirmation for ${bookingId}: NOTIFICATIONS_ENABLED is not true`,
        );
        return;
      }
      await this.deliverBookingConfirmation(bookingId);
      await this.deliver24HourReminderIfWithinWindow(bookingId);
      await this.deliver90MinuteReminderIfWithinWindow(bookingId);
    });
  }

  notifyBookingRequestReceived(bookingId: string): void {
    void this.safeRun(async () => {
      if (!this.config.isEnabled()) {
        return;
      }
      await this.deliverBookingRequestReceived(bookingId);
    });
  }

  notifyBookingRejected(bookingId: string): void {
    void this.safeRun(async () => {
      if (!this.config.isEnabled()) {
        return;
      }
      await this.deliverBookingRejected(bookingId);
    });
  }

  notifyBookingRescheduled(bookingId: string): void {
    void this.safeRun(async () => {
      if (!this.config.isEnabled()) {
        return;
      }
      await this.deliverBookingRescheduled(bookingId);
    });
  }

  notifyBookingCancelled(bookingId: string): void {
    void this.safeRun(async () => {
      if (!this.config.isEnabled()) {
        return;
      }
      await this.deliverBookingCancellation(bookingId);
    });
  }

  notifyChangeRequestApproved(changeRequestId: string): void {
    void this.safeRun(async () => {
      if (!this.config.isEnabled()) {
        return;
      }
      const row = await this.prisma.bookingChangeRequest.findUnique({
        where: { id: changeRequestId },
        select: { status: true },
      });
      if (!row || row.status !== BookingChangeRequestStatus.APPROVED) {
        return;
      }
      if (
        await this.logs.hasSuccessfulChangeRequestNotification(changeRequestId)
      ) {
        return;
      }
      await this.deliverChangeRequestUpdate(changeRequestId);
    });
  }

  notifyChangeRequestRejected(changeRequestId: string): void {
    void this.safeRun(async () => {
      if (!this.config.isEnabled()) {
        return;
      }
      const row = await this.prisma.bookingChangeRequest.findUnique({
        where: { id: changeRequestId },
        select: { status: true },
      });
      if (!row || row.status !== BookingChangeRequestStatus.REJECTED) {
        return;
      }
      if (
        await this.logs.hasSuccessfulChangeRequestNotification(changeRequestId)
      ) {
        return;
      }
      await this.deliverChangeRequestUpdate(changeRequestId);
    });
  }

  async retryFailedNotificationLog(
    logId: string,
  ): Promise<{ id: string; status: NotificationStatus }> {
    if (!this.config.isEnabled()) {
      throw new BadRequestException({
        statusCode: 400,
        message:
          'WhatsApp notifications are disabled. Set NOTIFICATIONS_ENABLED=true.',
        error: 'Bad Request',
        code: 'NOTIFICATIONS_DISABLED',
      });
    }

    const log = await this.prisma.notificationLog.findUnique({
      where: { id: logId },
      include: { changeRequest: true },
    });
    if (!log) {
      throw new NotFoundException('Notification log not found');
    }
    if (log.status !== NotificationStatus.FAILED) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Only failed notifications can be retried.',
        error: 'Bad Request',
        code: 'NOTIFICATION_NOT_RETRYABLE',
      });
    }

    let result: { id: string; status: NotificationStatus } | null = null;
    switch (log.type) {
      case NotificationType.BOOKING_CONFIRMATION:
        if (!log.bookingId) {
          throw new BadRequestException('Notification is missing bookingId');
        }
        result = await this.deliverBookingConfirmation(log.bookingId, {
          force: true,
        });
        break;
      case NotificationType.BOOKING_REQUEST_RECEIVED:
        if (!log.bookingId) {
          throw new BadRequestException('Notification is missing bookingId');
        }
        result = await this.deliverBookingRequestReceived(log.bookingId, {
          force: true,
        });
        break;
      case NotificationType.BOOKING_REJECTED:
        if (!log.bookingId) {
          throw new BadRequestException('Notification is missing bookingId');
        }
        result = await this.deliverBookingRejected(log.bookingId, {
          force: true,
        });
        break;
      case NotificationType.BOOKING_RESCHEDULED:
        if (!log.bookingId) {
          throw new BadRequestException('Notification is missing bookingId');
        }
        result = await this.deliverBookingRescheduled(log.bookingId);
        break;
      case NotificationType.BOOKING_CANCELLATION:
        if (!log.bookingId) {
          throw new BadRequestException('Notification is missing bookingId');
        }
        result = await this.deliverBookingCancellation(log.bookingId, {
          force: true,
        });
        break;
      case NotificationType.APPOINTMENT_REMINDER:
      case NotificationType.APPOINTMENT_REMINDER_90M:
        if (!log.bookingId) {
          throw new BadRequestException('Notification is missing bookingId');
        }
        result = await this.deliverAppointmentReminder(
          log.bookingId,
          log.type,
          {
            force: true,
          },
        );
        break;
      case NotificationType.CHANGE_REQUEST_UPDATE:
        if (!log.changeRequestId) {
          throw new BadRequestException(
            'Notification is missing changeRequestId',
          );
        }
        result = await this.deliverChangeRequestUpdate(log.changeRequestId, {
          force: true,
        });
        break;
      default:
        throw new BadRequestException('Unsupported notification type');
    }
    if (!result) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Notification could not be retried.',
        error: 'Bad Request',
        code: 'NOTIFICATION_RETRY_FAILED',
      });
    }
    return result;
  }

  /** Catch-up when staff confirms inside the ~24h reminder window (but outside 90m). */
  async deliver24HourReminderIfWithinWindow(bookingId: string): Promise<void> {
    if (!this.config.isEnabled()) {
      return;
    }
    const ctx = await this.loadBookingContext(bookingId);
    if (!ctx) {
      return;
    }
    const slotMs = bookingSlotStartUtcMs(ctx.slot);
    if (slotMs === null) {
      return;
    }
    if (
      !is24HourReminderDue(
        slotMs,
        reminderComparisonNowMs(),
        this.config.getReminderHoursBefore(),
        this.config.getReminderMinutesBeforeFinal(),
      )
    ) {
      return;
    }
    await this.deliverAppointmentReminder(
      bookingId,
      NotificationType.APPOINTMENT_REMINDER,
    );
  }

  /** Same-day catch-up when staff confirms inside the final reminder window. */
  async deliver90MinuteReminderIfWithinWindow(
    bookingId: string,
  ): Promise<void> {
    if (!this.config.isEnabled()) {
      return;
    }
    const ctx = await this.loadBookingContext(bookingId);
    if (!ctx) {
      return;
    }
    const slotMs = bookingSlotStartUtcMs(ctx.slot);
    if (slotMs === null) {
      return;
    }
    if (
      !is90MinuteReminderDue(
        slotMs,
        reminderComparisonNowMs(),
        this.config.getReminderMinutesBeforeFinal(),
      )
    ) {
      return;
    }
    await this.deliverAppointmentReminder(
      bookingId,
      NotificationType.APPOINTMENT_REMINDER_90M,
    );
  }

  async sendAppointmentReminderForBooking(
    bookingId: string,
    type:
      | typeof NotificationType.APPOINTMENT_REMINDER
      | typeof NotificationType.APPOINTMENT_REMINDER_90M,
  ): Promise<boolean> {
    if (!this.config.isEnabled()) {
      return false;
    }
    try {
      const sent = await this.deliverAppointmentReminder(bookingId, type);
      return Boolean(sent);
    } catch {
      return false;
    }
  }

  private async deliverBookingConfirmation(
    bookingId: string,
    opts?: { force?: boolean },
  ): Promise<{ id: string; status: NotificationStatus } | null> {
    if (
      !opts?.force &&
      (await this.logs.hasSuccessfulBookingNotification(
        bookingId,
        NotificationType.BOOKING_CONFIRMATION,
      ))
    ) {
      return null;
    }
    const ctx = requireBooking(
      await this.loadBookingContext(bookingId),
      bookingId,
    );
    const payload = await this.toPayload(ctx);
    return this.logs.runLoggedDelivery({
      branchId: ctx.branchId,
      bookingId,
      type: NotificationType.BOOKING_CONFIRMATION,
      recipientPhoneE164: ctx.client.phone,
      send: () => this.whatsapp.sendBookingConfirmation(payload),
    });
  }

  private async deliverBookingRequestReceived(
    bookingId: string,
    opts?: { force?: boolean },
  ): Promise<{ id: string; status: NotificationStatus } | null> {
    if (
      !opts?.force &&
      (await this.logs.hasSuccessfulBookingNotification(
        bookingId,
        NotificationType.BOOKING_REQUEST_RECEIVED,
      ))
    ) {
      return null;
    }
    const ctx = requireBooking(
      await this.loadBookingContext(bookingId),
      bookingId,
    );
    const payload = await this.toPayload(ctx);
    return this.logs.runLoggedDelivery({
      branchId: ctx.branchId,
      bookingId,
      type: NotificationType.BOOKING_REQUEST_RECEIVED,
      recipientPhoneE164: ctx.client.phone,
      send: () => this.whatsapp.sendBookingRequestReceived(payload),
    });
  }

  private async deliverBookingRejected(
    bookingId: string,
    opts?: { force?: boolean },
  ): Promise<{ id: string; status: NotificationStatus } | null> {
    if (
      !opts?.force &&
      (await this.logs.hasSuccessfulBookingNotification(
        bookingId,
        NotificationType.BOOKING_REJECTED,
      ))
    ) {
      return null;
    }
    const ctx = requireBooking(
      await this.loadBookingContext(bookingId),
      bookingId,
    );
    const payload = await this.toPayload(ctx);
    return this.logs.runLoggedDelivery({
      branchId: ctx.branchId,
      bookingId,
      type: NotificationType.BOOKING_REJECTED,
      recipientPhoneE164: ctx.client.phone,
      send: () => this.whatsapp.sendBookingRejected(payload),
    });
  }

  private async deliverBookingRescheduled(
    bookingId: string,
  ): Promise<{ id: string; status: NotificationStatus } | null> {
    const ctx = requireBooking(
      await this.loadBookingContext(bookingId),
      bookingId,
    );
    const payload = await this.toRescheduledPayload(ctx);
    return this.logs.runLoggedDelivery({
      branchId: ctx.branchId,
      bookingId,
      type: NotificationType.BOOKING_RESCHEDULED,
      recipientPhoneE164: ctx.client.phone,
      send: () => this.whatsapp.sendBookingRescheduled(payload),
    });
  }

  private async deliverBookingCancellation(
    bookingId: string,
    opts?: { force?: boolean },
  ): Promise<{ id: string; status: NotificationStatus } | null> {
    if (
      !opts?.force &&
      (await this.logs.hasSuccessfulBookingNotification(
        bookingId,
        NotificationType.BOOKING_CANCELLATION,
      ))
    ) {
      return null;
    }
    const ctx = requireBooking(
      await this.loadBookingContext(bookingId),
      bookingId,
    );
    const payload = await this.toPayload(ctx);
    return this.logs.runLoggedDelivery({
      branchId: ctx.branchId,
      bookingId,
      type: NotificationType.BOOKING_CANCELLATION,
      recipientPhoneE164: ctx.client.phone,
      send: () => this.whatsapp.sendBookingCancellation(payload),
    });
  }

  private async deliverAppointmentReminder(
    bookingId: string,
    type:
      | typeof NotificationType.APPOINTMENT_REMINDER
      | typeof NotificationType.APPOINTMENT_REMINDER_90M,
    opts?: { force?: boolean },
  ): Promise<{ id: string; status: NotificationStatus } | null> {
    if (
      !opts?.force &&
      ((await this.logs.hasSuccessfulBookingNotification(bookingId, type)) ||
        (await this.logs.hasExhaustedAutomaticAttempts(bookingId, type)))
    ) {
      return null;
    }
    const ctx = requireBooking(
      await this.loadBookingContext(bookingId),
      bookingId,
    );
    const reminderVariant: AppointmentReminderVariant =
      type === NotificationType.APPOINTMENT_REMINDER_90M ? '90m' : '24h';
    const payload = {
      ...(await this.toPayload(ctx)),
      reminderVariant,
      minutesBeforeFinal:
        reminderVariant === '90m'
          ? this.config.getReminderMinutesBeforeFinal()
          : undefined,
    };
    return this.logs.runLoggedDelivery({
      branchId: ctx.branchId,
      bookingId,
      type,
      recipientPhoneE164: ctx.client.phone,
      send: () => this.whatsapp.sendAppointmentReminder(payload),
    });
  }

  private async deliverChangeRequestUpdate(
    changeRequestId: string,
    opts?: { force?: boolean },
  ): Promise<{ id: string; status: NotificationStatus } | null> {
    const row = await this.prisma.bookingChangeRequest.findUnique({
      where: { id: changeRequestId },
      include: {
        booking: {
          include: {
            branch: true,
            client: true,
            slot: true,
            items: { orderBy: { createdAt: 'asc' } },
          },
        },
        requestedSlot: true,
      },
    });
    if (!row) {
      throw new NotFoundException('Change request not found');
    }

    if (row.status === BookingChangeRequestStatus.APPROVED) {
      if (
        !opts?.force &&
        (await this.logs.hasSuccessfulChangeRequestNotification(
          changeRequestId,
        ))
      ) {
        return null;
      }
      const slot = row.requestedSlot ?? row.booking.slot;
      const base = requireBooking(
        await this.loadBookingContext(row.bookingId),
        row.bookingId,
      );
      const payload: ChangeRequestApprovedPayload = {
        ...(await this.toRescheduledPayload(base, slot)),
        changeRequestId,
      };
      return this.logs.runLoggedDelivery({
        branchId: base.branchId,
        bookingId: row.bookingId,
        changeRequestId,
        type: NotificationType.CHANGE_REQUEST_UPDATE,
        recipientPhoneE164: base.client.phone,
        send: () => this.whatsapp.sendChangeRequestUpdate(payload, 'approved'),
      });
    }

    if (row.status === BookingChangeRequestStatus.REJECTED) {
      if (
        !opts?.force &&
        (await this.logs.hasSuccessfulChangeRequestNotification(
          changeRequestId,
        ))
      ) {
        return null;
      }
      const ctx = requireBooking(
        await this.loadBookingContext(row.bookingId),
        row.bookingId,
      );
      const payload: ChangeRequestRejectedPayload = {
        ...(await this.toPayload(ctx)),
        changeRequestId,
      };
      return this.logs.runLoggedDelivery({
        branchId: ctx.branchId,
        bookingId: row.bookingId,
        changeRequestId,
        type: NotificationType.CHANGE_REQUEST_UPDATE,
        recipientPhoneE164: ctx.client.phone,
        send: () => this.whatsapp.sendChangeRequestUpdate(payload, 'rejected'),
      });
    }

    throw new BadRequestException({
      statusCode: 400,
      message:
        'Change request must be approved or rejected before resending its notification.',
      error: 'Bad Request',
      code: 'CHANGE_REQUEST_NOT_RESOLVED',
    });
  }

  private async loadBookingContext(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        branch: true,
        client: true,
        slot: true,
        items: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  private async loadSalonSettings() {
    const row = await this.prisma.systemSettings.findFirst({
      select: {
        salonName: true,
        phone: true,
        whatsappNumber: true,
      },
    });
    return {
      salonName: row?.salonName?.trim() || 'AlRouby Beauty Salon & Spa',
      phone: row?.phone?.trim() || '',
      whatsappNumber: row?.whatsappNumber?.trim() || '',
    };
  }

  private async toPayload(ctx: BookingWithRelations) {
    const settings = await this.loadSalonSettings();
    const serviceNames = this.formatServiceNames(ctx);
    return {
      bookingId: ctx.id,
      branchId: ctx.branchId,
      clientName: ctx.client.fullName,
      clientPhoneE164: ctx.client.phone,
      bookingDateLabel: formatBookingDateLabel(ctx.slot.date),
      bookingTimeLabel: formatBookingTimeLabel(ctx.slot.startTime),
      serviceNames,
      branchName: ctx.branch.name,
      salonName: settings.salonName,
      supportPhone: this.resolveSupportPhone(ctx.branch, settings),
    };
  }

  private async toRescheduledPayload(
    ctx: BookingWithRelations,
    slot: BookingWithRelations['slot'] = ctx.slot,
  ) {
    const base = await this.toPayload(ctx);
    return {
      ...base,
      newDateLabel: formatBookingDateLabel(slot.date),
      newTimeLabel: formatBookingTimeLabel(slot.startTime),
    };
  }

  private formatServiceNames(ctx: BookingWithRelations): string {
    const names = ctx.items
      .map((it) =>
        it.quantity > 1
          ? `${it.nameSnapshot} x${it.quantity}`
          : it.nameSnapshot,
      )
      .join(', ');
    return names || '—';
  }

  private resolveSupportPhone(
    branch: { phone: string; whatsapp: string },
    settings: { phone: string; whatsappNumber: string },
  ): string | undefined {
    const candidate =
      branch.phone?.trim() ||
      branch.whatsapp?.trim() ||
      settings.phone ||
      settings.whatsappNumber;
    return candidate || undefined;
  }

  private async safeRun(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.logger.warn(
        `Booking notification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
