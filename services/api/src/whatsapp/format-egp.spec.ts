import { Prisma } from '@prisma/client';
import { formatEgpAmount } from './format-egp';

describe('formatEgpAmount', () => {
  it('formats Prisma.Decimal', () => {
    expect(formatEgpAmount(new Prisma.Decimal('228.5'))).toBe('228.50 EGP');
  });

  it('formats zero', () => {
    expect(formatEgpAmount(0)).toBe('0.00 EGP');
  });
});
