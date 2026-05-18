import type {
  BookingCancellationPayload,
  BookingConfirmationPayload,
  BookingRejectedPayload,
  BookingRequestReceivedPayload,
  BookingRescheduledPayload,
  ChangeRequestApprovedPayload,
  ChangeRequestRejectedPayload,
  AppointmentReminderPayload,
} from './booking-notification.types';

function supportLine(supportPhone?: string): string {
  return supportPhone?.trim()
    ? `For help, call us at ${supportPhone.trim()}.`
    : '';
}

function branchLine(branchName?: string): string {
  return branchName?.trim() ? `Branch: ${branchName.trim()}` : '';
}

function appendOptionalLines(
  lines: string[],
  branchName?: string,
  supportPhone?: string,
): string[] {
  const branch = branchLine(branchName);
  if (branch) {
    lines.push(branch);
  }
  const support = supportLine(supportPhone);
  if (support) {
    lines.push(support);
  }
  return lines;
}

export function buildBookingConfirmationMessage(
  payload: BookingConfirmationPayload,
): string {
  const lines = [
    `Hello ${payload.clientName}, your booking at ${payload.salonName} is confirmed.`,
    `Date: ${payload.bookingDateLabel}`,
    `Time: ${payload.bookingTimeLabel}`,
    `Services: ${payload.serviceNames}`,
  ];
  return appendOptionalLines(
    lines,
    payload.branchName,
    payload.supportPhone,
  ).join('\n');
}

export function buildBookingRequestReceivedMessage(
  payload: BookingRequestReceivedPayload,
): string {
  const lines = [
    `Hello ${payload.clientName}, your booking request at ${payload.salonName} has been received.`,
    `Date: ${payload.bookingDateLabel}`,
    `Time: ${payload.bookingTimeLabel}`,
    `Services: ${payload.serviceNames}`,
    '',
    'Our team will review your request and contact you shortly to confirm your appointment.',
  ];
  return appendOptionalLines(
    lines,
    payload.branchName,
    payload.supportPhone,
  ).join('\n');
}

export function buildBookingRejectedMessage(
  payload: BookingRejectedPayload,
): string {
  const lines = [
    `Hello ${payload.clientName}, we could not confirm your booking request at ${payload.salonName}.`,
    `Date: ${payload.bookingDateLabel}`,
    `Time: ${payload.bookingTimeLabel}`,
    `Services: ${payload.serviceNames}`,
    '',
    'You can contact us anytime to book a new appointment.',
  ];
  const support = supportLine(payload.supportPhone);
  if (support) {
    lines.push(support);
  }
  return lines.join('\n');
}

export function buildBookingRescheduledMessage(
  payload: BookingRescheduledPayload,
): string {
  const lines = [
    `Hello ${payload.clientName}, your booking at ${payload.salonName} has been rescheduled.`,
    `New date: ${payload.newDateLabel}`,
    `New time: ${payload.newTimeLabel}`,
    `Services: ${payload.serviceNames}`,
  ];
  return appendOptionalLines(
    lines,
    payload.branchName,
    payload.supportPhone,
  ).join('\n');
}

export function buildAppointmentReminderMessage(
  payload: AppointmentReminderPayload,
): string {
  const intro =
    payload.reminderVariant === '90m'
      ? `Hello ${payload.clientName}, your appointment at ${payload.salonName} starts in ${formatFinalReminderLead(payload.minutesBeforeFinal)}.`
      : `Hello ${payload.clientName}, this is a friendly reminder for your appointment at ${payload.salonName}.`;
  const lines = [
    intro,
    `Date: ${payload.bookingDateLabel}`,
    `Time: ${payload.bookingTimeLabel}`,
    `Services: ${payload.serviceNames}`,
  ];
  return appendOptionalLines(
    lines,
    payload.branchName,
    payload.supportPhone,
  ).join('\n');
}

function formatFinalReminderLead(minutes?: number): string {
  const lead = minutes && minutes > 0 ? minutes : 90;
  if (lead === 1) {
    return 'about 1 minute';
  }
  if (lead < 60) {
    return `less than ${lead} minutes`;
  }
  if (lead === 60) {
    return 'about 1 hour';
  }
  if (lead % 60 === 0) {
    const hours = lead / 60;
    return hours === 1 ? 'about 1 hour' : `about ${hours} hours`;
  }
  return `less than ${lead} minutes`;
}

export function buildBookingCancellationMessage(
  payload: BookingCancellationPayload,
): string {
  const lines = [
    `Hello ${payload.clientName}, your appointment at ${payload.salonName} has been cancelled.`,
    `Date: ${payload.bookingDateLabel}`,
    `Time: ${payload.bookingTimeLabel}`,
    `Services: ${payload.serviceNames}`,
    '',
    'You can contact us anytime to book a new appointment.',
  ];
  const support = supportLine(payload.supportPhone);
  if (support) {
    lines.push(support);
  }
  return lines.join('\n');
}

export function buildChangeRequestApprovedMessage(
  payload: ChangeRequestApprovedPayload,
): string {
  return buildBookingRescheduledMessage(payload);
}

export function buildChangeRequestRejectedMessage(
  payload: ChangeRequestRejectedPayload,
): string {
  const lines = [
    `Hello ${payload.clientName}, we could not approve your requested booking change at ${payload.salonName}.`,
    `Your appointment remains scheduled for:`,
    `Date: ${payload.bookingDateLabel}`,
    `Time: ${payload.bookingTimeLabel}`,
    `Services: ${payload.serviceNames}`,
  ];
  const support = supportLine(payload.supportPhone);
  if (support) {
    lines.push(support);
  } else {
    lines.push('Please contact the salon if you need assistance.');
  }
  return lines.join('\n');
}
