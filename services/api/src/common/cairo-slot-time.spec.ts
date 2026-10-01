import {
  addDaysToYmdInCairo,
  cairoMonthRangeContainingYmd,
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
