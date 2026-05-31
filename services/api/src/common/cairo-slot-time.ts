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
    hourCycle: 'h23',
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
export function compositeKeyToApproxUtcMs(key: string): number | null {
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

function zonedTimeParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const pick = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  return {
    ymd: `${pick('year')}-${String(pick('month')).padStart(2, '0')}-${String(pick('day')).padStart(2, '0')}`,
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}

function startOfZonedDayUtc(ymd: string, timeZone: string): Date {
  const [y, mo, da] = ymd.split('-').map(Number);
  if (!y || !mo || !da) {
    throw new Error(`Invalid ymd: ${ymd}`);
  }

  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const formatYmd = (instant: Date) => dateFmt.format(instant);

  /** First UTC ms where `timeZone` civil date is `ymd` (handles non–whole-hour offsets). */
  let lo = Date.UTC(y, mo - 1, da, 12, 0, 0, 0) - 48 * 3600 * 1000;
  let hi = Date.UTC(y, mo - 1, da, 12, 0, 0, 0) + 48 * 3600 * 1000;
  for (let i = 0; i < 40 && formatYmd(new Date(lo)) >= ymd; i++) {
    lo -= 24 * 3600 * 1000;
  }
  for (let i = 0; i < 40 && formatYmd(new Date(hi)) < ymd; i++) {
    hi += 24 * 3600 * 1000;
  }
  if (formatYmd(new Date(lo)) >= ymd || formatYmd(new Date(hi)) < ymd) {
    throw new Error(`Could not resolve start of ${ymd} in ${timeZone}`);
  }

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (formatYmd(new Date(mid)) >= ymd) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  if (formatYmd(new Date(lo)) !== ymd) {
    throw new Error(`Could not resolve start of ${ymd} in ${timeZone}`);
  }

  return new Date(lo);
}

function startOfNextZonedDayUtc(ymd: string, timeZone: string): Date {
  const start = startOfZonedDayUtc(ymd, timeZone);
  let lo = start.getTime();
  let hi = start.getTime() + 40 * 3600 * 1000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(mid)) === ymd
    ) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return new Date(hi);
}

/** Civil `YYYY-MM-DD` in Africa/Cairo for `date` (default: now). */
export function ymdInCairo(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Same calendar day as `getCairoNowCompositeKey().slice(0, 10)` — salon "today". */
export function cairoTodayYmd(): string {
  return getCairoNowCompositeKey().slice(0, 10);
}

/** UTC `[start, endExclusive)` covering the full Cairo civil day for `ymd`. */
export function cairoZonedDayUtcRange(ymd: string): {
  start: Date;
  endExclusive: Date;
} {
  return {
    start: startOfZonedDayUtc(ymd, CAIRO_TIME_ZONE),
    endExclusive: startOfNextZonedDayUtc(ymd, CAIRO_TIME_ZONE),
  };
}

export function addDaysToYmdInCairo(ymd: string, deltaDays: number): string {
  const base = startOfZonedDayUtc(ymd, CAIRO_TIME_ZONE);
  const t = new Date(base.getTime() + deltaDays * 86400000);
  return ymdInCairo(t);
}

/** Monday–Sunday week (Monday first) containing `ymd`, Cairo calendar. */
export function cairoMondayWeekRangeContainingYmd(ymd: string): {
  weekStartYmd: string;
  weekEndYmd: string;
} {
  const start = startOfZonedDayUtc(ymd, CAIRO_TIME_ZONE);
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TIME_ZONE,
    weekday: 'short',
  }).format(start);
  const mondayFirst: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const idx = mondayFirst[label.slice(0, 3)] ?? 0;
  const weekStartYmd = addDaysToYmdInCairo(ymd, -idx);
  const weekEndYmd = addDaysToYmdInCairo(weekStartYmd, 6);
  return { weekStartYmd, weekEndYmd };
}

export function cairoMonthRangeContainingYmd(ymd: string): {
  monthStartYmd: string;
  monthEndYmd: string;
} {
  const z = zonedTimeParts(
    startOfZonedDayUtc(ymd, CAIRO_TIME_ZONE),
    CAIRO_TIME_ZONE,
  );
  const y = Number(z.ymd.slice(0, 4));
  const m = Number(z.ymd.slice(5, 7));
  const monthStartYmd = `${y}-${String(m).padStart(2, '0')}-01`;
  let ny = y;
  let nm = m + 1;
  if (nm > 12) {
    nm = 1;
    ny += 1;
  }
  const nextFirst = `${ny}-${String(nm).padStart(2, '0')}-01`;
  const endEx = startOfZonedDayUtc(nextFirst, CAIRO_TIME_ZONE);
  const lastInstant = new Date(endEx.getTime() - 1);
  const monthEndYmd = ymdInCairo(lastInstant);
  return { monthStartYmd, monthEndYmd };
}
