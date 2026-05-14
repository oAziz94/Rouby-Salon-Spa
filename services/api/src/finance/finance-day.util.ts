import type { Prisma } from '@prisma/client';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

/** Calendar day in UTC, matching queue/payments dashboard conventions. */
export function parseBusinessDateUtc(dateStr: string): Date {
  return new Date(`${dateStr.trim()}T00:00:00.000Z`);
}

export function utcBusinessDayInclusiveRange(dateStr: string): {
  start: Date;
  end: Date;
} {
  const start = parseBusinessDateUtc(dateStr);
  const end = new Date(start.getTime());
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

export function paymentRecordedInBusinessDayWhere(
  branchId: string,
  dateStr: string,
): Prisma.PaymentWhereInput {
  const { start, end } = utcBusinessDayInclusiveRange(dateStr);
  return {
    booking: { is: { branchId } },
    OR: [
      {
        paidAt: {
          not: null,
          gte: start,
          lte: end,
        },
      },
      {
        AND: [
          { paidAt: null },
          {
            createdAt: {
              gte: start,
              lte: end,
            },
          },
        ],
      },
    ],
  };
}

export function paidCashPaymentsOnDayWhere(
  branchId: string,
  dateStr: string,
): Prisma.PaymentWhereInput {
  return {
    AND: [
      { status: PaymentStatus.PAID },
      { method: PaymentMethod.CASH },
      paymentRecordedInBusinessDayWhere(branchId, dateStr),
    ],
  };
}

export function paidPaymentsOnDayWhere(
  branchId: string,
  dateStr: string,
): Prisma.PaymentWhereInput {
  return {
    AND: [
      { status: PaymentStatus.PAID },
      paymentRecordedInBusinessDayWhere(branchId, dateStr),
    ],
  };
}
