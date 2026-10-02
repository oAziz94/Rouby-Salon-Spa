import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  CashDrawerSessionStatus,
  DailyClosingStatus,
  DayCloseOpenItemsPolicy,
  InvoiceStatus,
  PaymentStatus,
  Prisma,
  QueueEntryStatus,
} from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  assertDashboardBranchAccess,
  resolveDashboardBranchFilter,
} from '../billing/dashboard-branch-scope';
import {
  paidPaymentsOnDayWhere,
  parseBusinessDateUtc,
  utcBusinessDayInclusiveRange,
} from './finance-day.util';
import { CashDrawerService } from './cash-drawer.service';
import { overridableException } from '../common/overridable.exception';
import { SYSTEM_SETTINGS_ID } from '../settings/settings.constants';

function num(d: Prisma.Decimal | number | null | undefined): number {
  if (d === null || d === undefined) {
    return 0;
  }
  if (d instanceof Prisma.Decimal) {
    return Number(d.toString());
  }
  return Number(d);
}

function shortClosingRef(id: string): string {
  const compact = id.replace(/-/g, '').toUpperCase();
  return `DC-${compact.slice(-6)}`;
}

function shortDrawerSessionRef(id: string): string {
  const compact = id.replace(/-/g, '').toUpperCase();
  return `CD-${compact.slice(-6)}`;
}

type ClosingSnapshot = Record<string, unknown>;

