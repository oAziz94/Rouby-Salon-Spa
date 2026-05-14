/** Variables documented for salon WhatsApp templates (single source for validation). */
export const WHATSAPP_TEMPLATE_KNOWN_VARIABLE_KEYS = [
  'clientName',
  'clientPhone',
  'bookingReference',
  'bookingDate',
  'bookingTime',
  'serviceSummary',
  'services',
  'staffName',
  'bookingStatus',
  'branchName',
  'branchAddress',
  'branchPhone',
  'queueNumber',
  'estimatedWaitTime',
  'invoiceNumber',
  'invoiceTotal',
  'amountPaid',
  'remainingAmount',
  'paymentMethod',
  'receiptLink',
  'salonName',
  'salonPhone',
  'salonAddress',
  'whatsappNumber',
  'bookingLink',
  'rescheduleLink',
  'cancelLink',
  'totalAmount',
  'paidAmount',
] as const;

export type WhatsappTemplateKnownVariableKey =
  (typeof WHATSAPP_TEMPLATE_KNOWN_VARIABLE_KEYS)[number];

const KNOWN_SET = new Set<string>(WHATSAPP_TEMPLATE_KNOWN_VARIABLE_KEYS);

export function isKnownWhatsappTemplateVariable(name: string): boolean {
  return KNOWN_SET.has(name);
}

/** Default sample map for previews (English). */
export const WHATSAPP_TEMPLATE_DEFAULT_SAMPLE_DATA: Record<string, string> = {
  clientName: 'Sara Ahmed',
  clientPhone: '01000000000',
  salonName: 'Alrouby Salon & Spa',
  branchName: 'Alrouby Main',
  branchAddress: 'Alexandria',
  branchPhone: '+20 15 1110 0956',
  bookingReference: 'BK-1024',
  bookingDate: '15 May 2026',
  bookingTime: '6:30 PM',
  serviceSummary: 'Hair Styling, Manicure',
  services: 'Hair Styling, Manicure',
  staffName: 'Nour',
  bookingStatus: 'Confirmed',
  queueNumber: '12',
  estimatedWaitTime: '25 min',
  invoiceNumber: 'INV-1024',
  invoiceTotal: 'EGP 1,250',
  amountPaid: 'EGP 1,250',
  paidAmount: 'EGP 1,250',
  totalAmount: 'EGP 1,250',
  remainingAmount: 'EGP 0',
  paymentMethod: 'Cash',
  receiptLink: 'https://example.com/receipt',
  salonAddress: 'Alexandria',
  whatsappNumber: '+20 15 1110 0956',
  bookingLink: 'https://example.com/booking',
  rescheduleLink: 'https://example.com/reschedule',
  cancelLink: 'https://example.com/cancel',
};

/** Arabic sample values for previews when template language is `ar`. */
export const WHATSAPP_TEMPLATE_DEFAULT_SAMPLE_DATA_AR: Record<string, string> =
  {
    clientName: 'سارة أحمد',
    clientPhone: '٠١٠٠٠٠٠٠٠٠٠',
    salonName: 'صالون وسبا الروبي',
    branchName: 'فرع الروبي الرئيسي',
    branchAddress: 'الإسكندرية، مصر',
    branchPhone: '+٢٠ ١٥ ١١١٠ ٠٩٥٦',
    bookingReference: 'حجز-١٠٢٤',
    bookingDate: '١٥ مايو ٢٠٢٦',
    bookingTime: '٦:٣٠ مساءً',
    serviceSummary: 'تصفيف شعر، مانيكير',
    services: 'تصفيف شعر، مانيكير',
    staffName: 'نور',
    bookingStatus: 'مؤكد',
    queueNumber: '١٢',
    estimatedWaitTime: 'حوالي ٢٥ دقيقة',
    invoiceNumber: 'فاتورة-١٠٢٤',
    invoiceTotal: '١٬٢٥٠ ج.م.',
    amountPaid: '١٬٢٥٠ ج.م.',
    paidAmount: '١٬٢٥٠ ج.م.',
    totalAmount: '١٬٢٥٠ ج.م.',
    remainingAmount: '٠ ج.م.',
    paymentMethod: 'نقدي',
    receiptLink: 'https://example.com/receipt',
    salonAddress: 'الإسكندرية',
    whatsappNumber: '+٢٠ ١٥ ١١١٠ ٠٩٥٦',
    bookingLink: 'https://example.com/booking',
    rescheduleLink: 'https://example.com/reschedule',
    cancelLink: 'https://example.com/cancel',
  };

export const WHATSAPP_TEMPLATE_CATEGORIES = [
  'booking_confirmation',
  'booking_reminder',
  'booking_rescheduled',
  'booking_cancelled',
  'walk_in_created',
  'queue_turn_reminder',
  'visit_completed',
  'invoice_created',
  'payment_received',
  'receipt_ready',
  'appointment_follow_up',
  'birthday_greeting',
  'promotion_message',
  'custom',
] as const;

export type WhatsappTemplateCategory =
  (typeof WHATSAPP_TEMPLATE_CATEGORIES)[number];

export function isValidWhatsappTemplateCategory(
  value: string,
): value is WhatsappTemplateCategory {
  return (WHATSAPP_TEMPLATE_CATEGORIES as readonly string[]).includes(value);
}

/** Extract `{{name}}` and `{name}` placeholders from template body. */
export function extractWhatsappTemplatePlaceholderKeys(body: string): string[] {
  const found = new Set<string>();
  const double = /\{\{([a-zA-Z0-9_]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = double.exec(body)) !== null) {
    found.add(m[1]);
  }
  const normalized = body.replace(
    /\{\{([a-zA-Z0-9_]+)\}\}/g,
    (_, key: string) => `{${key}}`,
  );
  const single = /\{([a-zA-Z0-9_]+)\}/g;
  while ((m = single.exec(normalized)) !== null) {
    found.add(m[1]);
  }
  return [...found];
}

export function findUnclosedBraceIssues(body: string): string[] {
  const issues: string[] = [];
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '{') {
      depth += 1;
      if (depth > 2) {
        issues.push('Nested braces are not supported.');
        break;
      }
    } else if (ch === '}') {
      depth -= 1;
      if (depth < 0) {
        issues.push('Unexpected closing brace.');
        break;
      }
    }
  }
  if (depth > 0) {
    issues.push('Unclosed { or {{ in message body.');
  }
  return issues;
}
