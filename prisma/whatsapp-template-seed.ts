import type { Prisma } from "@prisma/client";

/** Variable names supported in templates — stored as JSON array in DB. */
export const WHATSAPP_TEMPLATE_VARIABLES: readonly string[] = [
  "clientName",
  "clientPhone",
  "bookingReference",
  "bookingDate",
  "bookingTime",
  "serviceSummary",
  "services",
  "staffName",
  "bookingStatus",
  "branchName",
  "branchAddress",
  "branchPhone",
  "queueNumber",
  "estimatedWaitTime",
  "invoiceNumber",
  "invoiceTotal",
  "amountPaid",
  "paidAmount",
  "totalAmount",
  "remainingAmount",
  "paymentMethod",
  "receiptLink",
  "salonName",
  "salonPhone",
  "salonAddress",
  "whatsappNumber",
  "bookingLink",
  "rescheduleLink",
  "cancelLink",
];

const varsJson = WHATSAPP_TEMPLATE_VARIABLES as unknown as Prisma.InputJsonValue;

/**
 * Deterministic UUIDs for upsert (dev/staging).
 * Each logical template has `_EN` and `_AR` rows; list/filter by `language` field.
 */
const TPL = {
  BOOKING_REQUEST_RECEIVED_EN: "50000000-0000-4000-8000-000000000001",
  BOOKING_REQUEST_RECEIVED_AR: "50000000-0000-4000-8000-000000000002",
  BOOKING_CONFIRMED_EN: "50000000-0000-4000-8000-000000000003",
  BOOKING_CONFIRMED_AR: "50000000-0000-4000-8000-000000000004",
  BOOKING_RESCHEDULED_EN: "50000000-0000-4000-8000-000000000005",
  BOOKING_RESCHEDULED_AR: "50000000-0000-4000-8000-000000000006",
  BOOKING_CANCELLED_EN: "50000000-0000-4000-8000-000000000007",
  BOOKING_CANCELLED_AR: "50000000-0000-4000-8000-000000000008",
  APPOINTMENT_REMINDER_EN: "50000000-0000-4000-8000-000000000009",
  APPOINTMENT_REMINDER_AR: "50000000-0000-4000-8000-00000000000a",
  DEPOSIT_PAYMENT_CONFIRMATION_EN: "50000000-0000-4000-8000-00000000000b",
  DEPOSIT_PAYMENT_CONFIRMATION_AR: "50000000-0000-4000-8000-00000000000c",
  REVIEW_REQUEST_EN: "50000000-0000-4000-8000-00000000000d",
  REVIEW_REQUEST_AR: "50000000-0000-4000-8000-00000000000e",
} as const;

