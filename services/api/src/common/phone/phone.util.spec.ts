import { BadRequestException } from '@nestjs/common';
import { normalizePhoneToE164 } from './phone.util';

describe('normalizePhoneToE164', () => {
  it('accepts valid international numbers with plus prefix', () => {
    expect(normalizePhoneToE164('+201001234567')).toBe('+201001234567');
    expect(normalizePhoneToE164('+966501234567')).toBe('+966501234567');
  });

  it('normalizes 00 international prefix to plus', () => {
    expect(normalizePhoneToE164('00201001234567')).toBe('+201001234567');
  });

  it('uses EG default for local numbers without country code', () => {
    expect(normalizePhoneToE164('01001234567')).toBe('+201001234567');
  });

  it('rejects invalid formats', () => {
    expect(() => normalizePhoneToE164('abc123')).toThrow(BadRequestException);
    expect(() => normalizePhoneToE164('++201001234567')).toThrow(
      BadRequestException,
    );
    expect(() => normalizePhoneToE164('123')).toThrow(BadRequestException);
  });
});
