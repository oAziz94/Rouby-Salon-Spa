import { Injectable, Logger } from '@nestjs/common';
import type { WhatsAppNotificationProvider } from './whatsapp-notification-provider.interface';
import type {
  AppointmentReminderPayload,
  BookingCancellationPayload,
  BookingConfirmationPayload,
  BookingRejectedPayload,
  BookingRequestReceivedPayload,
  BookingRescheduledPayload,
  ChangeRequestApprovedPayload,
  ChangeRequestRejectedPayload,
} from './booking-notification.types';

@Injectable()
export class DummyWhatsAppNotificationProvider implements WhatsAppNotificationProvider {
  private readonly logger = new Logger(DummyWhatsAppNotificationProvider.name);

  sendBookingConfirmation(payload: BookingConfirmationPayload): Promise<void> {
    this.logger.debug(
      `Notifications disabled: skip booking confirmation for booking ${payload.bookingId}`,
    );
    return Promise.resolve();
  }

  sendBookingRequestReceived(
    payload: BookingRequestReceivedPayload,
  ): Promise<void> {
    this.logger.debug(
      `Notifications disabled: skip booking request received for booking ${payload.bookingId}`,
    );
    return Promise.resolve();
  }

  sendBookingRejected(payload: BookingRejectedPayload): Promise<void> {
    this.logger.debug(
      `Notifications disabled: skip booking rejection for booking ${payload.bookingId}`,
    );
    return Promise.resolve();
  }

  sendBookingRescheduled(payload: BookingRescheduledPayload): Promise<void> {
    this.logger.debug(
      `Notifications disabled: skip booking reschedule for booking ${payload.bookingId}`,
    );
    return Promise.resolve();
  }

  sendAppointmentReminder(payload: AppointmentReminderPayload): Promise<void> {
    this.logger.debug(
      `Notifications disabled: skip reminder for booking ${payload.bookingId}`,
    );
    return Promise.resolve();
  }

  sendBookingCancellation(payload: BookingCancellationPayload): Promise<void> {
    this.logger.debug(
      `Notifications disabled: skip cancellation for booking ${payload.bookingId}`,
    );
    return Promise.resolve();
  }

  sendChangeRequestUpdate(
    payload: ChangeRequestApprovedPayload | ChangeRequestRejectedPayload,
    outcome: 'approved' | 'rejected',
  ): Promise<void> {
    this.logger.debug(
      `Notifications disabled: skip change request ${outcome} for ${payload.changeRequestId}`,
    );
    return Promise.resolve();
  }
}