export const WHATSAPP_TEMPLATE_SEED_ROWS: Array<{
  id: string;
  templateKey: string;
  name: string;
  category: string;
  language: string;
  description: string | null;
  content: string;
  variables: Prisma.InputJsonValue;
}> = [
  {
    id: TPL.BOOKING_REQUEST_RECEIVED_EN,
    templateKey: "BOOKING_REQUEST_RECEIVED_EN",
    name: "Booking request received (English)",
    category: "custom",
    language: "en",
    description: "When a new online booking request is received (pending confirmation).",
    content: `Hello {{clientName}}, your booking request at {{salonName}} has been received.

Date: {{bookingDate}}
Time: {{bookingTime}}
Services: {{serviceSummary}}
Branch: {{branchName}}

Our team will review your request and contact you shortly to confirm your appointment.`,
    variables: varsJson,
  },
  {
    id: TPL.BOOKING_REQUEST_RECEIVED_AR,
    templateKey: "BOOKING_REQUEST_RECEIVED_AR",
    name: "استلام طلب حجز (عربي)",
    category: "custom",
    language: "ar",
    description: "عند استلام طلب حجز جديد عبر الموقع (قيد التأكيد).",
    content: `مرحباً {{clientName}}،

تم استلام طلب الحجز لدى {{salonName}}، وسيتواصل معك الفريق قريباً.

التاريخ: {{bookingDate}}
الوقت: {{bookingTime}}
الخدمات: {{serviceSummary}}
الفرع: {{branchName}}

شكراً لثقتك بنا.`,
    variables: varsJson,
  },
  {
    id: TPL.BOOKING_CONFIRMED_EN,
    templateKey: "BOOKING_CONFIRMED_EN",
    name: "Booking confirmed (English)",
    category: "booking_confirmation",
    language: "en",
    description: "Notify the client that the booking is confirmed.",
    content: `Hello {{clientName}}, your booking at {{salonName}} is confirmed.

Date: {{bookingDate}}
Time: {{bookingTime}}
Services: {{serviceSummary}}
Branch: {{branchName}}
Address: {{branchAddress}}

For cancellation or rescheduling, please contact us at least 24 hours before your appointment.

{{salonName}} — {{branchPhone}}`,
    variables: varsJson,
  },
  {
    id: TPL.BOOKING_CONFIRMED_AR,
    templateKey: "BOOKING_CONFIRMED_AR",
    name: "تأكيد الحجز (عربي)",
    category: "booking_confirmation",
    language: "ar",
    description: "تأكيد الحجز للعميل.",
    content: `مرحباً {{clientName}}،
تم تأكيد حجزك في {{salonName}} يوم {{bookingDate}} الساعة {{bookingTime}}.
الخدمات: {{serviceSummary}}
الفرع: {{branchName}}
العنوان: {{branchAddress}}

للإلغاء أو إعادة الجدولة يرجى التواصل قبل الموعد بـ 24 ساعة على الأقل.

{{salonName}} — {{branchPhone}}`,
    variables: varsJson,
  },
  {
    id: TPL.BOOKING_RESCHEDULED_EN,
    templateKey: "BOOKING_RESCHEDULED_EN",
    name: "Booking rescheduled (English)",
    category: "booking_rescheduled",
    language: "en",
    description: "Notify the client when the appointment time changes.",
    content: `Hello {{clientName}}, your booking at {{salonName}} has been rescheduled.

New date: {{bookingDate}}
New time: {{bookingTime}}
Services: {{serviceSummary}}
Branch: {{branchName}}

Please confirm that this new appointment works for you.`,
    variables: varsJson,
  },
  {
    id: TPL.BOOKING_RESCHEDULED_AR,
    templateKey: "BOOKING_RESCHEDULED_AR",
    name: "إعادة جدولة الحجز (عربي)",
    category: "booking_rescheduled",
    language: "ar",
    description: "إبلاغ العميل بتغيير موعد الموعد.",
    content: `مرحباً {{clientName}}،

تم إعادة جدولة موعدك لدى {{salonName}}.

التاريخ الجديد: {{bookingDate}}
الوقت الجديد: {{bookingTime}}
الخدمات: {{serviceSummary}}
الفرع: {{branchName}}

يرجى التأكد أن الموعد الجديد مناسب لك، ويمكنك الرد علينا لأي استفسار.`,
    variables: varsJson,
  },
  {
    id: TPL.BOOKING_CANCELLED_EN,
    templateKey: "BOOKING_CANCELLED_EN",
    name: "Booking cancelled (English)",
    category: "booking_cancelled",
    language: "en",
    description: "Notify the client that the booking was cancelled.",
    content: `Hello {{clientName}}, your booking at {{salonName}} has been cancelled.

Date: {{bookingDate}}
Time: {{bookingTime}}

You can contact us anytime to book a new appointment. Phone: {{branchPhone}}`,
    variables: varsJson,
  },
  {
    id: TPL.BOOKING_CANCELLED_AR,
    templateKey: "BOOKING_CANCELLED_AR",
    name: "إلغاء الحجز (عربي)",
    category: "booking_cancelled",
    language: "ar",
    description: "إبلاغ العميل بإلغاء الحجز.",
    content: `مرحباً {{clientName}}،

تم إلغاء حجزك لدى {{salonName}}.

كان الموعد: {{bookingDate}} — {{bookingTime}}

يسعدنا حجز موعد جديد في أي وقت. للتواصل: {{branchPhone}}`,
    variables: varsJson,
  },
  {
    id: TPL.APPOINTMENT_REMINDER_EN,
    templateKey: "APPOINTMENT_REMINDER_EN",
    name: "Appointment reminder (English)",
    category: "booking_reminder",
    language: "en",
    description: "Friendly reminder before the visit.",
    content: `Hello {{clientName}}, this is a friendly reminder for your appointment at {{salonName}}.

Date: {{bookingDate}}
Time: {{bookingTime}}
Services: {{serviceSummary}}
Branch: {{branchName}}

See you soon.`,
    variables: varsJson,
  },
  {
    id: TPL.APPOINTMENT_REMINDER_AR,
    templateKey: "APPOINTMENT_REMINDER_AR",
    name: "تذكير بالموعد (عربي)",
    category: "booking_reminder",
    language: "ar",
    description: "تذكير ودي قبل الموعد.",
    content: `مرحباً {{clientName}}،

تذكير لطيف: موعدك غداً/قريباً في {{salonName}}.

التاريخ: {{bookingDate}}
الوقت: {{bookingTime}}
الخدمات: {{serviceSummary}}
الفرع: {{branchName}}

نتطلع لرؤيتك.`,
    variables: varsJson,
  },
  {
    id: TPL.DEPOSIT_PAYMENT_CONFIRMATION_EN,
    templateKey: "DEPOSIT_PAYMENT_CONFIRMATION_EN",
    name: "Payment received (English)",
    category: "payment_received",
    language: "en",
    description: "Confirm a payment or deposit linked to a booking.",
    content: `Hello {{clientName}}, we confirm receiving your payment at {{salonName}}.

Amount: {{amountPaid}}
Booking date: {{bookingDate}}
Time: {{bookingTime}}
Payment method: {{paymentMethod}}

Thank you.`,
    variables: varsJson,
  },
  {
    id: TPL.DEPOSIT_PAYMENT_CONFIRMATION_AR,
    templateKey: "DEPOSIT_PAYMENT_CONFIRMATION_AR",
    name: "تأكيد استلام دفعة (عربي)",
    category: "payment_received",
    language: "ar",
    description: "تأكيد استلام دفعة أو عربون مرتبط بالحجز.",
    content: `مرحباً {{clientName}}،

نؤكد استلام دفعتك في {{salonName}}.

المبلغ: {{amountPaid}}
تاريخ الحجز: {{bookingDate}}
الوقت: {{bookingTime}}
طريقة الدفع: {{paymentMethod}}

شكراً لك.`,
    variables: varsJson,
  },
  {
    id: TPL.REVIEW_REQUEST_EN,
    templateKey: "REVIEW_REQUEST_EN",
    name: "Visit follow-up (English)",
    category: "appointment_follow_up",
    language: "en",
    description: "Post-visit thank you and feedback request.",
    content: `Hello {{clientName}}, thank you for visiting {{salonName}}.

We hope you enjoyed your experience. We would love to hear your feedback.

Please reply with your review or rating.`,
    variables: varsJson,
  },
  {
    id: TPL.REVIEW_REQUEST_AR,
    templateKey: "REVIEW_REQUEST_AR",
    name: "متابعة بعد الزيارة (عربي)",
    category: "appointment_follow_up",
    language: "ar",
    description: "شكر بعد الزيارة وطلب رأي العميل.",
    content: `مرحباً {{clientName}}،

شكراً لزيارتك {{salonName}}.

نأمل أن تكون تجربتك ممتعة. نسعد بسماع رأيك أو تقييمك.

يمكنك الرد على هذه الرسالة برأيك بكل صدق.`,
    variables: varsJson,
  },
];

/**
 * Legacy `templateKey` values (no `_EN` / `_AR` suffix) from older seeds.
 * Removed during seed so they are not confused with bilingual pairs.
 */
export const LEGACY_WHATSAPP_TEMPLATE_KEYS_WITHOUT_SUFFIX: readonly string[] = [
  "BOOKING_REQUEST_RECEIVED",
  "BOOKING_CONFIRMED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
  "APPOINTMENT_REMINDER",
  "DEPOSIT_PAYMENT_CONFIRMATION",
  "REVIEW_REQUEST",
];
