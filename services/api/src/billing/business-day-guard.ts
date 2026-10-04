import { HttpException, HttpStatus } from '@nestjs/common';
import {
  CashDrawerSessionStatus,
  DailyClosingStatus,
  Prisma,
} from '@prisma/client';
import { parseBusinessDateUtc } from '../finance/finance-day.util';

/**
 * A closed business day and a counted cash drawer are final: money recorded on that day
 * (new payments, edits, voids, loyalty redemptions) would change figures that were already
 * signed off. `at` is the moment the money counts on (paidAt, or now for a new payment);
 * `cash` is true when cash in the drawer is involved.
 */
export async function assertMoneyDayOpen(
  tx: Prisma.TransactionClient,
  branchId: string,
  at: Date,
  opts: { cash: boolean },
): Promise<void> {
  const day = at.toISOString().slice(0, 10);
  const businessDate = parseBusinessDateUtc(day);
  const key = { branchId_businessDate: { branchId, businessDate } };
  const [closing, drawer] = await Promise.all([
    tx.dailyClosing.findUnique({ where: key, select: { status: true } }),
    opts.cash
      ? tx.cashDrawerSession.findUnique({
          where: key,
          select: { status: true },
        })
      : null,
  ]);
  if (closing?.status === DailyClosingStatus.CLOSED) {
    throw new HttpException(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'BUSINESS_DAY_CLOSED',
        message: `The business day ${day} is already closed, so its payments can no longer be added or changed. Record it on the next working day.`,
      },
      HttpStatus.CONFLICT,
    );
  }
  if (drawer?.status === CashDrawerSessionStatus.CLOSED) {
    throw new HttpException(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'CASH_DRAWER_CLOSED',
        message: `The cash drawer for ${day} is already counted and closed, so cash can no longer be recorded or changed for that day. Use another payment method, or record the cash on the next working day.`,
      },
      HttpStatus.CONFLICT,
    );
  }
}
