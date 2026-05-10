/** Booking calendar rules default to Africa/Cairo (see /docs/ARCHITECTURE.md §20). */

export const CAIRO_TIME_ZONE = 'Africa/Cairo';

const CAIRO_WEEKDAY_SHORT_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Day-of-week (0=Sunday … 6=Saturday) for a **calendar** `YYYY-MM-DD` interpreted in
 * `Africa/Cairo`, aligned with slot booking dates and dashboard weekday toggles.
 */
export function cairoWeekdayIndexFromDateString(dateStr: string): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TIME_ZONE,
    weekday: 'short',
  }).format(new Date(`${dateStr}T12:00:00.000Z`));
  const idx = CAIRO_WEEKDAY_SHORT_TO_INDEX[label];
  if (idx === undefined) {
    throw new Error(`Unexpected Cairo weekday label: ${label}`);
  }
  return idx;
}

export function toDateOnlyUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toTimeOnlyUtc(value: Date): string {
  return value.toISOString().slice(11, 19);
}

export function slotStartCompositeKey(row: {
  date: Date;
  startTime: Date;
}): string {
  return `${toDateOnlyUtc(row.date)}T${toTimeOnlyUtc(row.startTime)}`;
}

export function getCairoNowCompositeKey(): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}T${byType.get('hour')}:${byType.get('minute')}:${byType.get('second')}`;
}

/** True if slot wall-clock start (date + time in Cairo ordering) is strictly after "now" in Cairo. */
export function isSlotStartStrictlyInFutureCairo(row: {
  date: Date;
  startTime: Date;
}): boolean {
  return slotStartCompositeKey(row) > getCairoNowCompositeKey();
}

/**
 * Client may request cancel/reschedule only if appointment start is at least 24h after now (Cairo wall clock).
 * Equivalent to: now <= slotStart - 24h  =>  slotStart >= now + 24h.
 */
export function isAtLeast24HoursBeforeSlotStartCairo(row: {
  date: Date;
  startTime: Date;
}): boolean {
  const slotKey = slotStartCompositeKey(row);
  const nowKey = getCairoNowCompositeKey();
  const slotMs = compositeKeyToApproxUtcMs(slotKey);
  const nowMs = compositeKeyToApproxUtcMs(nowKey);
  if (slotMs === null || nowMs === null) {
    return false;
  }
  return slotMs - nowMs >= 24 * 60 * 60 * 1000;
}

/**
 * Parses composite keys produced by this module (YYYY-MM-DDTHH:mm:ss) as **UTC** instants
 * by interpreting the components as a naive UTC timestamp. This matches `SlotsService` and
 * stored Prisma `@db.Date` / `@db.Time` UTC projections used across Sprint 4–5.
 */
function compositeKeyToApproxUtcMs(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(key);
  if (!m) {
    return null;
  }
  const [, y, mo, d, h, mi, s] = m;
  return Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  );
}
