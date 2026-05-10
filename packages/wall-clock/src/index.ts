const DISPLAY_LOCALE = "en-US";

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
  return `${formatWallClock12h(start)}${separator}${formatWallClock12h(end)}`;
}

/** ISO timestamps (e.g. booking `createdAt`) with date + 12-hour time. */
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
