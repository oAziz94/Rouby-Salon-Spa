const DISPLAY_LOCALE = "en-US";

/** Salon operational calendar (matches `services/api` `cairo-slot-time.ts`). */
const CAIRO_TIME_ZONE = "Africa/Cairo";

/**
 * Current instant as `YYYY-MM-DDTHH:mm:ss` using **Africa/Cairo** wall clock (naive string;
 * comparable lexicographically with other Cairo composite keys from the API).
 */
export function getCairoNowCompositeKey(): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CAIRO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}T${byType.get("hour")}:${byType.get("minute")}:${byType.get("second")}`;
}

/** Cairo calendar `YYYY-MM-DD` for “today” at the salon. */
export function cairoTodayYmd(): string {
  return getCairoNowCompositeKey().slice(0, 10);
}

/**
 * Formats API wall-clock times (`HH:mm` or `HH:mm:ss`, not tied to JS local TZ)
 * as 12-hour with AM/PM. Matches prior web behavior (UTC anchor for hour/minute).
 */
export function formatWallClock12h(isoTime: string): string {
  const trimmed = isoTime.trim();
  const parts = trimmed.split(":");
  if (parts.length < 2) {
    return trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed;
  }
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    return trimmed.slice(0, 5);
  }
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(d);
}

export function formatWallClockRange12h(
  start: string,
  end: string,
  separator = " – ",
): string {
  // Walk-ins carry their arrival time as both start and end: show it once.
  if (start === end) {
    return formatWallClock12h(start);
  }
  return `${formatWallClock12h(start)}${separator}${formatWallClock12h(end)}`;
}

/** ISO timestamps (e.g. booking `createdAt`) with date + 12-hour time. */
/** `2026-10-03` -> `Sat 3 Oct 2026`. The calendar day as stored; no timezone shift. */
export function formatDayLabel(ymd: string | null | undefined, empty = "—"): string {
  if (!ymd) return empty;
  if (!/^\d{4}-\d{2}-\d{2}/.test(ymd)) return ymd;
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function formatDateTimeAmPm(iso: string | undefined | null, empty = "—"): string {
  if (iso == null || iso === "") {
    return empty;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  }).format(d);
}
