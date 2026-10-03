/**
 * Pure helpers that turn a raw audit row (action code + stored JSON) into something a salon
 * owner can read: a short title, a plain sentence, a category and a human "what changed" list.
 * Nothing here touches the database; names are resolved by AuditService and passed in as facts.
 */

export type AuditCategory =
  | 'money'
  | 'overrides'
  | 'bookings'
  | 'staff_users'
  | 'settings';

export type AuditSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

type Rec = Record<string, unknown>;

export const AUDIT_CATEGORIES: AuditCategory[] = [
  'money',
  'overrides',
  'bookings',
  'staff_users',
  'settings',
];

const CAIRO_TZ = 'Africa/Cairo';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** Ordered: the first matching prefix wins, so specific prefixes come before general ones. */
const CATEGORY_RULES: Array<{ category: AuditCategory; prefixes: string[] }> = [
  { category: 'overrides', prefixes: ['override.'] },
  {
    category: 'settings',
    prefixes: [
      'payment.policy.',
      'settings.',
      'vat.',
      'slot_generation.',
      'branch.',
      'service.',
      'catalog.',
      'whatsappTemplate.',
      'websiteContent.',
      'review.',
      'gallery.',
      'package.',
      'addOn.',
    ],
  },
  {
    category: 'money',
    prefixes: [
      'booking.discount_applied',
      'booking.line_discount_applied',
      'booking.price_recalculated',
      'payment.',
      'invoice.',
      'cashDrawer.',
      'dailyClosing.',
      'loyalty.',
      'visit.',
    ],
  },
  {
    category: 'bookings',
    prefixes: [
      'booking.',
      'booking_change_request.',
      'queue.',
      'slot.',
      'slots.',
    ],
  },
  {
    category: 'staff_users',
    prefixes: ['user.', 'role.', 'permission', 'staff.', 'auth.'],
  },
];

const MODULE_CATEGORY: Record<string, AuditCategory> = {
  billing: 'money',
  invoices: 'money',
  payments: 'money',
  cashDrawer: 'money',
  dailyClosing: 'money',
  loyalty: 'money',
  bookings: 'bookings',
  queue: 'bookings',
  slots: 'bookings',
  users: 'staff_users',
  staff: 'staff_users',
  auth: 'staff_users',
  settings: 'settings',
  catalog: 'settings',
  whatsapp: 'settings',
  websiteContent: 'settings',
  reviews: 'settings',
  gallery: 'settings',
};

/** Entries that are not `override.*` but exist only because someone bypassed a rule. */
const EXTRA_OVERRIDE_ACTIONS = ['visit.closed_with_balance'];

export function isOverrideAction(action: string): boolean {
  return (
    action.startsWith('override.') || EXTRA_OVERRIDE_ACTIONS.includes(action)
  );
}

/** Main category. `override.*` entries are their own category; see `isOverrideAction` too. */
export function categoryFor(action: string, module?: string): AuditCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.prefixes.some((p) => action.startsWith(p))) return rule.category;
  }
  return (module ? MODULE_CATEGORY[module] : undefined) ?? 'settings';
}

/**
 * Prisma `action` conditions for a category filter, derived from the same rules as
 * `categoryFor` (so list filtering and the label on each row never disagree).
 */
