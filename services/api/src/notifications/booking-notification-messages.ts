import type {
  BookingCancellationPayload,
  BookingConfirmationPayload,
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

export function buildBookingConfirmationMessage(
  payload: BookingConfirmationPayload,
): string {
  const lines = [
    `Hello ${payload.clientName}, your booking at ${payload.salonName} is confirmed.`,
    `Date: ${payload.bookingDateLabel}`,
    `Time: ${payload.bookingTimeLabel}`,
    `Services: ${payload.serviceNames}`,
  ];
  const branch = branchLine(payload.branchName);
  if (branch) {
    lines.push(branch);
  }
  const support = supportLine(payload.supportPhone);
  if (support) {
    lines.push(support);
  }
  return lines.join('\n');
}

export function buildAppointmentReminderMessage(
  payload: AppointmentReminderPayload,
): string {
  const intro =
    payload.reminderVariant === '90m'
      ? `Hello ${payload.clientName}, your appointment at ${payload.salonName} starts in less than 90 minutes.`
      : `Hello ${payload.clientName}, this is a friendly reminder from ${payload.salonName}. Your appointment is tomorrow.`;
  const lines = [
    intro,
    `Date: ${payload.bookingDateLabel}`,
    `Time: ${payload.bookingTimeLabel}`,
    `Services: ${payload.serviceNames}`,
  ];
  const branch = branchLine(payload.branchName);
  if (branch) {
    lines.push(branch);
  }
  const support = supportLine(payload.supportPhone);
  if (support) {
    lines.push(support);
  }
  return lines.join('\n');
}

export function buildBookingCancellationMessage(
  payload: BookingCancellationPayload,
): string {
  const lines = [
    `Hello ${payload.clientName}, your appointment at ${payload.salonName} has been cancelled.`,
    `Date: ${payload.bookingDateLabel}`,
    `Time: ${payload.bookingTimeLabel}`,
    `Services: ${payload.serviceNames}`,
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
  const lines = [
    `Hello ${payload.clientName}, your booking change at ${payload.salonName} has been approved.`,
    `New date: ${payload.newDateLabel}`,
    `New time: ${payload.newTimeLabel}`,
    `Services: ${payload.serviceNames}`,
  ];
  const branch = branchLine(payload.branchName);
  if (branch) {
    lines.push(branch);
  }
  const support = supportLine(payload.supportPhone);
  if (support) {
    lines.push(support);
  }
  return lines.join('\n');
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
