import {
  CAIRO_TIME_ZONE,
  compositeKeyToApproxUtcMs,
  slotStartCompositeKey,
  toDateOnlyUtc,
  toTimeOnlyUtc,
} from '../common/cairo-slot-time';

export function formatBookingDateLabel(date: Date): string {
  const ymd = toDateOnlyUtc(date);
  const instant = new Date(`${ymd}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CAIRO_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(instant);
}

export function formatBookingTimeLabel(startTime: Date): string {
  const hhmmss = toTimeOnlyUtc(startTime);
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(hhmmss);
  if (!m) {
    return hhmmss.slice(0, 5);
  }
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const d = new Date(Date.UTC(1970, 0, 1, hour, minute));
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(d);
}

export function bookingSlotStartUtcMs(row: {
  date: Date;
  startTime: Date;
}): number | null {
  return compositeKeyToApproxUtcMs(slotStartCompositeKey(row));
}
