import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingItemLineStatus,
  InvoiceStatus,
  LoyaltyTransactionType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  QueueEntryStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { lockBookingForPayments } from '../billing/booking-lock';
import { assertDashboardBranchAccess } from '../billing/dashboard-branch-scope';
import { assertMoneyDayOpen } from '../billing/business-day-guard';
import { InvoicesService } from '../billing/invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_SETTINGS_ID } from '../settings/settings.constants';
import type { PatchLoyaltySettingsDto } from './dto/loyalty.dto';
import {
  computeLoyaltySummary,
  loadLoyaltyRules,
  SETTLED_INVOICE,
  type LoyaltyRules,
  type LoyaltySummary,
} from './loyalty-balance';

type Db = PrismaService | Prisma.TransactionClient;

export type { LoyaltyRules, LoyaltySummary };

function business(status: HttpStatus, code: string, message: string) {
  return new HttpException(
    { statusCode: status, error: HttpStatus[status], code, message },
    status,
  );
}

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : Number(d.toString());

/**
 * Loyalty program from the salon's price list:
 *  - 1 EGP paid = 1 point (rate configurable), 1000 points = 50 EGP off (configurable);
 *  - every 5th completed visit earns one free reward service (Blow Dry).
 *
 * Earned points are computed from PAID payments (so an edited, cancelled or refunded payment
 * is reflected without any bookkeeping). Redemptions create a LOYALTY payment on the invoice
 * plus a ledger row; they count for as long as that payment stays PAID.
 */
