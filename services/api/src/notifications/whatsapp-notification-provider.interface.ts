import type {
  AppointmentReminderPayload,
  BookingCancellationPayload,
  BookingConfirmationPayload,
  ChangeRequestApprovedPayload,
  ChangeRequestRejectedPayload,
} from './booking-notification.types';

export interface WhatsAppNotificationProvider {
  sendBookingConfirmation(payload: BookingConfirmationPayload): Promise<void>;
  sendAppointmentReminder(payload: AppointmentReminderPayload): Promise<void>;
  sendBookingCancellation(payload: BookingCancellationPayload): Promise<void>;
  sendChangeRequestUpdate(
    payload: ChangeRequestApprovedPayload | ChangeRequestRejectedPayload,
    outcome: 'approved' | 'rejected',
  ): Promise<void>;
}

export const WHATSAPP_NOTIFICATIONS = Symbol('WHATSAPP_NOTIFICATIONS');
