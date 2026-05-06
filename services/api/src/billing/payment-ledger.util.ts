import { PaymentStatus, Prisma } from '@prisma/client';
import { SIMPLE_PAYMENT_STATUS_REFERENCE } from './billing.constants';

export function sumPaidPayments(
  payments: Array<{ amount: Prisma.Decimal; status: PaymentStatus }>,
): Prisma.Decimal {
  let s = new Prisma.Decimal(0);
  for (const p of payments) {
    if (p.status === PaymentStatus.PAID) {
      s = s.add(p.amount);
    }
  }
  return s;
}

/** PAID rows excluding the simple-status synthetic row (used for caps / remainder). */
export function sumPaidManualPayments(
  payments: Array<{
    amount: Prisma.Decimal;
    status: PaymentStatus;
    reference: string | null;
  }>,
): Prisma.Decimal {
  let s = new Prisma.Decimal(0);
  for (const p of payments) {
    if (p.status !== PaymentStatus.PAID) continue;
    if (p.reference === SIMPLE_PAYMENT_STATUS_REFERENCE) continue;
    s = s.add(p.amount);
  }
  return s;
}

export function decimalMaxZero(v: Prisma.Decimal): Prisma.Decimal {
  const z = new Prisma.Decimal(0);
  return v.lessThan(z) ? z : v;
}
