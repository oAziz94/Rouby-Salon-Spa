import { BookingItemType, Prisma, type SystemSettings } from '@prisma/client';
import {
  BookingPricingService,
  lineNetAmount,
  type ResolvedBookingLine,
} from './booking-pricing.service';

function line(
  price: number,
  qty = 1,
  discount?: number,
  isTaxable = true,
): ResolvedBookingLine {
  return {
    itemType: BookingItemType.SERVICE,
    serviceId: 'svc',
    serviceVariantId: null,
    packageId: null,
    bundleId: null,
    serviceEnhancementId: null,
    nameSnapshot: 'Hair Cut',
    priceSnapshot: new Prisma.Decimal(price),
    durationMinutesSnapshot: 30,
    quantity: qty,
    isTaxable,
    lineMetadata: null,
    discountAmount:
      discount === undefined ? undefined : new Prisma.Decimal(discount),
  };
}

function settings(overrides: Partial<SystemSettings> = {}): SystemSettings {
  return {
    vatEnabled: false,
    defaultVatRate: new Prisma.Decimal('0.14'),
    pricesIncludeVat: false,
    ...overrides,
  } as SystemSettings;
}

describe('line discounts', () => {
  const pricing = new BookingPricingService({} as never);

  it('nets a line to unit × qty − its discount, never below zero', () => {
    expect(lineNetAmount(line(450))).toBe(450);
    expect(lineNetAmount(line(100, 2, 30))).toBe(170);
    expect(lineNetAmount(line(100, 1, 500))).toBe(0);
  });

  it('subtotal is the sum of net lines; the receipt discount comes off afterwards', () => {
    const t = pricing.computeTotals(
      [line(450, 1, 50), line(350)],
      settings(),
      100,
    );
    expect(Number(t.subtotal)).toBe(750);
    expect(Number(t.discountAmount)).toBe(100);
    expect(Number(t.totalAmount)).toBe(650);
  });

  it('VAT is charged on the discounted line amount', () => {
    const t = pricing.computeTotals(
      [line(1000, 1, 200)],
      settings({ vatEnabled: true }),
      0,
    );
    expect(Number(t.subtotal)).toBe(800);
    expect(Number(t.vatAmount)).toBe(112);
    expect(Number(t.totalAmount)).toBe(912);
  });
});