@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly audit: AuditService,
  ) {}

  getRules(db: Db = this.prisma): Promise<LoyaltyRules> {
    return loadLoyaltyRules(db);
  }

  async patchRules(user: DashboardJwtUser, dto: PatchLoyaltySettingsDto) {
    const before = await this.getRules();
    if (dto.rewardServiceId) {
      const svc = await this.prisma.service.findUnique({
        where: { id: dto.rewardServiceId },
        select: { id: true },
      });
      if (!svc) throw new NotFoundException('Reward service not found');
    }
    const turningOn = dto.enabled === true && !before.enabled;
    await this.prisma.systemSettings.update({
      where: { id: SYSTEM_SETTINGS_ID },
      data: {
        ...(dto.enabled !== undefined && { loyaltyEnabled: dto.enabled }),
        ...(dto.pointsPerEgp !== undefined && {
          loyaltyPointsPerEgp: new Prisma.Decimal(dto.pointsPerEgp),
        }),
        ...(dto.redeemPoints !== undefined && {
          loyaltyRedeemPoints: dto.redeemPoints,
        }),
        ...(dto.redeemValue !== undefined && {
          loyaltyRedeemValue: new Prisma.Decimal(dto.redeemValue),
        }),
        ...(dto.visitsForReward !== undefined && {
          loyaltyVisitsForReward: dto.visitsForReward,
        }),
        ...(dto.rewardServiceId !== undefined && {
          loyaltyRewardServiceId: dto.rewardServiceId,
        }),
        // The clock starts the first time the program is switched on.
        ...(turningOn && !before.startedAt && { loyaltyStartedAt: new Date() }),
        updatedByUserId: user.userId,
      },
    });
    const after = await this.getRules();
    await this.audit.log({
      userId: user.userId,
      action: 'settings.loyalty.updated',
      module: 'settings',
      entityType: 'Settings',
      oldValue: before,
      newValue: after,
    });
    return after;
  }

  async summaryForClient(
    clientId: string,
    db: Db = this.prisma,
    rulesIn?: LoyaltyRules,
  ): Promise<LoyaltySummary> {
    return computeLoyaltySummary(
      db,
      clientId,
      rulesIn ?? (await loadLoyaltyRules(db)),
    );
  }

  async clientSummary(user: DashboardJwtUser, clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, fullName: true },
    });
    if (!client) throw new NotFoundException('Client not found');
    const summary = await this.summaryForClient(clientId);
    const history = await this.prisma.loyaltyTransaction.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        type: true,
        points: true,
        amountEgp: true,
        note: true,
        createdAt: true,
        payment: { select: { status: true } },
      },
    });
    return {
      client,
      ...summary,
      history: history.map((h) => ({
        id: h.id,
        type: h.type,
        points: h.points,
        amountEgp: h.amountEgp == null ? null : num(h.amountEgp),
        note: h.note,
        createdAt: h.createdAt.toISOString(),
        reversed: h.payment ? h.payment.status !== PaymentStatus.PAID : false,
      })),
    };
  }

  /** Every client with activity since the program started, best balance first. */
  async listClients() {
    const rules = await this.getRules();
    const since = rules.startedAt ? new Date(rules.startedAt) : null;
    if (!since) return { rules, data: [] };
    const [payers, ledgerClients, visitors] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          status: PaymentStatus.PAID,
          method: { not: PaymentMethod.LOYALTY },
          createdAt: { gte: since },
        },
        distinct: ['clientId'],
        select: { clientId: true },
      }),
      this.prisma.loyaltyTransaction.findMany({
        distinct: ['clientId'],
        select: { clientId: true },
      }),
      this.prisma.queueEntry.findMany({
        where: {
          status: QueueEntryStatus.COMPLETED,
          checkedInAt: { gte: since },
          clientId: { not: null },
          booking: { invoices: { some: SETTLED_INVOICE } },
        },
        distinct: ['clientId'],
        select: { clientId: true },
      }),
    ]);
    const ids = [
      ...new Set(
        [...payers, ...ledgerClients, ...visitors]
          .map((r) => r.clientId)
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const clients = await this.prisma.client.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, phone: true },
    });
    const data: Array<LoyaltySummary & { fullName: string; phone: string }> =
      [];
    for (const c of clients) {
      const s = await this.summaryForClient(c.id, this.prisma, rules);
      data.push({ ...s, fullName: c.fullName, phone: c.phone });
    }
    data.sort((a, b) => b.points - a.points || b.visits - a.visits);
    return { rules, data };
  }

  async adjust(
    user: DashboardJwtUser,
    clientId: string,
    points: number,
    note: string,
  ) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) throw new NotFoundException('Client not found');
    const before = await this.summaryForClient(clientId);
    if (before.points + points < 0) {
      throw business(
        HttpStatus.BAD_REQUEST,
        'LOYALTY_NEGATIVE_BALANCE',
        `The client has ${before.points} points; the balance cannot go below zero.`,
      );
    }
    await this.prisma.loyaltyTransaction.create({
      data: {
        clientId,
        type: LoyaltyTransactionType.ADJUST,
        points,
        note: note.trim(),
        createdByUserId: user.userId,
      },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'loyalty.points_adjusted',
      module: 'loyalty',
      entityType: 'Client',
      entityId: clientId,
      severity: 'WARNING',
      newValue: { points, note: note.trim(), balanceBefore: before.points },
    });
    return this.summaryForClient(clientId);
  }

  /** Loyalty state for the client of a queue visit, plus what can be redeemed on this invoice. */
  async summaryForQueueEntry(user: DashboardJwtUser, queueEntryId: string) {
    const ctx = await this.loadVisit(user, queueEntryId, this.prisma);
    const summary = await this.summaryForClient(ctx.clientId);
    const rewardLine = this.findRewardLine(ctx.items, summary.rewardServiceId);
    return {
      ...summary,
      invoiceRemaining: ctx.invoice ? num(ctx.invoice.remainingAmount) : null,
      rewardLineOnVisit: Boolean(rewardLine),
      alreadyRedeemedOnVisit: ctx.redeemedOnVisit,
    };
  }

  async redeemPoints(
    user: DashboardJwtUser,
    queueEntryId: string,
    blocksRequested: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const rules = await this.requireEnabled(tx);
      const ctx = await this.loadVisit(user, queueEntryId, tx, true);
      const invoice = this.requireOpenInvoice(ctx.invoice);
      const summary = await this.summaryForClient(ctx.clientId, tx, rules);
      if (summary.redeemableBlocks < 1) {
        throw business(
          HttpStatus.BAD_REQUEST,
          'LOYALTY_NOT_ENOUGH_POINTS',
          `The client has ${summary.points} points; ${rules.redeemPoints} are needed to redeem.`,
        );
      }
      const remaining = num(invoice.remainingAmount);
      // Never redeem more than the bill: whole blocks only, capped by what is still due.
      const maxByBill = Math.floor(remaining / rules.redeemValue);
      const blocks = Math.min(
        blocksRequested,
        summary.redeemableBlocks,
        maxByBill,
      );
      if (blocks < 1) {
        throw business(
          HttpStatus.BAD_REQUEST,
          'LOYALTY_BILL_TOO_SMALL',
          `The amount still due (${remaining} EGP) is less than one redemption (${rules.redeemValue} EGP).`,
        );
      }
      const amount = new Prisma.Decimal(
        (blocks * rules.redeemValue).toFixed(2),
      );
      const points = blocks * rules.redeemPoints;
      await assertMoneyDayOpen(tx, ctx.branchId, new Date(), { cash: false });
      const payment = await tx.payment.create({
        data: {
          bookingId: ctx.bookingId,
          clientId: ctx.clientId,
          amount,
          method: PaymentMethod.LOYALTY,
          status: PaymentStatus.PAID,
          reference: `LOYALTY-POINTS-${points}`,
          paidAt: new Date(),
          createdByUserId: user.userId,
        },
      });
      await tx.loyaltyTransaction.create({
        data: {
          clientId: ctx.clientId,
          type: LoyaltyTransactionType.REDEEM_POINTS,
          points: -points,
          amountEgp: amount,
          paymentId: payment.id,
          bookingId: ctx.bookingId,
          note: `${points} points redeemed for ${amount.toString()} EGP`,
          createdByUserId: user.userId,
        },
      });
      await this.invoices.syncInvoicePaymentTotalsForBooking(tx, ctx.bookingId);
      await this.audit.log(
        {
          userId: user.userId,
          action: 'loyalty.points_redeemed',
          module: 'loyalty',
          entityType: 'Client',
          entityId: ctx.clientId,
          branchId: ctx.branchId,
          newValue: {
            points,
            amount: num(amount),
            bookingId: ctx.bookingId,
            queueEntryId,
            paymentId: payment.id,
          },
        },
        tx,
      );
      return {
        redeemedPoints: points,
        amount: num(amount),
        loyalty: await this.summaryForClient(ctx.clientId, tx, rules),
      };
    });
  }

  async redeemReward(user: DashboardJwtUser, queueEntryId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rules = await this.requireEnabled(tx);
      const ctx = await this.loadVisit(user, queueEntryId, tx, true);
      const invoice = this.requireOpenInvoice(ctx.invoice);
      const summary = await this.summaryForClient(ctx.clientId, tx, rules);
      if (summary.rewardsAvailable < 1) {
        throw business(
          HttpStatus.BAD_REQUEST,
          'LOYALTY_NO_REWARD',
          `No free ${rules.rewardServiceName ?? 'reward'} available yet: ${summary.visitsToNextReward} more visit(s) needed.`,
        );
      }
      const line = this.findRewardLine(ctx.items, rules.rewardServiceId);
      if (!line) {
        throw business(
          HttpStatus.BAD_REQUEST,
          'LOYALTY_REWARD_SERVICE_NOT_ON_VISIT',
          `Add ${rules.rewardServiceName ?? 'the reward service'} to this visit first; the reward pays for that line.`,
        );
      }
      // One free service: the unit price, never more than the line still costs after its
      // own discount, never more than what is left on the bill.
      const unit = num(line.priceSnapshot);
      const lineNet = Math.max(
        0,
        unit * line.quantity - num(line.discountAmount),
      );
      const remaining = num(invoice.remainingAmount);
      const value = Math.min(unit, lineNet, remaining);
      if (value <= 0) {
        throw business(
          HttpStatus.BAD_REQUEST,
          'LOYALTY_NOTHING_TO_PAY',
          'There is nothing left to pay on this invoice.',
        );
      }
      const amount = new Prisma.Decimal(value.toFixed(2));
      await assertMoneyDayOpen(tx, ctx.branchId, new Date(), { cash: false });
      const payment = await tx.payment.create({
        data: {
          bookingId: ctx.bookingId,
          clientId: ctx.clientId,
          amount,
          method: PaymentMethod.LOYALTY,
          status: PaymentStatus.PAID,
          reference: 'LOYALTY-REWARD',
          paidAt: new Date(),
          createdByUserId: user.userId,
        },
      });
      await tx.loyaltyTransaction.create({
        data: {
          clientId: ctx.clientId,
          type: LoyaltyTransactionType.REWARD,
          points: 0,
          amountEgp: amount,
          paymentId: payment.id,
          bookingId: ctx.bookingId,
          note: `Free ${rules.rewardServiceName ?? 'reward'} (every ${rules.visitsForReward} visits)`,
          createdByUserId: user.userId,
        },
      });
      await this.invoices.syncInvoicePaymentTotalsForBooking(tx, ctx.bookingId);
      await this.audit.log(
        {
          userId: user.userId,
          action: 'loyalty.reward_redeemed',
          module: 'loyalty',
          entityType: 'Client',
          entityId: ctx.clientId,
          branchId: ctx.branchId,
          newValue: {
            amount: value,
            bookingId: ctx.bookingId,
            queueEntryId,
            paymentId: payment.id,
          },
        },
        tx,
      );
      return {
        amount: value,
        loyalty: await this.summaryForClient(ctx.clientId, tx, rules),
      };
    });
  }

  private async requireEnabled(db: Db): Promise<LoyaltyRules> {
    const rules = await this.getRules(db);
    if (!rules.enabled || !rules.startedAt) {
      throw business(
        HttpStatus.BAD_REQUEST,
        'LOYALTY_DISABLED',
        'The loyalty program is switched off.',
      );
    }
    return rules;
  }

  private requireOpenInvoice<
    T extends { remainingAmount: Prisma.Decimal } | null,
  >(invoice: T): NonNullable<T> {
    if (!invoice) {
      throw business(
        HttpStatus.BAD_REQUEST,
        'INVOICE_REQUIRED',
        'Finalize the invoice before redeeming loyalty.',
      );
    }
    if (invoice.remainingAmount.lessThanOrEqualTo(0)) {
      throw business(
        HttpStatus.BAD_REQUEST,
        'LOYALTY_NOTHING_TO_PAY',
        'There is nothing left to pay on this invoice.',
      );
    }
    return invoice;
  }

  private findRewardLine<
    T extends {
      serviceId: string | null;
      lineStatus: BookingItemLineStatus;
      serviceVariant: { serviceId: string } | null;
    },
  >(items: T[], rewardServiceId: string | null): T | null {
    if (!rewardServiceId) return null;
    return (
      items.find(
        (it) =>
          it.lineStatus !== BookingItemLineStatus.CANCELLED &&
          (it.serviceId === rewardServiceId ||
            it.serviceVariant?.serviceId === rewardServiceId),
      ) ?? null
    );
  }

  private async loadVisit(
    user: DashboardJwtUser,
    queueEntryId: string,
    db: Db,
    lockForPayment = false,
  ) {
    const entry = await db.queueEntry.findUnique({
      where: { id: queueEntryId },
      select: { id: true, branchId: true, bookingId: true, clientId: true },
    });
    if (!entry) throw new NotFoundException('Queue entry not found');
    assertDashboardBranchAccess(user, entry.branchId);
    if (!entry.bookingId) {
      throw business(
        HttpStatus.BAD_REQUEST,
        'QUEUE_ENTRY_NO_BOOKING',
        'Queue entry has no linked booking',
      );
    }
    if (lockForPayment) {
      // Same lock as the cashier's payment, so a redemption and a payment cannot both use the balance.
      await lockBookingForPayments(db, entry.bookingId);
    }
    const booking = await db.booking.findUnique({
      where: { id: entry.bookingId },
      select: {
        id: true,
        clientId: true,
        items: {
          select: {
            id: true,
            serviceId: true,
            lineStatus: true,
            priceSnapshot: true,
            quantity: true,
            discountAmount: true,
            serviceVariant: { select: { serviceId: true } },
          },
        },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    const invoice = await db.invoice.findFirst({
      where: { bookingId: booking.id, status: InvoiceStatus.FINALIZED },
      orderBy: { createdAt: 'desc' },
      select: { id: true, remainingAmount: true, totalAmount: true },
    });
    const redeemedOnVisit = await db.loyaltyTransaction.count({
      where: {
        bookingId: booking.id,
        payment: { status: PaymentStatus.PAID },
      },
    });
    return {
      branchId: entry.branchId,
      bookingId: booking.id,
      clientId: booking.clientId,
      items: booking.items,
      invoice,
      redeemedOnVisit,
    };
  }
}
