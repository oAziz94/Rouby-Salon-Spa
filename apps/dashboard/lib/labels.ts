/**
 * Human labels for the codes the API speaks. One place, so "IN_PROGRESS" never reaches a
 * receptionist's screen and the same word is used everywhere.
 */

const BOOKING_STATUS: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  RESCHEDULED: "Rescheduled",
  ARRIVED: "Arrived",
  IN_PROGRESS: "In service",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
  NO_SHOW: "No-show",
};

const QUEUE_STATUS: Record<string, string> = {
  WAITING: "Waiting",
  IN_SERVICE: "In service",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

const LINE_STATUS: Record<string, string> = {
  PENDING: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Done",
  CANCELLED: "Removed",
};

const SOURCE: Record<string, string> = {
  WALK_IN: "Walk-in",
  WEBSITE: "Website",
  DASHBOARD: "Front desk",
  PHONE: "Phone",
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  BOOKING: "Booking",
};

const PAYMENT_STATUS: Record<string, string> = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partly paid",
  UNPAID: "Unpaid",
  REFUNDED: "Refunded",
  PENDING: "Pending",
};

function fallback(code: string | null | undefined): string {
  if (!code) return "—";
  const words = code.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function bookingStatusLabel(code: string | null | undefined): string {
  return (code && BOOKING_STATUS[code]) || fallback(code);
}

export function queueStatusLabel(code: string | null | undefined): string {
  return (code && QUEUE_STATUS[code]) || fallback(code);
}

export function lineStatusLabel(code: string | null | undefined): string {
  return (code && LINE_STATUS[code]) || LINE_STATUS.PENDING;
}

export function sourceLabel(code: string | null | undefined): string {
  return (code && SOURCE[code]) || fallback(code);
}

export function paymentStatusLabel(code: string | null | undefined): string {
  return (code && PAYMENT_STATUS[code]) || fallback(code);
}

const ITEM_TYPE: Record<string, string> = {
  SERVICE: "Service",
  SERVICE_VARIANT: "Service",
  PACKAGE: "Package",
  BUNDLE: "Bundle",
  SERVICE_ENHANCEMENT: "Add-on",
};

export function itemTypeLabel(code: string | null | undefined): string {
  return (code && ITEM_TYPE[code]) || fallback(code);
}
