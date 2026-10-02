import {
  addDaysToYmdInCairo,
  cairoMonthRangeContainingYmd,
  presentBookingSlot,
} from './cairo-slot-time';

describe('addDaysToYmdInCairo', () => {
  it.each([
    ['2026-10-29', 1, '2026-10-30'], // 25h DST fall-back day (regression: used to return the same date)
    ['2025-10-30', 1, '2025-10-31'],
    ['2026-04-24', 1, '2026-04-25'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-01-01', -1, '2025-12-31'],
  ])('%s %+d day(s) => %s', (ymd, delta, expected) => {
    expect(addDaysToYmdInCairo(ymd, delta)).toBe(expected);
  });

  it('walks every day of October 2026 without stalling', () => {
    const { monthStartYmd, monthEndYmd } =
      cairoMonthRangeContainingYmd('2026-10-01');
    const days: string[] = [];
    for (let d = monthStartYmd; d <= monthEndYmd && days.length < 40; ) {
      days.push(d);
      d = addDaysToYmdInCairo(d, 1);
    }
    expect(days).toHaveLength(31);
  });
});

describe('presentBookingSlot', () => {
  const bucket = {
    date: new Date('2026-10-02T00:00:00.000Z'),
    startTime: new Date('1970-01-01T23:30:00.000Z'),
    endTime: new Date('1970-01-01T23:45:00.000Z'),
  };

  it('shows a walk-in at its arrival time, not at the internal 23:30 bucket slot', () => {
    expect(
      presentBookingSlot(bucket, {
        source: 'WALK_IN',
        createdAt: new Date('2026-10-02T12:55:49.000Z'), // 15:55 in Cairo (UTC+3, summer time)
      }),
    ).toEqual({
      date: '2026-10-02',
      startTime: '15:55:49',
      endTime: '15:55:49',
      isWalkIn: true,
    });
  });

  it('uses the Cairo calendar day for a walk-in registered after midnight UTC+0 boundary', () => {
    const out = presentBookingSlot(bucket, {
      source: 'WALK_IN',
      createdAt: new Date('2026-10-02T22:30:00.000Z'), // 01:30 on 3 Oct in Cairo
    });
    expect(out.date).toBe('2026-10-03');
    expect(out.startTime).toBe('01:30:00');
  });

  it('leaves appointments untouched', () => {
    expect(
      presentBookingSlot(
        {
          date: new Date('2026-10-03T00:00:00.000Z'),
          startTime: new Date('1970-01-01T20:00:00.000Z'),
          endTime: new Date('1970-01-01T21:00:00.000Z'),
        },
        {
          source: 'DASHBOARD',
          createdAt: new Date('2026-10-01T10:00:00.000Z'),
        },
      ),
    ).toEqual({
      date: '2026-10-03',
      startTime: '20:00:00',
      endTime: '21:00:00',
      isWalkIn: false,
    });
  });
});