export function categoryActionConditions(category: AuditCategory): {
  OR: Array<{ action: { startsWith: string } | { equals: string } }>;
  NOT: Array<{ action: { startsWith: string } }>;
} {
  if (category === 'overrides') {
    return {
      OR: [
        { action: { startsWith: 'override.' } },
        ...EXTRA_OVERRIDE_ACTIONS.map((a) => ({ action: { equals: a } })),
      ],
      NOT: [],
    };
  }
  const index = CATEGORY_RULES.findIndex((r) => r.category === category);
  const own = CATEGORY_RULES[index]?.prefixes ?? [];
  const earlier = CATEGORY_RULES.slice(0, Math.max(index, 0))
    .flatMap((r) => r.prefixes)
    .filter((p) => own.some((o) => p.startsWith(o)));
  return {
    OR: own.map((p) => ({ action: { startsWith: p } })),
    NOT: earlier.map((p) => ({ action: { startsWith: p } })),
  };
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export const CRITICAL_ACTION_PREFIXES = [
  'user.deactivated',
  'user.session_reuse_detected',
  'dailyClosing.reopened',
  'permission',
];

export const WARNING_ACTION_PREFIXES = [
  'override.',
  'payment.recorded',
  'payment.voided',
  'payment.updated',
  'payment.policy.',
  'invoice.finalized',
  'loyalty.points_adjusted',
  'visit.closed_with_balance',
  'booking.discount_applied',
  'booking.line_discount_applied',
  'booking.item_removed',
  'booking.item_cancelled_in_progress',
  'slot.deleted',
  'slots.closure_',
  'cashDrawer.closed',
  'cashDrawer.movement_created',
  'dailyClosing.closed',
  'user.role_changed',
  'user.branch_access_changed',
  'user.password_reset_by_privileged',
  'settings.',
  'vat.',
];

const SEVERITY_RANK: Record<AuditSeverity, number> = {
  INFO: 0,
  WARNING: 1,
  CRITICAL: 2,
};

/** The higher of what the call site stored and what the action itself deserves. */
export function deriveSeverity(
  action: string,
  explicit?: AuditSeverity,
): AuditSeverity {
  let derived: AuditSeverity = 'INFO';
  if (CRITICAL_ACTION_PREFIXES.some((p) => action.startsWith(p))) {
    derived = 'CRITICAL';
  } else if (WARNING_ACTION_PREFIXES.some((p) => action.startsWith(p))) {
    derived = 'WARNING';
  }
  if (explicit && SEVERITY_RANK[explicit] > SEVERITY_RANK[derived]) {
    return explicit;
  }
  return derived;
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

const TITLES: Record<string, string> = {
  'user.session_reuse_detected': 'Suspicious sign-in blocked',
  'user.profile_updated_self': 'Own profile updated',
  'user.password_changed_self': 'Own password changed',
  'user.created': 'User created',
  'user.updated': 'User updated',
  'user.role_changed': 'Role changed',
  'user.branch_access_changed': 'Branch access changed',
  'user.activated': 'User activated',
  'user.deactivated': 'User deactivated',
  'user.password_reset_by_privileged': 'Password reset',
  'invoice.generated': 'Invoice created',
  'invoice.synced_from_booking_items': 'Invoice updated',
  'invoice.finalized_from_queue': 'Invoice finalized',
  'payment.recorded': 'Payment recorded',
  'payment.recorded_from_queue': 'Payment recorded',
  'payment.voided': 'Payment voided',
  'payment.updated': 'Payment changed',
  'payment.policy.updated': 'Payment policy changed',
  'override.invoice_unfinished_lines': 'Invoice issued early',
  'override.slot_full': 'Full time slot overridden',
  'override.slot_start_passed': 'Past time slot allowed',
  'override.client_already_in_slot': 'Double booking allowed',
  'override.staff_start': 'Staff rule overridden',
  'booking.created': 'Booking created',
  'booking.confirmed': 'Booking confirmed',
  'booking.rejected': 'Booking rejected',
  'booking.rescheduled': 'Booking rescheduled',
  'booking.cancelled': 'Booking cancelled',
  'booking.arrived': 'Client arrived',
  'booking.in_progress': 'Visit in progress',
  'booking.completed': 'Booking completed',
  'booking.no_show': 'Marked as no-show',
  'booking.price_recalculated': 'Price recalculated',
  'booking.service_item.started': 'Service started',
  'booking.service_item.completed': 'Service finished',
  'booking.line_discount_applied': 'Service discount applied',
  'booking.discount_applied': 'Discount applied',
  'booking.items_appended': 'Services added',
  'booking.items_appended_from_queue': 'Services added',
  'booking.item_removed': 'Service removed',
  'booking.item_cancelled_in_progress': 'Service stopped',
  'booking_change_request.created': 'Change requested',
  'branch.created': 'Branch created',
  'branch.updated': 'Branch updated',
  'settings.slot_generation.updated': 'Slot settings changed',
  'slot_generation.defaults.updated': 'Slot settings changed',
  'settings.loyalty.updated': 'Loyalty settings changed',
  'settings.operations.updated': 'Operations settings changed',
  'settings.business_identity.updated': 'Business details changed',
  'settings.default_branch.updated': 'Default branch changed',
  'settings.receipt.updated': 'Receipt settings changed',
  'settings.vat.updated': 'VAT settings changed',
  'vat.settings.updated': 'VAT settings changed',
  'service.price_changed': 'Service price changed',
  'service.image_attached': 'Service photo set',
  'catalog.search_terms_updated': 'Search keywords changed',
  'review.created': 'Review added',
  'review.updated': 'Review edited',
  'review.activated': 'Review shown',
  'review.deactivated': 'Review hidden',
  'review.homepage_selected': 'Homepage review chosen',
  'review.homepage_visibility_updated': 'Homepage review changed',
  'review.reordered': 'Reviews reordered',
  'gallery.image_uploaded': 'Photo uploaded',
  'gallery.image_updated': 'Photo edited',
  'gallery.image_deleted': 'Photo deleted',
  'gallery.image_detached': 'Photo removed from use',
  'gallery.image_attached': 'Photo placed',
  'websiteContent.section_visibility_changed':
    'Website section shown or hidden',
  'websiteContent.image_attached': 'Website photo added',
  'websiteContent.image_removed': 'Website photo removed',
  'websiteContent.image_changed': 'Website photo changed',
  'websiteContent.section_updated': 'Website section edited',
  'websiteContent.section_reordered': 'Website sections reordered',
  'cashDrawer.opened': 'Cash drawer opened',
  'cashDrawer.updated': 'Cash count updated',
  'cashDrawer.movement_created': 'Cash added or removed',
  'cashDrawer.closed': 'Cash drawer closed',
  'dailyClosing.draft_saved': 'Daily closing saved',
  'dailyClosing.closed': 'Day closed',
  'loyalty.points_adjusted': 'Loyalty points adjusted',
  'loyalty.points_redeemed': 'Loyalty points redeemed',
  'loyalty.reward_redeemed': 'Loyalty reward redeemed',
  'queue.checked_in_from_booking': 'Client checked in',
  'queue.created': 'Walk-in added to queue',
  'queue.walk_in_booking_created': 'Walk-in booking created',
  'queue.returned_to_waiting_after_items_added': 'Visit back to waiting',
  'queue.started': 'Visit started',
  'queue.completion_blocked_invoice_required': 'Visit close blocked',
  'queue.completed': 'Visit completed',
  'queue.cancelled': 'Visit cancelled',
  'visit.closed_with_balance': 'Visit closed with balance',
  'slot.created': 'Time slot added',
  'slot.updated': 'Time slot changed',
  'slot.capacity_changed': 'Slot capacity changed',
  'slot.deleted': 'Time slot deleted',
  'slots.week_generated': 'Week of slots created',
  'slots.horizon_extended': 'Slots added ahead',
  'slots.closure_created': 'Branch closure added',
  'slots.closure_removed': 'Branch closure removed',
  'whatsappTemplate.created': 'Message template created',
  'whatsappTemplate.updated': 'Message template edited',
  'whatsappTemplate.activated': 'Message template turned on',
  'whatsappTemplate.deactivated': 'Message template turned off',
};

function sentenceCase(text: string): string {
  const t = text.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** `booking.status_changed` -> `Booking status changed`; `cashDrawer.opened` -> `Cash drawer opened`. */
export function readableFromCode(code: string): string {
  const words = code
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return sentenceCase(words) || 'Activity';
}

export function titleFor(action: string): string {
  return TITLES[action] ?? readableFromCode(action);
}

export const KNOWN_ACTIONS = Object.keys(TITLES);

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function toRec(value: unknown): Rec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Rec;
}

function asStr(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function asNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** "EGP 300" in sentences, "EGP 300.50" when there are piastres. */
export function moneyShort(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded)
    ? `EGP ${rounded.toLocaleString('en-US')}`
    : `EGP ${rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "EGP 300.00" in the change table. */
export function moneyFull(value: number): string {
  return `EGP ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** `2026-10-09` -> `Fri 9 Oct`. A calendar day; no timezone shift. */
export function formatYmd(ymd: string, withYear = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const base = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return withYear ? `${base} ${d.getUTCFullYear()}` : base;
}

/** `13:00` or an ISO time-of-day -> `1:00 PM` (the stored wall clock, no shift). */
export function formatWallTime(value: string): string {
  const m = /(\d{2}):(\d{2})/.exec(value);
  if (!m) return value;
  const h = Number(m[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/** Slot date + time (stored as UTC wall clock) -> `Fri 9 Oct, 1:00 PM`. */
export function formatSlotWhen(
  date: Date | string,
  startTime: Date | string,
): string {
  const d = typeof date === 'string' ? date : date.toISOString();
  const t = typeof startTime === 'string' ? startTime : startTime.toISOString();
  const ymd = d.slice(0, 10);
  const time = /T(\d{2}:\d{2})/.exec(t)?.[1] ?? t.slice(0, 5);
  return `${formatYmd(ymd)}, ${formatWallTime(time)}`;
}

/** A real instant, shown in Cairo time: `9 Oct 2026, 1:00 PM`. */
export function formatCairoInstant(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')} ${get('dayPeriod')}`;
}

/** UTC instant for 00:00 (Cairo wall clock) on the given calendar day. */
export function cairoDayStart(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return new Date(ymd);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Try both plausible offsets (Egypt is UTC+2, or UTC+3 in summer time) and keep the one
  // whose Cairo wall clock reads exactly midnight on that day.
  for (const offsetHours of [2, 3]) {
    const candidate = new Date(Date.UTC(y, mo - 1, d, -offsetHours, 0, 0));
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: CAIRO_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(candidate);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    if (
      get('year') === String(y).padStart(4, '0') &&
      get('month') === String(mo).padStart(2, '0') &&
      get('day') === String(d).padStart(2, '0') &&
      get('hour') === '00' &&
      get('minute') === '00'
    ) {
      return candidate;
    }
  }
  return new Date(Date.UTC(y, mo - 1, d, -2, 0, 0));
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * `dateFrom` / `dateTo` may be a calendar day (`2026-10-03`, read as a Cairo day) or a full ISO
 * instant (used as is).
 */
export function parseAuditDateBound(
  value: string,
  bound: 'from' | 'to',
): Date | null {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    if (bound === 'from') return cairoDayStart(v);
    return new Date(cairoDayStart(addDaysYmd(v, 1)).getTime() - 1);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** `IN_PROGRESS` / `cash_in` / `creditCard` -> `In progress` / `Cash in` / `Credit card`. */
export function humanizeToken(value: string): string {
  return readableFromCode(value);
}

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------

/** Names resolved by the service for one row. Everything is optional. */
export type EntryFacts = {
  /** Display name of the person who did it; null for the system / website. */
  actorName: string | null;
  client?: string | null;
  /** `RB-1A2B3C4D` */
  bookingRef?: string | null;
  /** `Fri 9 Oct, 1:00 PM` */
  bookingWhen?: string | null;
  invoiceNumber?: string | null;
  staffName?: string | null;
  serviceName?: string | null;
  targetUser?: string | null;
  branchName?: string | null;
  entityName?: string | null;
  roleBefore?: string | null;
  roleAfter?: string | null;
  branchNamesBefore?: string[];
  branchNamesAfter?: string[];
  oldValue: unknown;
  newValue: unknown;
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function withPeriod(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** Strips the stored `metadata` wrapper so sentence builders can read flat keys. */
function flat(value: unknown): Rec {
  const rec = toRec(value);
  const meta = toRec(rec.metadata);
  return { ...meta, ...rec };
}

export function extractReason(
  newValue: unknown,
  oldValue?: unknown,
): string | null {
  const n = flat(newValue);
  const o = flat(oldValue);
  return (
    asStr(n.reason) ??
    asStr(n.overrideReason) ??
    asStr(n.note) ??
    asStr(n.carryOverReason) ??
    asStr(n.discountReason) ??
    asStr(o.reason) ??
    null
  );
}

const ISSUE_TEXT: Record<string, string> = {
  STAFF_NOT_QUALIFIED: 'is not linked to this service',
  STAFF_NOT_AVAILABLE: 'is not on shift at this time',
  STAFF_BUSY: 'is busy with another client',
};

function issueText(issues: unknown): string | null {
  if (!Array.isArray(issues)) return null;
  const parts = issues
    .map((i) => ISSUE_TEXT[asStr(toRec(i).code) ?? ''])
    .filter((x): x is string => Boolean(x));
  if (!parts.length) return null;
  return parts.join(' and ');
}

function quoted(text: string | null | undefined, fallback: string): string {
  return text ? `"${text}"` : fallback;
}

/**
 * One plain sentence: who, what, on whom, with amounts, ending with the reason when there is
 * one. Returns a readable fallback for actions it does not know.
 */
export function buildSummary(action: string, f: EntryFacts): string {
  const n = flat(f.newValue);
  const o = flat(f.oldValue);
  const S = f.actorName ? firstName(f.actorName) : 'The system';
  const client = f.client ?? null;
  const subject = client ?? 'the client';
  const ref = f.bookingRef ? ` (booking ${f.bookingRef})` : '';
  const when = f.bookingWhen ?? null;
  const bk = (() => {
    if (client && when) return `the booking of ${client} for ${when}`;
    if (client) return `the booking of ${client}`;
    if (f.bookingRef) return `booking ${f.bookingRef}`;
    return 'a booking';
  })();
  const inv = f.invoiceNumber ? `invoice ${f.invoiceNumber}` : 'an invoice';
  const onInv = f.invoiceNumber ? ` on invoice ${f.invoiceNumber}` : '';
  const fromClient = client ? ` from ${client}` : '';
  const forClient = client ? ` for ${client}` : '';
  const service = f.serviceName ?? asStr(o.nameSnapshot) ?? 'a service';
  const branchAt = f.branchName ? ` at ${f.branchName}` : '';
  const amount = asNum(n.amount);
  const target = f.targetUser ?? asStr(n.fullName) ?? 'a user';
  const method = asStr(n.method)
    ? humanizeToken(String(n.method)).toLowerCase()
    : null;

  const reason = extractReason(f.newValue, f.oldValue);
  const withReason = (sentence: string) =>
    reason ? `${sentence} Reason: ${withPeriod(reason)}` : sentence;

  const money = (v: unknown): string | null => {
    const num = asNum(v);
    return num === null ? null : moneyShort(num);
  };
  const fromTo = (before: unknown, after: unknown): string => {
    const a = money(before);
    const b = money(after);
    return a && b ? ` from ${a} to ${b}` : b ? ` to ${b}` : '';
  };
  const slotDay = (rec: Rec) => {
    const date = asStr(rec.date);
    const start = asStr(rec.startTime);
    return date && start ? formatSlotWhen(date, start) : null;
  };

  switch (action) {
    // --- bookings -------------------------------------------------------
    case 'booking.created': {
      if (!f.actorName) {
        return `${client ?? 'A customer'} requested ${when ? `a booking for ${when}` : 'a booking online'}.`;
      }
      if (asStr(n.source) === 'WALK_IN') {
        return `${S} added a walk-in booking${forClient}${when ? ` for ${when}` : ''}.`;
      }
      return `${S} created ${bk}.`;
    }
    case 'booking.confirmed':
      return `${S} confirmed ${bk}.`;
    case 'booking.rejected':
      return `${S} rejected ${bk}.`;
    case 'booking.rescheduled':
      return `${S} moved the booking of ${subject}${when ? ` to ${when}` : ''}.`;
    case 'booking.cancelled':
      return `${S} cancelled ${bk}.`;
    case 'booking.arrived':
      return `${S} marked ${subject} as arrived${ref}.`;
    case 'booking.in_progress':
      return `${S} moved ${subject} to in progress${ref}.`;
    case 'booking.completed':
      return `${S} marked ${bk} as completed.`;
    case 'booking.no_show':
      return `${S} marked ${subject} as a no-show${when ? ` for ${when}` : ''}${ref}.`;
    case 'booking.price_recalculated': {
      const total = money(n.totalAmount);
      return `${S} recalculated the price of ${bk}${total ? `. New total: ${total}` : ''}.`;
    }
    case 'booking.service_item.started':
      return `${S} started ${service}${f.staffName ? ` with ${f.staffName}` : ''}${forClient}.`;
    case 'booking.service_item.completed':
      return `${S} finished ${service}${forClient}.`;
    case 'booking.line_discount_applied':
      return withReason(
        `${S} changed the discount on ${service}${forClient}${fromTo(o.discountAmount, n.discountAmount)}.`,
      );
    case 'booking.discount_applied':
      return withReason(
        `${S} changed the discount on ${bk}${fromTo(o.discountAmount, n.discountAmount)}.`,
      );
    case 'booking.items_appended':
    case 'booking.items_appended_from_queue': {
      const lines = Array.isArray(n.addedLines)
        ? n.addedLines.filter((x): x is string => typeof x === 'string')
        : [];
      return `${S} added ${lines.length ? lines.join(', ') : 'services'} to ${bk}.`;
    }
    case 'booking.item_removed':
      return withReason(`${S} removed ${service} from ${bk}.`);
    case 'booking.item_cancelled_in_progress':
      return withReason(
        `${S} stopped ${service} while it was in progress on ${bk}.`,
      );
    case 'booking_change_request.created': {
      const kind = asStr(n.requestType) === 'CANCEL' ? 'cancel' : 'reschedule';
      return `${client ?? 'A client'} asked to ${kind} ${bk}.`;
    }

    // --- overrides ------------------------------------------------------
    case 'override.slot_full':
      return withReason(
        `${S} confirmed ${bk} even though the time slot was already full.`,
      );
    case 'override.slot_start_passed':
      return withReason(
        `${S} booked ${bk} at a time that had already started.`,
      );
    case 'override.client_already_in_slot':
      return withReason(
        `${S} booked ${client ?? 'a client'} into a time slot where they already have a booking.`,
      );
    case 'override.staff_start': {
      const why = issueText(n.issues);
      return withReason(
        `${S} started ${service}${forClient} with ${f.staffName ?? 'a staff member'}${why ? `, who ${why}` : ''}.`,
      );
    }
    case 'override.invoice_unfinished_lines': {
      const count = asNum(n.unfinishedLines);
      return withReason(
        `${S} issued ${inv}${forClient} while ${count ?? 'some'} ${count === 1 ? 'service was' : 'services were'} not finished.`,
      );
    }

    // --- money ----------------------------------------------------------
    case 'invoice.generated': {
      const total = money(n.totalAmount);
      return `${S} created ${f.invoiceNumber ? `invoice ${f.invoiceNumber}` : 'an invoice'}${forClient}${total ? ` for ${total}` : ''}.`;
    }
    case 'invoice.synced_from_booking_items':
      return `${S} updated ${inv} to match the services on ${bk}.`;
    case 'invoice.finalized_from_queue':
      return `${S} finalized ${inv}${forClient}.`;
    case 'payment.recorded':
    case 'payment.recorded_from_queue':
      return `${S} recorded ${method ? `a ${method} payment` : 'a payment'}${amount !== null ? ` of ${moneyShort(amount)}` : ''}${onInv}${fromClient}.`;
    case 'payment.voided': {
      const was = money(o.amount);
      return withReason(
        `${S} voided a payment${was ? ` of ${was}` : ''}${onInv}${fromClient}.`,
      );
    }
    case 'payment.updated': {
      const before = asNum(o.amount);
      const after = asNum(n.amount);
      if (before !== null && after !== null && before !== after) {
        return withReason(
          `${S} changed a payment${onInv} from ${moneyShort(before)} to ${moneyShort(after)}${fromClient ? ` (${fromClient.trim()})` : ''}.`,
        );
      }
      return withReason(
        `${S} edited the details of a payment${onInv}${fromClient}.`,
      );
    }
    case 'payment.policy.updated':
      return `${S} changed the deposit policy for online bookings.`;
    case 'cashDrawer.opened': {
      const opening = money(n.openingBalance);
      return `${S} opened the cash drawer${opening ? ` with ${opening}` : ''}${branchAt}.`;
    }
    case 'cashDrawer.updated': {
      const counted = money(n.countedCash);
      return `${S} updated the cash count${counted ? ` to ${counted}` : ''}${branchAt}.`;
    }
    case 'cashDrawer.movement_created': {
      const type = asStr(n.movementType);
      const what =
        type === 'CASH_IN'
          ? 'put cash into'
          : type === 'CASH_OUT'
            ? 'took cash out of'
            : 'adjusted';
      return withReason(
        `${S} ${what} the cash drawer${amount !== null ? ` (${moneyShort(amount)})` : ''}${branchAt}.`,
      );
    }
    case 'cashDrawer.closed': {
      const counted = money(n.countedCash);
      const expected = money(n.expectedCash);
      const diff = asNum(n.cashDifference);
      const diffText =
        diff === null
          ? ''
          : diff === 0
            ? ' The count matched.'
            : ` Difference: ${diff > 0 ? '+' : '-'}${moneyShort(Math.abs(diff))}.`;
      return `${S} closed the cash drawer${branchAt}${counted ? `: counted ${counted}` : ''}${expected ? `, expected ${expected}` : ''}.${diffText}`;
    }
    case 'dailyClosing.draft_saved': {
      const day = asStr(n.businessDate);
      return `${S} saved a draft of the daily closing${day ? ` for ${formatYmd(day, true)}` : ''}${branchAt}.`;
    }
    case 'dailyClosing.closed': {
      const day = asStr(n.businessDate);
      const sales = money(n.grossSales);
      const collected = money(n.totalCollected);
      return withReason(
        `${S} closed the day${day ? ` ${formatYmd(day, true)}` : ''}${branchAt}${sales ? `. Sales ${sales}` : ''}${collected ? `, collected ${collected}` : ''}.`,
      );
    }
    case 'loyalty.points_adjusted': {
      const pts = asNum(n.points) ?? 0;
      const verb = pts >= 0 ? 'added' : 'removed';
      return withReason(
        `${S} ${verb} ${Math.abs(pts)} loyalty points ${pts >= 0 ? 'to' : 'from'} ${client ?? 'a client'}.`,
      );
    }
    case 'loyalty.points_redeemed': {
      const pts = asNum(n.points);
      return `${S} redeemed ${pts ?? 'some'} loyalty points${amount !== null ? ` (${moneyShort(amount)} off)` : ''}${forClient}${onInv}.`;
    }
    case 'loyalty.reward_redeemed':
      return `${S} gave ${client ?? 'a client'} a free loyalty reward${amount !== null ? ` worth ${moneyShort(amount)}` : ''}${onInv}.`;
    case 'visit.closed_with_balance': {
      const left = money(n.remainingAmount);
      return withReason(
        `${S} closed ${client ? `${client}'s` : 'a'} visit with ${left ?? 'a balance'} still unpaid.`,
      );
    }

    // --- queue ----------------------------------------------------------
    case 'queue.checked_in_from_booking':
      return `${S} checked in ${subject}${when ? ` for ${when}` : ''}${ref}.`;
    case 'queue.created':
      return `${S} added ${client ?? 'a walk-in client'} to the queue.`;
    case 'queue.walk_in_booking_created':
      return `${S} created a walk-in booking${forClient}.`;
    case 'queue.returned_to_waiting_after_items_added': {
      const count = asNum(n.addedItems);
      return `${client ? `${client}'s` : 'A'} visit went back to waiting because ${count ?? 'new'} ${count === 1 ? 'service was' : 'services were'} added.`;
    }
    case 'queue.started':
      return `${S} started ${client ? `${client}'s` : 'a'} visit.`;
    case 'queue.completion_blocked_invoice_required':
      return `${S} tried to finish ${client ? `${client}'s` : 'a'} visit, but the invoice had not been finalized yet.`;
    case 'queue.completed':
      return `${S} completed ${client ? `${client}'s` : 'a'} visit.`;
    case 'queue.cancelled':
      return `${S} cancelled ${client ? `${client}'s` : 'a'} visit.`;

    // --- slots ----------------------------------------------------------
    case 'slot.created': {
      const day = slotDay(n);
      const cap = asNum(n.capacity);
      return `${S} added a time slot${day ? ` on ${day}` : ''}${cap !== null ? ` (room for ${cap})` : ''}${branchAt}.`;
    }
    case 'slot.updated': {
      const before = slotDay(o);
      const after = slotDay(n);
      if (before && after && before !== after) {
        return `${S} changed a time slot from ${before} to ${after}.`;
      }
      return `${S} edited the notes of a time slot${after ? ` on ${after}` : ''}.`;
    }
    case 'slot.capacity_changed':
      return `${S} changed the capacity of a time slot from ${asNum(o.capacity) ?? '?'} to ${asNum(n.capacity) ?? '?'}.`;
    case 'slot.deleted': {
      const day = slotDay(o);
      return `${S} deleted the time slot${day ? ` on ${day}` : ''}${branchAt}.`;
    }
    case 'slots.week_generated':
      return `${S} created a week of time slots${branchAt}.`;
    case 'slots.horizon_extended': {
      const count = asNum(n.createdCount);
      const from = asStr(n.dateFrom);
      const to = asStr(n.dateTo);
      const who = asStr(n.trigger) === 'manual' ? S : 'The system';
      return `${who} added ${count ?? 'new'} time slots${from && to ? ` from ${formatYmd(from)} to ${formatYmd(to)}` : ''}${branchAt}.`;
    }
    case 'slots.closure_created': {
      const from = asStr(n.startDate);
      const to = asStr(n.endDate);
      const affected = asNum(n.affectedBookings);
      return withReason(
        `${S} closed the branch${branchAt ? branchAt.replace(' at ', ' ') : ''}${from ? ` from ${formatYmd(from)}` : ''}${to && to !== from ? ` to ${formatYmd(to)}` : ''}${affected ? `. ${affected} bookings are affected` : ''}.`,
      );
    }
    case 'slots.closure_removed': {
      const from = asStr(o.startDate);
      const to = asStr(o.endDate);
      return `${S} removed a branch closure${from ? ` (${formatYmd(from)}${to && to !== from ? ` to ${formatYmd(to)}` : ''})` : ''}.`;
    }

    // --- users ----------------------------------------------------------
    case 'user.created':
      return `${S} created the user ${target}.`;
    case 'user.updated':
      return `${S} updated the details of ${target}.`;
    case 'user.role_changed':
      return `${S} changed ${target}'s role${f.roleBefore ? ` from ${f.roleBefore}` : ''}${f.roleAfter ? ` to ${f.roleAfter}` : ''}.`;
    case 'user.branch_access_changed': {
      const after = f.branchNamesAfter ?? [];
      return `${S} changed which branches ${target} can work in${after.length ? `. Now: ${after.join(', ')}` : ''}.`;
    }
    case 'user.activated':
      return `${S} turned ${target}'s account back on.`;
    case 'user.deactivated':
      return `${S} turned off ${target}'s account.`;
    case 'user.password_reset_by_privileged':
      return `${S} set a new password for ${target}.`;
    case 'user.session_reuse_detected':
      return `A sign-in for ${f.actorName ?? 'a user'} was blocked because the session looked stolen. All their sessions were ended.`;
    case 'user.profile_updated_self':
      return `${S} updated their own profile.`;
    case 'user.password_changed_self':
      return `${S} changed their own password.`;

    // --- settings -------------------------------------------------------
    case 'settings.vat.updated':
    case 'vat.settings.updated': {
      const before = asNum(o.vatRatePercent);
      const after = asNum(n.vatRatePercent);
      return `${S} changed the VAT settings${before !== null && after !== null && before !== after ? ` (rate from ${before}% to ${after}%)` : ''}.`;
    }
    case 'settings.loyalty.updated':
      return `${S} changed the loyalty program settings.`;
    case 'settings.operations.updated':
      return `${S} changed the operations settings.`;
    case 'settings.business_identity.updated':
      return `${S} changed the business details.`;
    case 'settings.default_branch.updated':
      return `${S} changed the default branch.`;
    case 'settings.receipt.updated':
      return `${S} changed the receipt settings.`;
    case 'settings.slot_generation.updated':
      return `${S} changed the time slot settings${branchAt}.`;
    case 'slot_generation.defaults.updated':
      return `${S} changed the default time slot settings.`;
    case 'branch.created':
      return `${S} created the branch ${quoted(asStr(n.name) ?? f.branchName, 'a new branch')}.`;
    case 'branch.updated':
      return `${S} updated the branch ${quoted(asStr(n.name) ?? f.branchName, 'details')}.`;
    case 'service.price_changed': {
      const name = f.entityName ?? 'a service';
      const before = money(o.basePrice);
      const after = money(n.basePrice);
      const priceText =
        before && after
          ? ` from ${before} to ${after}`
          : after
            ? ` to ${after}`
            : '';
      return `The price of ${name} was changed${priceText}${f.actorName ? ` by ${S}` : ''}.`;
    }
    case 'service.image_attached':
      return `${S} set the photo of ${f.entityName ?? 'a service'}.`;
    case 'catalog.search_terms_updated':
      return `${S} changed the search keywords of ${f.entityName ?? 'an item'}.`;

    // --- website, reviews, gallery, templates ---------------------------
    case 'review.created':
      return `${S} added a review from ${asStr(n.clientName) ?? 'a client'}.`;
    case 'review.updated':
      return `${S} edited a review from ${asStr(n.clientName) ?? asStr(o.clientName) ?? 'a client'}.`;
    case 'review.activated':
      return `${S} made a review visible on the website.`;
    case 'review.deactivated':
      return `${S} hid a review from the website.`;
    case 'review.homepage_selected':
      return `${S} chose the review from ${asStr(n.clientName) ?? 'a client'} for the homepage.`;
    case 'review.homepage_visibility_updated':
      return `${S} changed whether a review shows on the homepage.`;
    case 'review.reordered':
      return `${S} changed the order of the reviews.`;
    case 'gallery.image_uploaded':
      return `${S} uploaded the photo ${quoted(asStr(n.title), 'a new photo')}.`;
    case 'gallery.image_updated':
      return `${S} edited the photo ${quoted(asStr(n.title), 'details')}.`;
    case 'gallery.image_deleted':
      return `${S} deleted a photo from the gallery.`;
    case 'gallery.image_detached':
      return `${S} removed a photo from where it was used.`;
    case 'gallery.image_attached':
      return `${S} placed a photo on the website or on a service.`;
    case 'websiteContent.section_visibility_changed': {
      const key = asStr(n.sectionKey) ?? asStr(o.sectionKey);
      const shown = n.isVisible === true;
      return `${S} ${shown ? 'showed' : 'hid'} the ${key ? humanizeToken(key).toLowerCase() : 'a'} section on the website.`;
    }
    case 'websiteContent.image_attached':
    case 'websiteContent.image_removed':
    case 'websiteContent.image_changed': {
      const verb =
        action === 'websiteContent.image_attached'
          ? 'added'
          : action === 'websiteContent.image_removed'
            ? 'removed'
            : 'changed';
      const key = asStr(n.sectionKey) ?? asStr(o.sectionKey);
      return `${S} ${verb} a photo in the ${key ? humanizeToken(key).toLowerCase() : 'website'} section.`;
    }
    case 'websiteContent.section_updated': {
      const key = asStr(n.sectionKey);
      return `${S} edited the ${key ? humanizeToken(key).toLowerCase() : 'website'} section.`;
    }
    case 'websiteContent.section_reordered':
      return `${S} changed the order of the website sections.`;
    case 'whatsappTemplate.created':
    case 'whatsappTemplate.updated':
    case 'whatsappTemplate.activated':
    case 'whatsappTemplate.deactivated': {
      const verb = {
        'whatsappTemplate.created': 'created',
        'whatsappTemplate.updated': 'edited',
        'whatsappTemplate.activated': 'turned on',
        'whatsappTemplate.deactivated': 'turned off',
      }[action];
      const name = asStr(n.name) ?? asStr(n.templateKey);
      return `${S} ${verb} the WhatsApp message ${quoted(name ? humanizeToken(name) : null, 'template')}.`;
    }
    default:
      return withReason(`${S}: ${titleFor(action).toLowerCase()}.`);
  }
}

// ---------------------------------------------------------------------------
// "What changed"
// ---------------------------------------------------------------------------

/** Keys that are plumbing, not information. */
const HIDDEN_KEYS = new Set([
  'entityType',
  'branchId',
  'severity',
  'metadata',
  'performedByUserId',
  'targetUserId',
  'mediaAssetId',
  'familyId',
  'ipAddress',
  'reason',
  'overrideReason',
  'note',
  'issues',
]);

const FIELD_LABELS: Record<string, string> = {
  amount: 'Amount',
  totalAmount: 'Total',
  subtotal: 'Subtotal',
  discountAmount: 'Discount',
  vatAmount: 'VAT',
  paidAmount: 'Paid',
  remainingAmount: 'Still to pay',
  method: 'Payment method',
  status: 'Status',
  reference: 'Reference',
  referenceNumber: 'Reference',
  notes: 'Notes',
  paidAt: 'Paid at',
  bookingId: 'Booking',
  invoiceId: 'Invoice',
  clientId: 'Client',
  staffProfileId: 'Staff member',
  targetUserId: 'User',
  roleId: 'Role',
  queueEntryId: 'Visit',
  fullName: 'Full name',
  email: 'Email',
  phone: 'Phone',
  isActive: 'Active',
  roleIds: 'Roles',
  branchIds: 'Branches',
  newBranchIds: 'Branches',
  previousBranchIds: 'Branches',
  defaultBranchId: 'Default branch',
  newDefaultBranchId: 'Default branch',
  previousDefaultBranchId: 'Default branch',
  invoiceNumber: 'Invoice number',
  vatEnabled: 'VAT on',
  vatRatePercent: 'VAT rate',
  defaultVatRate: 'Default VAT rate',
  pricesIncludeVat: 'Prices include VAT',
  showVatOnInvoice: 'Show VAT on invoice',
  taxLabel: 'Tax label',
  taxRegistrationNumber: 'Tax registration number',
  paymentDepositPolicy: 'Deposit policy',
  dayCloseOpenItemsPolicy: 'Open items at day close',
  discountLimitPercentWithoutApproval: 'Discount limit without approval',
  openingBalance: 'Opening balance',
  countedCash: 'Counted cash',
  expectedCash: 'Expected cash',
  cashDifference: 'Cash difference',
  movementType: 'Type',
  businessDate: 'Business day',
  grossSales: 'Sales',
  totalCollected: 'Collected',
  carriedOverVisits: 'Visits carried over',
  carriedOverUnpaidInvoices: 'Unpaid invoices carried over',
  carryOverReason: 'Carry-over reason',
  points: 'Points',
  balanceBefore: 'Balance before',
  capacity: 'Capacity',
  date: 'Date',
  startTime: 'Starts',
  endTime: 'Ends',
  startDate: 'From',
  endDate: 'To',
  dateFrom: 'From',
  dateTo: 'To',
  createdCount: 'Slots created',
  closedDaysSkipped: 'Closed days skipped',
  trigger: 'Started',
  reopenedSlots: 'Slots reopened',
  createdSlots: 'Slots created',
  closedSlots: 'Slots closed',
  affectedBookings: 'Bookings affected',
  nameSnapshot: 'Service',
  itemType: 'Type',
  priceSnapshot: 'Price',
  quantity: 'Quantity',
  lineStatus: 'Line status',
  staffDisplayName: 'Staff member',
  remainingItemCount: 'Services left',
  addedLines: 'Services added',
  addedItems: 'Services added',
  priceDisplayType: 'Price type',
  basePrice: 'Price',
  basePriceMax: 'Highest price',
  displayName: 'Name',
  templateKey: 'Template',
  changedKeys: 'Fields changed',
  changedFields: 'Fields changed',
  isVisible: 'Shown',
  sectionKey: 'Section',
  slot: 'Place',
  unfinishedLines: 'Unfinished services',
  usageType: 'Used for',
  mimeType: 'File type',
  sizeBytes: 'File size',
  title: 'Title',
  source: 'Source',
  slotId: 'Time slot',
  appliedOfferId: 'Offer',
  appliedPromoCode: 'Promo code',
  clientName: 'Client',
  rating: 'Rating',
  showOnHomepage: 'Shown on homepage',
  category: 'Category',
  language: 'Language',
  name: 'Name',
  address: 'Address',
  isOnlineBookable: 'Bookable online',
  requestType: 'Request',
  requestedSlotId: 'Requested time slot',
};

const MONEY_KEYS = new Set([
  'amount',
  'totalAmount',
  'subtotal',
  'discountAmount',
  'vatAmount',
  'paidAmount',
  'remainingAmount',
  'openingBalance',
  'countedCash',
  'expectedCash',
  'cashDifference',
  'priceSnapshot',
  'basePrice',
  'basePriceMax',
  'grossSales',
  'totalCollected',
]);
const PERCENT_KEYS = new Set([
  'vatRatePercent',
  'defaultVatRate',
  'discountLimitPercentWithoutApproval',
]);
const TIMESTAMP_KEYS = new Set(['paidAt', 'handledAt', 'completedAt']);
const DAY_KEYS = new Set([
  'businessDate',
  'startDate',
  'endDate',
  'dateFrom',
  'dateTo',
]);

export type ChangeRow = { field: string; before: string; after: string };

/** Names the service resolved for ids that appear inside the JSON. */
export type NameLookup = {
  booking: (id: string) => string | null;
  invoice: (id: string) => string | null;
  client: (id: string) => string | null;
  staff: (id: string) => string | null;
  user: (id: string) => string | null;
  role: (id: string) => string | null;
  branch: (id: string) => string | null;
  queue: (id: string) => string | null;
};

export const EMPTY_LOOKUP: NameLookup = {
  booking: () => null,
  invoice: () => null,
  client: () => null,
  staff: () => null,
  user: () => null,
  role: () => null,
  branch: () => null,
  queue: () => null,
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? readableFromCode(key);
}

function lookupId(key: string, id: string, names: NameLookup): string | null {
  if (key === 'bookingId') return names.booking(id);
  if (key === 'invoiceId') return names.invoice(id);
  if (key === 'clientId') return names.client(id);
  if (key === 'staffProfileId') return names.staff(id);
  if (key === 'targetUserId' || key === 'userId') return names.user(id);
  if (key === 'roleId') return names.role(id);
  if (key === 'queueEntryId') return names.queue(id);
  if (/branch/i.test(key)) return names.branch(id);
  return null;
}

/** Returns null when the value is an internal id we could not turn into a name. */
export function formatFieldValue(
  key: string,
  value: unknown,
  names: NameLookup = EMPTY_LOOKUP,
): string | null {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    const parts = value.map((v) => formatFieldValue(key, v, names));
    if (parts.some((p) => p === null)) return null;
    return (parts as string[]).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  if (MONEY_KEYS.has(key)) {
    const num = asNum(value);
    if (num !== null) return moneyFull(num);
  }
  if (PERCENT_KEYS.has(key)) {
    const num = asNum(value);
    if (num !== null) return `${num}%`;
  }
  if (typeof value === 'string') {
    if (isUuid(value)) return lookupId(key, value, names);
    if (TIMESTAMP_KEYS.has(key)) return formatCairoInstant(value);
    if (DAY_KEYS.has(key) || key === 'date') {
      return /^\d{4}-\d{2}-\d{2}/.test(value) ? formatYmd(value, true) : value;
    }
    if (key === 'startTime' || key === 'endTime') return formatWallTime(value);
    if (key === 'trigger')
      return value === 'manual' ? 'By hand' : 'Automatically';
    if (/^[A-Z][A-Z0-9_]+$/.test(value) || /^[a-z]+(_[a-z]+)+$/.test(value)) {
      return humanizeToken(value);
    }
    if (key === 'sectionKey' || key === 'templateKey')
      return humanizeToken(value);
    return value;
  }
  if (typeof value === 'number') {
    if (key === 'sizeBytes') return `${Math.round(value / 1024)} KB`;
    return String(value);
  }
  return '';
}

/** Old/new snapshots that name the same thing differently. */
const KEY_ALIASES: Record<string, string> = {
  previousBranchIds: 'branchIds',
  newBranchIds: 'branchIds',
  previousDefaultBranchId: 'defaultBranchId',
  newDefaultBranchId: 'defaultBranchId',
};

function stripWrapper(value: unknown): Rec {
  const rec = { ...toRec(value) };
  const meta = toRec(rec.metadata);
  delete rec.metadata;
  const merged: Rec = { ...meta, ...rec };
  const out: Rec = {};
  for (const [key, v] of Object.entries(merged)) {
    out[KEY_ALIASES[key] ?? key] = v;
  }
  return out;
}

/** Before/after rows with human field names and values; internal keys are left out. */
export function buildChanges(
  oldValue: unknown,
  newValue: unknown,
  names: NameLookup = EMPTY_LOOKUP,
): ChangeRow[] {
  const before = stripWrapper(oldValue);
  const after = stripWrapper(newValue);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const rows: ChangeRow[] = [];
  for (const key of keys) {
    if (HIDDEN_KEYS.has(key)) continue;
    const b = before[key] ?? null;
    const a = after[key] ?? null;
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    const fb = formatFieldValue(key, b, names);
    const fa = formatFieldValue(key, a, names);
    if (fb === null || fa === null) continue;
    if (fb === fa) continue;
    rows.push({ field: fieldLabel(key), before: fb, after: fa });
  }
  return rows;
}
