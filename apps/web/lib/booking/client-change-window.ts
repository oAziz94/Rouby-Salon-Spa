/**
 * Mirrors `services/api/src/common/cairo-slot-time.ts` so the client can
 * mirror cancellation/reschedule eligibility before submit (server remains authoritative).
 */

const CAIRO_TIME_ZONE = "Africa/Cairo";

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

function compositeKeyToApproxUtcMs(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(key);
  if (!m) {
    return null;
  }
  const [, y, mo, d, h, mi, s] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

/** Slot shape returned by `GET /client/bookings/:id` (`mapBookingDetail`). */
export function isAtLeast24HoursBeforeSlotStartFromApiSlot(slot: {
  date: string;
  startTime: string;
}): boolean {
  const slotKey = `${slot.date}T${slot.startTime}`;
  const nowKey = getCairoNowCompositeKey();
  const slotMs = compositeKeyToApproxUtcMs(slotKey);
  const nowMs = compositeKeyToApproxUtcMs(nowKey);
  if (slotMs === null || nowMs === null) {
    return false;
  }
  return slotMs - nowMs >= 24 * 60 * 60 * 1000;
}
