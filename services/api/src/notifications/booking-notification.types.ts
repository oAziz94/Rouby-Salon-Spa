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

export type BookingRequestReceivedPayload = BookingNotificationDetails & {
  bookingId: string;
  branchId: string;
};

export type BookingRejectedPayload = BookingNotificationDetails & {
  bookingId: string;
  branchId: string;
};

export type BookingRescheduledPayload = BookingNotificationDetails & {
  bookingId: string;
  branchId: string;
  newDateLabel: string;
  newTimeLabel: string;
};

export type AppointmentReminderVariant = '24h' | '90m';

export type AppointmentReminderPayload = BookingNotificationDetails & {
  bookingId: string;
  branchId: string;
  reminderVariant: AppointmentReminderVariant;
  /** Final reminder lead time in minutes (90m variant only). */
  minutesBeforeFinal?: number;
};

export type BookingCancellationPayload = BookingNotificationDetails & {
  bookingId: string;
  branchId: string;
};

export type ChangeRequestApprovedPayload = BookingRescheduledPayload & {
  changeRequestId: string;
};

export type ChangeRequestRejectedPayload = BookingNotificationDetails & {
  bookingId: string;
  branchId: string;
  changeRequestId: string;
};
