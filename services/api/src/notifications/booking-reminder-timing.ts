import {
  compositeKeyToApproxUtcMs,
  getCairoNowCompositeKey,
} from '../common/cairo-slot-time';

/**
 * "Now" on the same axis as `bookingSlotStartUtcMs` (Cairo wall clock stored as
 * composite keys). Do not use `Date.now()` alone — it drifts ~2h from slot times in Egypt.
 */
export function reminderComparisonNowMs(
  fallbackMs: number = Date.now(),
): number {
  return compositeKeyToApproxUtcMs(getCairoNowCompositeKey()) ?? fallbackMs;
}

/** Minutes from `now` until slot start (negative if slot is in the past). */
export function minutesUntilSlot(slotMs: number, nowMs: number): number {
  return (slotMs - nowMs) / 60_000;
}

/**
 * ~24h reminder: appointment is in the future, more than the final reminder lead
 * time away, and within `hoursBefore` of start. Catches late confirmations; dedup
 * in notification logs prevents repeat sends on each cron tick.
 */
export function is24HourReminderDue(
  slotMs: number,
  nowMs: number,
  hoursBefore: number,
  minutesBeforeFinal: number,
): boolean {
  const minutesUntil = minutesUntilSlot(slotMs, nowMs);
  const maxLeadMinutes = hoursBefore * 60;
  return minutesUntil > minutesBeforeFinal && minutesUntil <= maxLeadMinutes;
}

/**
 * Final reminder: any time the appointment is in the future and within
 * `minutesBeforeFinal` (default 90) — covers same-day confirms inside that window.
 */
export function is90MinuteReminderDue(
  slotMs: number,
  nowMs: number,
  minutesBeforeFinal: number,
): boolean {
  const minutesUntil = minutesUntilSlot(slotMs, nowMs);
  return minutesUntil > 0 && minutesUntil <= minutesBeforeFinal;
}
