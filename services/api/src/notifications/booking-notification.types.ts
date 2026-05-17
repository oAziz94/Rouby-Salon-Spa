export type BookingNotificationDetails = {
  clientName: string;
  clientPhoneE164: string;
  bookingDateLabel: string;
  bookingTimeLabel: string;
  serviceNames: string;
  branchName?: string;
  salonName: string;
  supportPhone?: string;
};

export type BookingConfirmationPayload = BookingNotificationDetails & {
  bookingId: string;
  branchId: string;
};

export type AppointmentReminderVariant = '24h' | '90m';

export type AppointmentReminderPayload = BookingNotificationDetails & {
  bookingId: string;
  branchId: string;
  reminderVariant: AppointmentReminderVariant;
};

export type BookingCancellationPayload = BookingNotificationDetails & {
  bookingId: string;
  branchId: string;
};

export type ChangeRequestApprovedPayload = BookingNotificationDetails & {
  bookingId: string;
  branchId: string;
  changeRequestId: string;
  newDateLabel: string;
  newTimeLabel: string;
};

export type ChangeRequestRejectedPayload = BookingNotificationDetails & {
  bookingId: string;
  branchId: string;
  changeRequestId: string;
};
