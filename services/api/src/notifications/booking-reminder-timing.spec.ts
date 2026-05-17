import { compositeKeyToApproxUtcMs } from '../common/cairo-slot-time';
import {
  is24HourReminderDue,
  is90MinuteReminderDue,
  minutesUntilSlot,
} from './booking-reminder-timing';

describe('booking-reminder-timing', () => {
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

  it('24h reminder is due between final lead time and hoursBefore', () => {
    const now = Date.now();
    const hoursBefore = 24;
    const minutesBeforeFinal = 90;
    expect(
      is24HourReminderDue(
        now + 20 * 60 * 60_000,
        now,
        hoursBefore,
        minutesBeforeFinal,
      ),
    ).toBe(true);
    expect(
      is24HourReminderDue(
        now + 25 * 60 * 60_000,
        now,
        hoursBefore,
        minutesBeforeFinal,
      ),
    ).toBe(false);
    expect(
      is24HourReminderDue(
        now + 60 * 60_000,
        now,
        hoursBefore,
        minutesBeforeFinal,
      ),
    ).toBe(false);
    expect(
      is24HourReminderDue(
        now + 90 * 60_000,
        now,
        hoursBefore,
        minutesBeforeFinal,
      ),
    ).toBe(false);
  });

  it('24h reminder catches late confirmation (12h before appointment)', () => {
    const now = Date.now();
    expect(is24HourReminderDue(now + 12 * 60 * 60_000, now, 24, 90)).toBe(true);
  });
});
