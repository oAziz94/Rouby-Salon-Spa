import { compositeKeyToApproxUtcMs } from '../common/cairo-slot-time';
import {
  is24HourReminderCronDue,
  is90MinuteReminderDue,
  minutesUntilSlot,
} from './booking-reminder-timing';

describe('booking-reminder-timing', () => {
  const windowMs = 30 * 60 * 1000;

  it('computes minutes until slot', () => {
    const now = 1_000_000;
    expect(minutesUntilSlot(now + 45 * 60_000, now)).toBe(45);
    expect(minutesUntilSlot(now - 60_000, now)).toBe(-1);
  });

  it('90m reminder is due when appointment is within 90 minutes', () => {
    const now = Date.now();
    expect(is90MinuteReminderDue(now + 45 * 60_000, now, 90)).toBe(true);
    expect(is90MinuteReminderDue(now + 90 * 60_000, now, 90)).toBe(true);
    expect(is90MinuteReminderDue(now + 91 * 60_000, now, 90)).toBe(false);
    expect(is90MinuteReminderDue(now - 60_000, now, 90)).toBe(false);
  });

  it('90m reminder uses Cairo composite clock (34 min same-day booking)', () => {
    const nowKey = '2026-05-17T14:00:00';
    const slotKey = '2026-05-17T14:34:00';
    const nowMs = compositeKeyToApproxUtcMs(nowKey);
    const slotMs = compositeKeyToApproxUtcMs(slotKey);
    expect(nowMs).not.toBeNull();
    expect(slotMs).not.toBeNull();
    expect(is90MinuteReminderDue(slotMs!, nowMs!, 90)).toBe(true);
    // Real UTC `Date.now()` would treat slot as ~154 min away (UTC+2 skew).
    const realUtcNowMs = compositeKeyToApproxUtcMs('2026-05-17T12:00:00')!;
    expect(is90MinuteReminderDue(slotMs!, realUtcNowMs, 90)).toBe(false);
  });

  it('24h reminder uses anchored cron window', () => {
    const now = 1_000_000_000;
    const hoursBefore = 24;
    const slotAt24hTarget = now + hoursBefore * 3_600_000 - 10 * 60_000;
    expect(
      is24HourReminderCronDue(slotAt24hTarget, now, hoursBefore, windowMs),
    ).toBe(true);
    const slotTooFar = now + hoursBefore * 3_600_000 + windowMs + 60_000;
    expect(
      is24HourReminderCronDue(slotTooFar, now, hoursBefore, windowMs),
    ).toBe(false);
  });
});
