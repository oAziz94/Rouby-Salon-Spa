import type { Prisma } from "@prisma/client";

/** Variable names supported in templates (SRS §11.5) — stored as JSON array in DB. */
export const WHATSAPP_TEMPLATE_VARIABLES: readonly string[] = [
  "clientName",
  "bookingDate",
  "bookingTime",
  "services",
  "branchName",
  "salonPhone",
  "salonAddress",
  "totalAmount",
  "paidAmount",
  "remainingAmount",
];

const varsJson = WHATSAPP_TEMPLATE_VARIABLES as unknown as Prisma.InputJsonValue;

/** Deterministic UUIDs for upsert (dev/staging). */
const TPL = {
  BOOKING_REQUEST_RECEIVED: "50000000-0000-4000-8000-000000000001",
  BOOKING_CONFIRMED: "50000000-0000-4000-8000-000000000002",
  BOOKING_RESCHEDULED: "50000000-0000-4000-8000-000000000003",
  BOOKING_CANCELLED: "50000000-0000-4000-8000-000000000004",
  APPOINTMENT_REMINDER: "50000000-0000-4000-8000-000000000005",
  DEPOSIT_PAYMENT_CONFIRMATION: "50000000-0000-4000-8000-000000000006",
  REVIEW_REQUEST: "50000000-0000-4000-8000-000000000007",
} as const;

export const WHATSAPP_TEMPLATE_SEED_ROWS: Array<{
  id: string;
  templateKey: string;
  name: string;
  content: string;
  variables: Prisma.InputJsonValue;
}> = [
  {
    id: TPL.BOOKING_REQUEST_RECEIVED,
    templateKey: "BOOKING_REQUEST_RECEIVED",
    name: "Booking Request Received",
    content: `Hello {clientName}, your booking request at Alrouby Salon & Spa has been received.

Date: {bookingDate}
Time: {bookingTime}
Services: {services}

Our team will review your request and contact you shortly to confirm your appointment.`,
    variables: varsJson,
  },
  {
    id: TPL.BOOKING_CONFIRMED,
    templateKey: "BOOKING_CONFIRMED",
    name: "Booking Confirmed",
    content: `Hello {clientName}, your booking at Alrouby Salon & Spa is confirmed.

Date: {bookingDate}
Time: {bookingTime}
Services: {services}
Branch: {branchName}

For cancellation or rescheduling, please contact us at least 24 hours before your appointment.

We look forward to seeing you.`,
    variables: varsJson,
  },
  {
    id: TPL.BOOKING_RESCHEDULED,
    templateKey: "BOOKING_RESCHEDULED",
    name: "Booking Rescheduled",
    content: `Hello {clientName}, your booking at Alrouby Salon & Spa has been rescheduled.

New date: {bookingDate}
New time: {bookingTime}
Services: {services}

Please confirm that this new appointment works for you.`,
    variables: varsJson,
  },
  {
    id: TPL.BOOKING_CANCELLED,
    templateKey: "BOOKING_CANCELLED",
    name: "Booking Cancelled",
    content: `Hello {clientName}, your booking at Alrouby Salon & Spa has been cancelled.

Date: {bookingDate}
Time: {bookingTime}

You can contact us anytime to book a new appointment.`,
    variables: varsJson,
  },
  {
    id: TPL.APPOINTMENT_REMINDER,
    templateKey: "APPOINTMENT_REMINDER",
    name: "Appointment Reminder",
    content: `Hello {clientName}, this is a friendly reminder for your appointment at Alrouby Salon & Spa.

Date: {bookingDate}
Time: {bookingTime}
Services: {services}

See you soon.`,
    variables: varsJson,
  },
  {
    id: TPL.DEPOSIT_PAYMENT_CONFIRMATION,
    templateKey: "DEPOSIT_PAYMENT_CONFIRMATION",
    name: "Deposit/Payment Confirmation",
    content: `Hello {clientName}, we confirm receiving your payment/deposit for your booking at Alrouby Salon & Spa.

Amount: {paidAmount}
Booking date: {bookingDate}
Time: {bookingTime}

Thank you.`,
    variables: varsJson,
  },
  {
    id: TPL.REVIEW_REQUEST,
    templateKey: "REVIEW_REQUEST",
    name: "Review Request",
    content: `Hello {clientName}, thank you for visiting Alrouby Salon & Spa.

We hope you enjoyed your experience. We would love to hear your feedback.

Please reply with your review or rating.`,
    variables: varsJson,
  },
];
