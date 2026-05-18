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

export interface WhatsAppNotificationProvider {
  sendBookingConfirmation(payload: BookingConfirmationPayload): Promise<void>;
  sendBookingRequestReceived(
    payload: BookingRequestReceivedPayload,
  ): Promise<void>;
  sendBookingRejected(payload: BookingRejectedPayload): Promise<void>;
  sendBookingRescheduled(payload: BookingRescheduledPayload): Promise<void>;
  sendAppointmentReminder(payload: AppointmentReminderPayload): Promise<void>;
  sendBookingCancellation(payload: BookingCancellationPayload): Promise<void>;
  sendChangeRequestUpdate(
    payload: ChangeRequestApprovedPayload | ChangeRequestRejectedPayload,
    outcome: 'approved' | 'rejected',
  ): Promise<void>;
}

export const WHATSAPP_NOTIFICATIONS = Symbol('WHATSAPP_NOTIFICATIONS');