@Injectable()
export class DailyClosingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashDrawer: CashDrawerService,
    private readonly audit: AuditService,
  ) {}

  private resolveBranchId(user: DashboardJwtUser, branchId?: string): string {
    const resolved = resolveDashboardBranchFilter(user, branchId);
    if (!resolved) {
      throw new BadRequestException('branchId is required');
    }
    assertDashboardBranchAccess(user, resolved);
    return resolved;
  }

  private assertPermission(user: DashboardJwtUser, key: string): void {
    if (!user.permissions.includes(key)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private invoiceOnBusinessDayWhere(
    branchId: string,
    dateStr: string,
  ): Prisma.InvoiceWhereInput {
    const { start, end } = utcBusinessDayInclusiveRange(dateStr);
    return {
      status: InvoiceStatus.FINALIZED,
      booking: { is: { branchId } },
      createdAt: { gte: start, lte: end },
    };
  }

  private bookingOnSlotDayWhere(
    branchId: string,
    businessDate: Date,
  ): Prisma.BookingWhereInput {
    return {
      branchId,
      slot: { is: { date: businessDate } },
    };
  }

  /**
   * The checklist behind "is the day really finished?" (spec v2 §4): visits still in the
   * queue and invoices with a balance, each listed so they can be resolved or carried over.
   */
  async collectOpenItems(branchId: string, dateStr: string) {
    const { end } = utcBusinessDayInclusiveRange(dateStr);
    const [openVisits, unpaidInvoices] = await Promise.all([
      this.prisma.queueEntry.findMany({
        // No lower bound on purpose: a visit forgotten open on an earlier day must surface here too.
        where: {
          branchId,
          checkedInAt: { lte: end },
          status: {
            in: [QueueEntryStatus.WAITING, QueueEntryStatus.IN_SERVICE],
          },
        },
        orderBy: { checkedInAt: 'asc' },
        take: 100,
        select: {
          id: true,
          bookingId: true,
          status: true,
          checkedInAt: true,
          clientNameSnapshot: true,
          clientPhoneSnapshot: true,
          serviceSummarySnapshot: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          ...this.invoiceOnBusinessDayWhere(branchId, dateStr),
          remainingAmount: { gt: new Prisma.Decimal(0) },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: {
          id: true,
          invoiceNumber: true,
          bookingId: true,
          totalAmount: true,
          paidAmount: true,
          remainingAmount: true,
          client: { select: { id: true, fullName: true, phone: true } },
        },
      }),
    ]);
    return {
      openVisits: openVisits.map((q) => ({
        queueEntryId: q.id,
        bookingId: q.bookingId,
        status: q.status,
        checkedInAt: q.checkedInAt.toISOString(),
        clientName: q.clientNameSnapshot,
        clientPhone: q.clientPhoneSnapshot,
        serviceSummary: q.serviceSummarySnapshot,
      })),
      unpaidInvoices: unpaidInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        bookingId: inv.bookingId,
        client: inv.client,
        totalAmount: num(inv.totalAmount),
        paidAmount: num(inv.paidAmount),
        remainingAmount: num(inv.remainingAmount),
      })),
    };
  }

  private async openItemsPolicy(): Promise<DayCloseOpenItemsPolicy> {
    const row = await this.prisma.systemSettings.findUnique({
      where: { id: SYSTEM_SETTINGS_ID },
      select: { dayCloseOpenItemsPolicy: true },
    });
    return row?.dayCloseOpenItemsPolicy ?? DayCloseOpenItemsPolicy.ALERT;
  }

  async buildLiveSnapshot(
    user: DashboardJwtUser,
    branchId: string,
    dateStr: string,
  ): Promise<{ snapshot: ClosingSnapshot; warnings: string[] }> {
    const businessDate = parseBusinessDateUtc(dateStr);
    const { start, end } = utcBusinessDayInclusiveRange(dateStr);

    const liveDrawer = await this.cashDrawer.computeLiveForBranchBusinessDay(
      branchId,
      businessDate,
    );

    const [
      invoiceAgg,
      paidInvoiceAgg,
      partialInvoiceAgg,
      unpaidInvoiceAgg,
      outstandingAgg,
      paymentTotalAgg,
      paymentMethodGroups,
      bookingTotal,
      bookingCompleted,
      bookingInProgress,
      bookingCancelled,
      queueVisits,
      queueCompleted,
      queueActiveSameDay,
    ] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: this.invoiceOnBusinessDayWhere(branchId, dateStr),
        _count: true,
        _sum: { totalAmount: true, paidAmount: true, remainingAmount: true },
      }),
      this.prisma.invoice.count({
        where: {
          ...this.invoiceOnBusinessDayWhere(branchId, dateStr),
          remainingAmount: { lte: new Prisma.Decimal(0) },
        },
      }),
      this.prisma.invoice.count({
        where: {
          ...this.invoiceOnBusinessDayWhere(branchId, dateStr),
          paidAmount: { gt: new Prisma.Decimal(0) },
          remainingAmount: { gt: new Prisma.Decimal(0) },
        },
      }),
      this.prisma.invoice.count({
        where: {
          ...this.invoiceOnBusinessDayWhere(branchId, dateStr),
          paidAmount: { equals: new Prisma.Decimal(0) },
          remainingAmount: { gt: new Prisma.Decimal(0) },
        },
      }),
      this.prisma.invoice.aggregate({
        where: {
          status: InvoiceStatus.FINALIZED,
          remainingAmount: { gt: new Prisma.Decimal(0) },
          booking: { is: { branchId } },
        },
        _sum: { remainingAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          AND: [
            { status: PaymentStatus.PAID },
            paidPaymentsOnDayWhere(branchId, dateStr),
          ],
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.groupBy({
        by: ['method'],
        where: {
          AND: [
            { status: PaymentStatus.PAID },
            paidPaymentsOnDayWhere(branchId, dateStr),
          ],
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.booking.count({
        where: this.bookingOnSlotDayWhere(branchId, businessDate),
      }),
      this.prisma.booking.count({
        where: {
          ...this.bookingOnSlotDayWhere(branchId, businessDate),
          status: BookingStatus.COMPLETED,
        },
      }),
      this.prisma.booking.count({
        where: {
          ...this.bookingOnSlotDayWhere(branchId, businessDate),
          status: { in: [BookingStatus.IN_PROGRESS, BookingStatus.ARRIVED] },
        },
      }),
      this.prisma.booking.count({
        where: {
          ...this.bookingOnSlotDayWhere(branchId, businessDate),
          status: {
            in: [
              BookingStatus.CANCELLED,
              BookingStatus.REJECTED,
              BookingStatus.NO_SHOW,
            ],
          },
        },
      }),
      this.prisma.queueEntry.count({
        where: {
          branchId,
          checkedInAt: { gte: start, lte: end },
        },
      }),
      this.prisma.queueEntry.count({
        where: {
          branchId,
          status: QueueEntryStatus.COMPLETED,
          completedAt: { gte: start, lte: end },
        },
      }),
      this.prisma.queueEntry.count({
        where: {
          branchId,
          checkedInAt: { gte: start, lte: end },
          status: {
            in: [QueueEntryStatus.WAITING, QueueEntryStatus.IN_SERVICE],
          },
        },
      }),
    ]);

    const breakdown: Record<string, { amount: number; count: number }> = {
      CASH: { amount: 0, count: 0 },
      CARD: { amount: 0, count: 0 },
      INSTAPAY: { amount: 0, count: 0 },
      MOBILE_WALLET: { amount: 0, count: 0 },
      BANK_TRANSFER: { amount: 0, count: 0 },
      OTHER: { amount: 0, count: 0 },
    };
    for (const g of paymentMethodGroups) {
      const key = g.method in breakdown ? g.method : 'OTHER';
      breakdown[key].amount += num(g._sum.amount);
      breakdown[key].count += g._count;
    }

    const grossSales = num(invoiceAgg._sum.totalAmount);
    const totalInvoiced = grossSales;
    const totalPaidOnInvoices = num(invoiceAgg._sum.paidAmount);
    const totalRemainingOnInvoices = num(invoiceAgg._sum.remainingAmount);
    const totalCollected = num(paymentTotalAgg._sum.amount);
    const outstandingBalance = num(outstandingAgg._sum.remainingAmount);

    let drawerBlock: Record<string, unknown> = { state: 'NONE' };
    if (liveDrawer) {
      const { session: drawer, live } = liveDrawer;
      const openedBy = await this.prisma.user.findUnique({
        where: { id: drawer.openedByUserId },
        select: { id: true, name: true },
      });
      const closedBy = drawer.closedByUserId
        ? await this.prisma.user.findUnique({
            where: { id: drawer.closedByUserId },
            select: { id: true, name: true },
          })
        : null;
      const counted =
        drawer.countedCash !== null ? num(drawer.countedCash) : null;
      const diff =
        counted !== null
          ? counted - num(live.expectedCash)
          : drawer.cashDifference !== null
            ? num(drawer.cashDifference)
            : null;
      drawerBlock = {
        state: drawer.status,
        sessionShortRef: shortDrawerSessionRef(drawer.id),
        sessionId: drawer.id,
        openingBalance: num(drawer.openingBalance),
        cashPaymentsTotal: num(live.cashPaymentsTotal),
        cashInTotal: num(live.cashInTotal),
        cashOutTotal: num(live.cashOutTotal),
        adjustmentTotal: num(live.adjustmentTotal),
        expectedCash: num(live.expectedCash),
        countedCash: counted,
        cashDifference: diff,
        openedBy,
        closedBy,
        closedAt: drawer.closedAt?.toISOString() ?? null,
      };
    }

    const snapshot: ClosingSnapshot = {
      version: 1,
      branchId,
      businessDate: dateStr,
      grossSales,
      totalCollected,
      totalInvoices: totalInvoiced,
      totalPaidOnInvoices,
      totalRemainingOnInvoices,
      invoiceCount: invoiceAgg._count,
      finalizedInvoiceCount: invoiceAgg._count,
      paidInvoiceCount: paidInvoiceAgg,
      partiallyPaidInvoiceCount: partialInvoiceAgg,
      unpaidInvoiceCount: unpaidInvoiceAgg,
      outstandingBalance,
      paymentCount: paymentTotalAgg._count,
      paymentBreakdown: breakdown,
      cashDrawer: drawerBlock,
      bookingCount: bookingTotal,
      completedBookingCount: bookingCompleted,
      inProgressBookingCount: bookingInProgress,
      cancelledBookingCount: bookingCancelled,
      queueVisitCount: queueVisits,
      queueCompletedCount: queueCompleted,
      queueActiveCount: queueActiveSameDay,
    };

    const warnings: string[] = [];
    if (liveDrawer?.session.status === CashDrawerSessionStatus.OPEN) {
      warnings.push(
        'Cash drawer is still open — close it before closing the business day.',
      );
    }
    if (unpaidInvoiceAgg > 0 || partialInvoiceAgg > 0) {
      warnings.push('There are unpaid or partially paid invoices.');
    }
    if (queueActiveSameDay > 0) {
      warnings.push('Active queue entries still exist for this business date.');
    }
    if (bookingInProgress > 0) {
      warnings.push('There are bookings still in progress for this slot day.');
    }
    if (
      liveDrawer?.session.status === CashDrawerSessionStatus.CLOSED &&
      liveDrawer.session.cashDifference !== null
    ) {
      const cd = num(liveDrawer.session.cashDifference);
      if (Math.abs(cd) > 0.009) {
        warnings.push('Cash drawer count does not match expected cash.');
      }
    }

    return { snapshot, warnings };
  }

  async getSummary(user: DashboardJwtUser, branchId: string, date: string) {
    this.assertPermission(user, 'dailyClosing.read');
    const bid = this.resolveBranchId(user, branchId);
    const businessDate = parseBusinessDateUtc(date);

    const branch = await this.prisma.branch.findUnique({
      where: { id: bid },
      select: { id: true, name: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const existing = await this.prisma.dailyClosing.findUnique({
      where: { branchId_businessDate: { branchId: bid, businessDate } },
    });

    const { snapshot, warnings } = await this.buildLiveSnapshot(
      user,
      bid,
      date,
    );

    let uiStatus: 'OPEN' | 'DRAFT' | 'CLOSED' = 'OPEN';
    if (existing?.status === DailyClosingStatus.CLOSED) {
      uiStatus = 'CLOSED';
    } else if (existing?.status === DailyClosingStatus.DRAFT) {
      uiStatus = 'DRAFT';
    }

    const [openItems, openItemsPolicy] = await Promise.all([
      this.collectOpenItems(bid, date),
      this.openItemsPolicy(),
    ]);

    const [recentInvoices, recentPayments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: this.invoiceOnBusinessDayWhere(bid, date),
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          client: { select: { id: true, fullName: true } },
          booking: { select: { id: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          AND: [
            { status: PaymentStatus.PAID },
            paidPaymentsOnDayWhere(bid, date),
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          client: { select: { id: true, fullName: true } },
          createdByUser: { select: { id: true, name: true } },
          booking: {
            select: {
              id: true,
              invoices: {
                where: { status: InvoiceStatus.FINALIZED },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { id: true, invoiceNumber: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      branch,
      businessDate: date,
      status: uiStatus,
      existingClosingId: existing?.id ?? null,
      closingStatus: existing?.status ?? null,
      closedBy: existing?.closedByUserId
        ? await this.prisma.user.findUnique({
            where: { id: existing.closedByUserId },
            select: { id: true, name: true },
          })
        : null,
      closedAt: existing?.closedAt?.toISOString() ?? null,
      cashDrawerSummary: snapshot.cashDrawer,
      drawerSessionStatus:
        (snapshot.cashDrawer as { state?: string }).state !== 'NONE'
          ? ((snapshot.cashDrawer as { state?: string }).state ?? null)
          : null,
      salesSummary: {
        grossSales: snapshot.grossSales,
        totalCollected: snapshot.totalCollected,
        outstandingBalance: snapshot.outstandingBalance,
      },
      paymentBreakdown: snapshot.paymentBreakdown,
      invoiceSummary: {
        finalizedCount: snapshot.finalizedInvoiceCount,
        paidCount: snapshot.paidInvoiceCount,
        partiallyPaidCount: snapshot.partiallyPaidInvoiceCount,
        unpaidCount: snapshot.unpaidInvoiceCount,
        totalInvoiced: snapshot.totalInvoices,
        totalPaid: snapshot.totalPaidOnInvoices,
        totalRemaining: snapshot.totalRemainingOnInvoices,
      },
      paymentSummary: {
        paymentCount: snapshot.paymentCount,
        totalCollected: snapshot.totalCollected,
      },
      operationalSummary: {
        bookingCount: snapshot.bookingCount,
        completedBookingCount: snapshot.completedBookingCount,
        inProgressBookingCount: snapshot.inProgressBookingCount,
        cancelledBookingCount: snapshot.cancelledBookingCount,
        queueVisitCount: snapshot.queueVisitCount,
        queueCompletedCount: snapshot.queueCompletedCount,
        queueActiveCount: snapshot.queueActiveCount,
      },
      warnings,
      openItems,
      openItemsPolicy,
      carryOverReason: existing?.carryOverReason ?? null,
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        client: inv.client,
        totalAmount: num(inv.totalAmount),
        paidAmount: num(inv.paidAmount),
        remainingAmount: num(inv.remainingAmount),
        paymentStatus:
          num(inv.remainingAmount) <= 0
            ? ('PAID' as const)
            : num(inv.paidAmount) > 0
              ? ('PARTIALLY_PAID' as const)
              : ('UNPAID' as const),
        createdAt: inv.createdAt.toISOString(),
        bookingId: inv.bookingId,
      })),
      recentPayments: recentPayments.map((p) => {
        const inv = p.booking.invoices[0];
        return {
          id: p.id,
          amount: num(p.amount),
          method: p.method,
          reference: p.reference,
          paidAt: p.paidAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
          client: p.client,
          cashier: p.createdByUser,
          invoice: inv
            ? { id: inv.id, invoiceNumber: inv.invoiceNumber }
            : null,
          bookingId: p.booking.id,
        };
      }),
      snapshot,
      draftNotes: existing?.notes ?? null,
    };
  }

  async saveDraft(
    user: DashboardJwtUser,
    body: { branchId: string; businessDate: string; notes?: string },
  ) {
    this.assertPermission(user, 'dailyClosing.create');
    const bid = this.resolveBranchId(user, body.branchId);
    const businessDate = parseBusinessDateUtc(body.businessDate);
    const dateStr = body.businessDate;

    const existing = await this.prisma.dailyClosing.findUnique({
      where: { branchId_businessDate: { branchId: bid, businessDate } },
    });
    if (existing?.status === DailyClosingStatus.CLOSED) {
      throw new BadRequestException('This business day is already closed');
    }

    const { snapshot } = await this.buildLiveSnapshot(user, bid, dateStr);
    const drawer = await this.prisma.cashDrawerSession.findUnique({
      where: { branchId_businessDate: { branchId: bid, businessDate } },
    });

    const totals = this.computeClosingTotalsFromSnapshot(snapshot);

    const data = {
      ...totals,
      notes:
        body.notes !== undefined
          ? body.notes.trim() || null
          : (existing?.notes ?? null),
      snapshot: snapshot as Prisma.InputJsonValue,
      cashDrawerSessionId:
        drawer?.status === CashDrawerSessionStatus.CLOSED ? drawer.id : null,
    };

    const row = existing
      ? await this.prisma.dailyClosing.update({
          where: { id: existing.id },
          data: {
            ...data,
            status: DailyClosingStatus.DRAFT,
          },
        })
      : await this.prisma.dailyClosing.create({
          data: {
            branchId: bid,
            businessDate,
            status: DailyClosingStatus.DRAFT,
            ...data,
          },
        });

    await this.audit.log({
      userId: user.userId,
      action: 'dailyClosing.draft_saved',
      module: 'dailyClosing',
      entityType: 'DailyClosing',
      entityId: row.id,
      branchId: bid,
      severity: 'INFO',
      newValue: {
        businessDate: body.businessDate,
        status: 'DRAFT',
      },
    });

    return this.getById(user, row.id);
  }

  private computeClosingTotalsFromSnapshot(snapshot: ClosingSnapshot) {
    const bd = snapshot.paymentBreakdown as Record<
      string,
      { amount: number; count: number }
    >;
    const cd = snapshot.cashDrawer as Record<string, unknown>;
    const expectedCash =
      typeof cd.expectedCash === 'number' ? cd.expectedCash : 0;
    const countedCash = typeof cd.countedCash === 'number' ? cd.countedCash : 0;
    const cashDifference =
      typeof cd.cashDifference === 'number' ? cd.cashDifference : 0;
    return {
      totalInvoices: new Prisma.Decimal(snapshot.totalInvoices as number),
      grossSales: new Prisma.Decimal(snapshot.grossSales as number),
      totalCollected: new Prisma.Decimal(snapshot.totalCollected as number),
      cashCollected: new Prisma.Decimal(bd.CASH?.amount ?? 0),
      cardCollected: new Prisma.Decimal(bd.CARD?.amount ?? 0),
      instapayCollected: new Prisma.Decimal(bd.INSTAPAY?.amount ?? 0),
      walletCollected: new Prisma.Decimal(bd.MOBILE_WALLET?.amount ?? 0),
      bankTransferCollected: new Prisma.Decimal(bd.BANK_TRANSFER?.amount ?? 0),
      otherCollected: new Prisma.Decimal(bd.OTHER?.amount ?? 0),
      outstandingBalance: new Prisma.Decimal(
        snapshot.outstandingBalance as number,
      ),
      expectedCash: new Prisma.Decimal(expectedCash),
      countedCash: new Prisma.Decimal(countedCash),
      cashDifference: new Prisma.Decimal(cashDifference),
      invoiceCount: snapshot.invoiceCount as number,
      paymentCount: snapshot.paymentCount as number,
      bookingCount: snapshot.bookingCount as number,
      completedBookingCount: snapshot.completedBookingCount as number,
      inProgressBookingCount: snapshot.inProgressBookingCount as number,
      cancelledBookingCount: snapshot.cancelledBookingCount as number,
      queueVisitCount: snapshot.queueVisitCount as number,
      queueCompletedCount: snapshot.queueCompletedCount as number,
      queueActiveCount: snapshot.queueActiveCount as number,
    };
  }

  async close(
    user: DashboardJwtUser,
    closingId: string,
    body: { notes?: string; carryOverReason?: string },
  ) {
    this.assertPermission(user, 'dailyClosing.close');
    const row = await this.prisma.dailyClosing.findUnique({
      where: { id: closingId },
    });
    if (!row) {
      throw new NotFoundException('Daily closing not found');
    }
    assertDashboardBranchAccess(user, row.branchId);
    if (row.status === DailyClosingStatus.CLOSED) {
      throw new BadRequestException('Business day is already closed');
    }

    const dateStr = row.businessDate.toISOString().slice(0, 10);
    const drawer = await this.prisma.cashDrawerSession.findUnique({
      where: {
        branchId_businessDate: {
          branchId: row.branchId,
          businessDate: row.businessDate,
        },
      },
    });
    if (drawer?.status === CashDrawerSessionStatus.OPEN) {
      throw new BadRequestException(
        'Close the cash drawer before closing the business day.',
      );
    }

    const [openItems, policy] = await Promise.all([
      this.collectOpenItems(row.branchId, dateStr),
      this.openItemsPolicy(),
    ]);
    const openVisitCount = openItems.openVisits.length;
    const unpaidCount = openItems.unpaidInvoices.length;
    const carryOverReason = body.carryOverReason?.trim() || null;
    if (openVisitCount > 0 || unpaidCount > 0) {
      const parts: string[] = [];
      if (openVisitCount > 0) {
        parts.push(
          `${openVisitCount} visit${openVisitCount === 1 ? '' : 's'} still open`,
        );
      }
      if (unpaidCount > 0) {
        parts.push(
          `${unpaidCount} invoice${unpaidCount === 1 ? '' : 's'} with a balance`,
        );
      }
      const what = parts.join(' and ');
      if (policy === DayCloseOpenItemsPolicy.BLOCK) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: `The day cannot be closed: ${what}. Finish or cancel the visits and collect the balances first.`,
            error: 'Bad Request',
            code: 'DAY_CLOSE_OPEN_ITEMS',
            openVisitCount,
            unpaidInvoiceCount: unpaidCount,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!carryOverReason) {
        throw overridableException(
          'DAY_CLOSE_OPEN_ITEMS',
          `${what[0].toUpperCase()}${what.slice(1)} — close the day anyway and carry them over?`,
          { openVisitCount, unpaidInvoiceCount: unpaidCount },
        );
      }
    }

    const { snapshot: liveSnapshot } = await this.buildLiveSnapshot(
      user,
      row.branchId,
      dateStr,
    );
    const snapshot: ClosingSnapshot = {
      ...liveSnapshot,
      carriedOver:
        openVisitCount > 0 || unpaidCount > 0
          ? { reason: carryOverReason, ...openItems }
          : null,
    };
    const totals = this.computeClosingTotalsFromSnapshot(snapshot);

    const updated = await this.prisma.dailyClosing.update({
      where: { id: closingId },
      data: {
        status: DailyClosingStatus.CLOSED,
        closedByUserId: user.userId,
        closedAt: new Date(),
        notes: body.notes?.trim() ?? row.notes,
        carryOverReason:
          openVisitCount > 0 || unpaidCount > 0 ? carryOverReason : null,
        snapshot: snapshot as Prisma.InputJsonValue,
        cashDrawerSessionId:
          drawer?.status === CashDrawerSessionStatus.CLOSED ? drawer.id : null,
        ...totals,
      },
    });

    await this.audit.log({
      userId: user.userId,
      action: 'dailyClosing.closed',
      module: 'dailyClosing',
      entityType: 'DailyClosing',
      entityId: updated.id,
      branchId: row.branchId,
      severity: 'WARNING',
      newValue: {
        businessDate: dateStr,
        grossSales: Number(updated.grossSales.toString()),
        totalCollected: Number(updated.totalCollected.toString()),
        cashDifference: Number(updated.cashDifference.toString()),
        carriedOverVisits: openVisitCount,
        carriedOverUnpaidInvoices: unpaidCount,
        carryOverReason: updated.carryOverReason,
      },
    });

    return this.getById(user, updated.id);
  }

  async getById(user: DashboardJwtUser, closingId: string) {
    this.assertPermission(user, 'dailyClosing.read');
    const row = await this.prisma.dailyClosing.findUnique({
      where: { id: closingId },
      include: {
        branch: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('Daily closing not found');
    }
    assertDashboardBranchAccess(user, row.branchId);

    const dateStr = row.businessDate.toISOString().slice(0, 10);
    const { snapshot, warnings } = await this.buildLiveSnapshot(
      user,
      row.branchId,
      dateStr,
    );

    return {
      id: row.id,
      shortRef: shortClosingRef(row.id),
      branch: row.branch,
      businessDate: dateStr,
      status: row.status,
      notes: row.notes,
      carryOverReason: row.carryOverReason,
      closedBy: row.closedBy,
      closedAt: row.closedAt?.toISOString() ?? null,
      totals: {
        totalInvoices: num(row.totalInvoices),
        grossSales: num(row.grossSales),
        totalCollected: num(row.totalCollected),
        cashCollected: num(row.cashCollected),
        cardCollected: num(row.cardCollected),
        instapayCollected: num(row.instapayCollected),
        walletCollected: num(row.walletCollected),
        bankTransferCollected: num(row.bankTransferCollected),
        otherCollected: num(row.otherCollected),
        outstandingBalance: num(row.outstandingBalance),
        expectedCash: num(row.expectedCash),
        countedCash: num(row.countedCash),
        cashDifference: num(row.cashDifference),
        invoiceCount: row.invoiceCount,
        paymentCount: row.paymentCount,
        bookingCount: row.bookingCount,
        completedBookingCount: row.completedBookingCount,
        inProgressBookingCount: row.inProgressBookingCount,
        cancelledBookingCount: row.cancelledBookingCount,
        queueVisitCount: row.queueVisitCount,
        queueCompletedCount: row.queueCompletedCount,
        queueActiveCount: row.queueActiveCount,
      },
      savedSnapshot: row.snapshot,
      liveSnapshot: snapshot,
      warnings,
      readOnly: row.status === DailyClosingStatus.CLOSED,
    };
  }
}
