import {
  slotAutoGenerationEnabled,
  slotHorizonDays,
} from './slot-generation.utils';

describe('slot horizon settings', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults to 28 days', () => {
    delete process.env.SLOT_HORIZON_DAYS;
    expect(slotHorizonDays()).toBe(28);
  });

  it.each([
    ['14', 14],
    ['3', 7], // never below a week
    ['400', 90], // never above 90 days
    ['abc', 28],
  ])('SLOT_HORIZON_DAYS=%s => %d', (raw, expected) => {
    process.env.SLOT_HORIZON_DAYS = raw;
    expect(slotHorizonDays()).toBe(expected);
  });

  it('is on unless SLOT_AUTOGEN_ENABLED=false', () => {
    delete process.env.SLOT_AUTOGEN_ENABLED;
    expect(slotAutoGenerationEnabled()).toBe(true);
    process.env.SLOT_AUTOGEN_ENABLED = 'false';
    expect(slotAutoGenerationEnabled()).toBe(false);
  });
});
