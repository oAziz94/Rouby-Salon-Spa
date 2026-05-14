import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BookingItemType,
  BookingStatus,
  CashDrawerSessionStatus,
  DailyClosingStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  QueueEntryStatus,
} from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import {
  buildDashboardBookingBranchWhere,
  canAccessAllBranches,
} from '../billing/dashboard-branch-scope';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ReportRangeQueryDto } from './dto/report-range-query.dto';
import { buildDashboardOverview } from './dashboard-overview.handler';
import { StaffAvailabilityService } from '../staff/staff-availability.service';

type ResolvedRange = { from: Date; to: Date; fromDay: string; toDay: string };
type FinancialExportType =
  | 'summary'
  | 'payments'
  | 'outstanding'
  | 'sales-items'
  | 'daily-closing';

type FinancialAlertSeverity = 'critical' | 'warning' | 'info';

function money(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Prisma.Decimal) return Number(value.toString());
  return Number(value);
}

function dayKeyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toDayBounds(value: string, end = false): Date {
  const day = value.trim().slice(0, 10);
  const suffix = end ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
  return new Date(`${day}${suffix}`);
}

function csvEscape(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly staffAvailability: StaffAvailabilityService,
  ) {}

  private resolveRange(query: ReportRangeQueryDto): ResolvedRange {
    const now = new Date();
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const endOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
    const from = query.dateFrom ? toDayBounds(query.dateFrom) : startOfMonth;
    const to = query.dateTo ? toDayBounds(query.dateTo, true) : endOfMonth;

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid dateFrom/dateTo');
    }
    if (from > to) {
      throw new BadRequestException(
        'dateFrom must be before or equal to dateTo',
      );
    }
    const days = Math.ceil(
      (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (days > 365) {
      throw new BadRequestException('Maximum date range is 365 days');
    }
    return { from, to, fromDay: dayKeyUtc(from), toDay: dayKeyUtc(to) };
  }

  private resolveReportBookingBranchWhere(
    user: DashboardJwtUser,
    query: ReportRangeQueryDto,
  ): Prisma.BookingWhereInput {
    const unrestricted =
      canAccessAllBranches(user) ||
      user.permissions.includes('vat.settings.manage');
    if (unrestricted) {
      return query.branchId ? { branchId: query.branchId } : {};
    }
    return buildDashboardBookingBranchWhere(user, query.branchId);
  }

  private reportBranchMeta(
    query: ReportRangeQueryDto,
    bf: Prisma.BookingWhereInput,
  ): string | null {
    return (
      query.branchId ??
      (typeof bf.branchId === 'string' ? bf.branchId : null) ??
      null
    );
  }

  private extractBranchIdsForSql(
    bf: Prisma.BookingWhereInput,
  ): string[] | null {
    if (bf.branchId === undefined || bf.branchId === null) {
      return null;
    }
    if (typeof bf.branchId === 'string') {
      return [bf.branchId];
    }
    const ins = (bf.branchId as { in?: string[] }).in;
    return ins?.length ? ins : null;
  }

  /** Re-use booking branch scope on models keyed by `branchId` (queue, closings, cash drawer). */
  private branchScopeForDirectBranchModels(
    bf: Prisma.BookingWhereInput,
  ):
    | { branchId: string }
    | { branchId: { in: string[] } }
    | Record<string, never> {
    const ids = this.extractBranchIdsForSql(bf);
    if (!ids?.length) return {};
    if (ids.length === 1) return { branchId: ids[0] };
    return { branchId: { in: ids } };
  }

  private bookingWhere(
    range: ResolvedRange,
    branchBookingWhere: Prisma.BookingWhereInput,
  ): Prisma.BookingWhereInput {
    return {
      ...branchBookingWhere,
      createdAt: {
        gte: range.from,
        lte: range.to,
      },
    };
  }

  private paymentRecordedWhere(
    range: ResolvedRange,
    branchBookingWhere: Prisma.BookingWhereInput,
  ): Prisma.PaymentWhereInput {
    return {
      ...(Object.keys(branchBookingWhere).length
        ? { booking: { is: branchBookingWhere } }
        : {}),
      OR: [
        { paidAt: { not: null, gte: range.from, lte: range.to } },
        {
          AND: [
            { paidAt: null },
            { createdAt: { gte: range.from, lte: range.to } },
          ],
        },
      ],
    };
  }

  private paymentStatusFromInvoice(invoice: {
    paidAmount: Prisma.Decimal;
    remainingAmount: Prisma.Decimal;
  }) {
    const paid = money(invoice.paidAmount);
    const remaining = money(invoice.remainingAmount);
    if (remaining <= 0) return 'PAID' as const;
    if (paid > 0) return 'PARTIALLY_PAID' as const;
    return 'UNPAID' as const;
  }

  private previousRange(current: ResolvedRange): ResolvedRange {
    const days = Math.max(
      1,
      Math.floor((current.to.getTime() - current.from.getTime()) / 86400000) +
        1,
    );
    const prevTo = new Date(current.from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000);
    return {
      from: new Date(
        Date.UTC(
          prevFrom.getUTCFullYear(),
          prevFrom.getUTCMonth(),
          prevFrom.getUTCDate(),
        ),
      ),
      to: new Date(
        Date.UTC(
          prevTo.getUTCFullYear(),
          prevTo.getUTCMonth(),
          prevTo.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      ),
      fromDay: dayKeyUtc(prevFrom),
      toDay: dayKeyUtc(prevTo),
    };
  }

  async financialSummary(user: DashboardJwtUser, query: ReportRangeQueryDto) {
    const range = this.resolveRange(query);
    const bf = this.resolveReportBookingBranchWhere(user, query);
    const branchMeta = this.reportBranchMeta(query, bf);
    const directBranchScope = this.branchScopeForDirectBranchModels(bf);
    const previous = this.previousRange(range);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.FINALIZED,
        createdAt: { gte: range.from, lte: range.to },
        ...(Object.keys(bf).length ? { booking: { is: bf } } : {}),
      },
      include: {
        client: {
          select: { id: true, fullName: true, phone: true, createdAt: true },
        },
        booking: {
          select: {
            id: true,
            branchId: true,
            createdAt: true,
            source: true,
            slot: { select: { date: true } },
            branch: { select: { id: true, name: true } },
          },
        },
        lines: true,
      },
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_PAID] },
        ...this.paymentRecordedWhere(range, bf),
      },
      include: {
        booking: {
          select: {
            id: true,
            branchId: true,
            clientId: true,
            branch: { select: { id: true, name: true } },
          },
        },
        client: { select: { id: true, fullName: true, phone: true } },
        createdByUser: { select: { id: true, name: true } },
      },
    });

    const previousTotals = await this.prisma.invoice.aggregate({
      where: {
        status: InvoiceStatus.FINALIZED,
        createdAt: { gte: previous.from, lte: previous.to },
        ...(Object.keys(bf).length ? { booking: { is: bf } } : {}),
      },
      _sum: { totalAmount: true },
      _count: true,
    });

    const dailyClosings = await this.prisma.dailyClosing.findMany({
      where: {
        businessDate: {
          gte: new Date(`${range.fromDay}T00:00:00.000Z`),
          lte: new Date(`${range.toDay}T00:00:00.000Z`),
        },
        ...directBranchScope,
      },
      include: {
        branch: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });

    const cashDrawers = await this.prisma.cashDrawerSession.findMany({
      where: {
        businessDate: {
          gte: new Date(`${range.fromDay}T00:00:00.000Z`),
          lte: new Date(`${range.toDay}T00:00:00.000Z`),
        },
        ...directBranchScope,
      },
      include: {
        branch: { select: { id: true, name: true } },
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });

    const queueEntries = await this.prisma.queueEntry.findMany({
      where: {
        checkedInAt: { gte: range.from, lte: range.to },
        ...directBranchScope,
      },
      select: { checkedInAt: true, status: true, branchId: true },
    });

    const bookings = await this.prisma.booking.findMany({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        ...directBranchScope,
      },
      select: {
        id: true,
        clientId: true,
        branchId: true,
        status: true,
        createdAt: true,
      },
    });

    const grossInvoiced = invoices.reduce(
      (sum, invoice) => sum + money(invoice.totalAmount),
      0,
    );
    const totalCollected = payments.reduce(
      (sum, payment) => sum + money(payment.amount),
      0,
    );
    const outstandingBalance = invoices.reduce(
      (sum, invoice) => sum + money(invoice.remainingAmount),
      0,
    );
    const invoiceCount = invoices.length;
    const paidInvoices = invoices.filter(
      (i) => this.paymentStatusFromInvoice(i) === 'PAID',
    ).length;
    const unpaidInvoices = invoices.filter(
      (i) => this.paymentStatusFromInvoice(i) === 'UNPAID',
    );
    const partiallyPaidInvoices = invoices.filter(
      (i) => this.paymentStatusFromInvoice(i) === 'PARTIALLY_PAID',
    );
    const averageInvoiceValue = invoiceCount ? grossInvoiced / invoiceCount : 0;
    const cashDifference = dailyClosings.reduce(
      (sum, row) => sum + money(row.cashDifference),
      0,
    );
    const prevGross = money(previousTotals._sum.totalAmount);

    const trendMap = new Map<
      string,
      { invoiced: number; collected: number; outstanding: number }
    >();
    for (
      let cursor = new Date(`${range.fromDay}T00:00:00.000Z`);
      cursor <= new Date(`${range.toDay}T00:00:00.000Z`);
      cursor = new Date(cursor.getTime() + 86400000)
    ) {
      trendMap.set(dayKeyUtc(cursor), {
        invoiced: 0,
        collected: 0,
        outstanding: 0,
      });
    }
    for (const invoice of invoices) {
      const key = dayKeyUtc(invoice.createdAt);
      const day = trendMap.get(key);
      if (!day) continue;
      day.invoiced += money(invoice.totalAmount);
      day.outstanding += money(invoice.remainingAmount);
    }
    for (const payment of payments) {
      const key = dayKeyUtc(payment.paidAt ?? payment.createdAt);
      const day = trendMap.get(key);
      if (!day) continue;
      day.collected += money(payment.amount);
    }

    const paymentMethodMap = new Map<
      string,
      { method: string; amount: number; count: number }
    >();
    for (const payment of payments) {
      const method =
        payment.method === PaymentMethod.MOBILE_WALLET
          ? 'WALLET'
          : payment.method;
      const row = paymentMethodMap.get(method) ?? {
        method,
        amount: 0,
        count: 0,
      };
      row.amount += money(payment.amount);
      row.count += 1;
      paymentMethodMap.set(method, row);
    }
    const paymentBreakdown = Array.from(paymentMethodMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map((row) => ({
        ...row,
        percentage:
          totalCollected > 0 ? (row.amount / totalCollected) * 100 : 0,
      }));
    const topPaymentMethod = paymentBreakdown[0]?.method ?? null;
    const cashAmount = paymentMethodMap.get('CASH')?.amount ?? 0;

    const salesItemMap = new Map<
      string,
      {
        itemName: string;
        itemType: string;
        quantity: number;
        grossRevenue: number;
        discountAmount: number;
      }
    >();
    for (const invoice of invoices) {
      const invoiceDiscount = money(invoice.discountAmount);
      const invoiceSubtotal = Math.max(0.0001, money(invoice.subtotal));
      for (const line of invoice.lines) {
        const key = `${line.itemType}:${line.nameSnapshot}`;
        const gross = money(line.priceSnapshot) * line.quantity;
        const proratedDiscount = (gross / invoiceSubtotal) * invoiceDiscount;
        const row = salesItemMap.get(key) ?? {
          itemName: line.nameSnapshot,
          itemType:
            line.itemType === BookingItemType.SERVICE_ENHANCEMENT
              ? 'ADD_ON'
              : line.itemType,
          quantity: 0,
          grossRevenue: 0,
          discountAmount: 0,
        };
        row.quantity += line.quantity;
        row.grossRevenue += gross;
        row.discountAmount += proratedDiscount;
        salesItemMap.set(key, row);
      }
    }
    const salesByItem = Array.from(salesItemMap.values())
      .map((row) => {
        const netRevenue = Math.max(0, row.grossRevenue - row.discountAmount);
        return {
          ...row,
          netRevenue,
          averagePrice: row.quantity ? row.grossRevenue / row.quantity : 0,
          revenueShare:
            grossInvoiced > 0 ? (row.grossRevenue / grossInvoiced) * 100 : 0,
        };
      })
      .sort((a, b) => b.grossRevenue - a.grossRevenue);

    const branchMap = new Map<
      string,
      {
        branchId: string;
        branchName: string;
        grossInvoiced: number;
        collected: number;
        outstanding: number;
        invoiceCount: number;
        cashDifference: number;
        completedBookings: number;
        queueVisits: number;
      }
    >();
    for (const invoice of invoices) {
      const bid = invoice.booking.branchId;
      const row = branchMap.get(bid) ?? {
        branchId: bid,
        branchName: invoice.booking.branch?.name ?? 'Unknown branch',
        grossInvoiced: 0,
        collected: 0,
        outstanding: 0,
        invoiceCount: 0,
        cashDifference: 0,
        completedBookings: 0,
        queueVisits: 0,
      };
      row.grossInvoiced += money(invoice.totalAmount);
      row.outstanding += money(invoice.remainingAmount);
      row.invoiceCount += 1;
      branchMap.set(bid, row);
    }
    for (const payment of payments) {
      const bid = payment.booking.branchId;
      const row = branchMap.get(bid);
      if (!row) continue;
      row.collected += money(payment.amount);
    }
    for (const row of dailyClosings) {
      const target = branchMap.get(row.branchId);
      if (!target) continue;
      target.cashDifference += money(row.cashDifference);
    }
    for (const booking of bookings) {
      const target = branchMap.get(booking.branchId);
      if (!target) continue;
      if (booking.status === BookingStatus.COMPLETED)
        target.completedBookings += 1;
    }
    for (const queue of queueEntries) {
      const target = branchMap.get(queue.branchId);
      if (!target) continue;
      target.queueVisits += 1;
    }
    const branchPerformance = Array.from(branchMap.values())
      .map((row) => ({
        ...row,
        averageInvoiceValue: row.invoiceCount
          ? row.grossInvoiced / row.invoiceCount
          : 0,
      }))
      .sort((a, b) => b.grossInvoiced - a.grossInvoiced);

    const closingByKey = new Map(
      dailyClosings.map((c) => [
        `${c.branchId}:${dayKeyUtc(c.businessDate)}`,
        c,
      ]),
    );
    const drawerByKey = new Map(
      cashDrawers.map((d) => [`${d.branchId}:${dayKeyUtc(d.businessDate)}`, d]),
    );
    const dailyClosingStatus = [];
    for (const branch of branchPerformance) {
      for (
        let cursor = new Date(`${range.fromDay}T00:00:00.000Z`);
        cursor <= new Date(`${range.toDay}T00:00:00.000Z`);
        cursor = new Date(cursor.getTime() + 86400000)
      ) {
        const date = dayKeyUtc(cursor);
        const key = `${branch.branchId}:${date}`;
        const closing = closingByKey.get(key);
        const drawer = drawerByKey.get(key);
        const dayMetrics = trendMap.get(date);
        if (!closing && !drawer && !dayMetrics) continue;
        dailyClosingStatus.push({
          date,
          branchId: branch.branchId,
          branchName: branch.branchName,
          status: !closing
            ? 'NOT_STARTED'
            : closing.status === DailyClosingStatus.CLOSED
              ? 'CLOSED'
              : 'DRAFT',
          grossSales: dayMetrics?.invoiced ?? 0,
          totalCollected: dayMetrics?.collected ?? 0,
          expectedCash: closing
            ? money(closing.expectedCash)
            : drawer
              ? money(drawer.expectedCash)
              : 0,
          countedCash: closing
            ? money(closing.countedCash)
            : drawer?.countedCash
              ? money(drawer.countedCash)
              : null,
          cashDifference: closing
            ? money(closing.cashDifference)
            : drawer?.cashDifference
              ? money(drawer.cashDifference)
              : 0,
          closedBy: closing?.closedBy?.name ?? drawer?.closedBy?.name ?? null,
          closedAt:
            closing?.closedAt?.toISOString() ??
            drawer?.closedAt?.toISOString() ??
            null,
          dailyClosingId: closing?.id ?? null,
          cashDrawerId: drawer?.id ?? null,
          drawerOpen: drawer?.status === CashDrawerSessionStatus.OPEN,
        });
      }
    }
    dailyClosingStatus.sort((a, b) =>
      a.date === b.date
        ? a.branchName.localeCompare(b.branchName)
        : b.date.localeCompare(a.date),
    );

    const cashDrawerSummary = {
      openingCashTotal: cashDrawers.reduce(
        (sum, row) => sum + money(row.openingBalance),
        0,
      ),
      cashPayments: paymentMethodMap.get('CASH')?.amount ?? 0,
      cashIn: 0,
      cashOut: 0,
      expectedCash: cashDrawers.reduce(
        (sum, row) => sum + money(row.expectedCash),
        0,
      ),
      countedCash: cashDrawers.reduce(
        (sum, row) => sum + money(row.countedCash),
        0,
      ),
      cashDifference: cashDrawers.reduce(
        (sum, row) => sum + money(row.cashDifference),
        0,
      ),
      openDrawersCount: cashDrawers.filter(
        (row) => row.status === CashDrawerSessionStatus.OPEN,
      ).length,
      closedDrawersCount: cashDrawers.filter(
        (row) => row.status === CashDrawerSessionStatus.CLOSED,
      ).length,
      rows: cashDrawers
        .map((row) => ({
          date: dayKeyUtc(row.businessDate),
          branchName: row.branch.name,
          status: row.status,
          openedBy: row.openedBy.name,
          closedBy: row.closedBy?.name ?? null,
          expectedCash: money(row.expectedCash),
          countedCash: money(row.countedCash),
          difference: money(row.cashDifference),
          cashDrawerId: row.id,
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    };

    const clientRows = new Map<
      string,
      {
        clientId: string;
        clientName: string;
        phone: string | null;
        invoiceCount: number;
        totalSpent: number;
        outstanding: number;
        lastVisit: string | null;
        isNewClient: boolean;
      }
    >();
    for (const invoice of invoices) {
      const existing = clientRows.get(invoice.clientId) ?? {
        clientId: invoice.clientId,
        clientName: invoice.client.fullName,
        phone: invoice.client.phone,
        invoiceCount: 0,
        totalSpent: 0,
        outstanding: 0,
        lastVisit: null,
        isNewClient:
          invoice.client.createdAt >= range.from &&
          invoice.client.createdAt <= range.to,
      };
      existing.invoiceCount += 1;
      existing.totalSpent += money(invoice.totalAmount);
      existing.outstanding += money(invoice.remainingAmount);
      const slotDate = invoice.booking.slot?.date
        ? dayKeyUtc(invoice.booking.slot.date)
        : dayKeyUtc(invoice.createdAt);
      if (!existing.lastVisit || slotDate > existing.lastVisit)
        existing.lastVisit = slotDate;
      clientRows.set(invoice.clientId, existing);
    }
    const clientValues = Array.from(clientRows.values());
    const newClientsRevenue = clientValues
      .filter((row) => row.isNewClient)
      .reduce((sum, row) => sum + row.totalSpent, 0);
    const repeatClientsRevenue = clientValues
      .filter((row) => row.invoiceCount > 1)
      .reduce((sum, row) => sum + row.totalSpent, 0);
    const clientInsights = {
      topClientsByRevenue: [...clientValues]
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10),
      clientsWithOutstanding: clientValues
        .filter((row) => row.outstanding > 0)
        .sort((a, b) => b.outstanding - a.outstanding)
        .slice(0, 10),
      newClientsRevenue,
      repeatClientsRevenue,
    };

    const cashierMap = new Map<
      string,
      {
        userId: string;
        name: string;
        totalCollected: number;
        cashCollected: number;
        digitalCollected: number;
        paymentCount: number;
      }
    >();
    for (const payment of payments) {
      if (!payment.createdByUserId || !payment.createdByUser) continue;
      const row = cashierMap.get(payment.createdByUserId) ?? {
        userId: payment.createdByUserId,
        name: payment.createdByUser.name,
        totalCollected: 0,
        cashCollected: 0,
        digitalCollected: 0,
        paymentCount: 0,
      };
      const amount = money(payment.amount);
      row.totalCollected += amount;
      row.paymentCount += 1;
      if (payment.method === PaymentMethod.CASH) row.cashCollected += amount;
      else row.digitalCollected += amount;
      cashierMap.set(payment.createdByUserId, row);
    }
    const cashierCollections = Array.from(cashierMap.values())
      .map((row) => ({
        ...row,
        averagePayment: row.paymentCount
          ? row.totalCollected / row.paymentCount
          : 0,
      }))
      .sort((a, b) => b.totalCollected - a.totalCollected);

    const overdue = unpaidInvoices.map((invoice) => {
      const ageDays = Math.floor(
        (Date.now() - invoice.createdAt.getTime()) / 86400000,
      );
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.client.fullName,
        phone: invoice.client.phone,
        total: money(invoice.totalAmount),
        paid: money(invoice.paidAmount),
        remaining: money(invoice.remainingAmount),
        ageDays,
        status: this.paymentStatusFromInvoice(invoice),
      };
    });
    const outstandingRows = [
      ...overdue,
      ...partiallyPaidInvoices.map((invoice) => ({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.client.fullName,
        phone: invoice.client.phone,
        total: money(invoice.totalAmount),
        paid: money(invoice.paidAmount),
        remaining: money(invoice.remainingAmount),
        ageDays: Math.floor(
          (Date.now() - invoice.createdAt.getTime()) / 86400000,
        ),
        status: this.paymentStatusFromInvoice(invoice),
      })),
    ].sort((a, b) => b.remaining - a.remaining);

    const alerts: Array<{
      severity: FinancialAlertSeverity;
      code: string;
      message: string;
      count?: number;
      amount?: number;
      actionHref?: string;
      actionLabel?: string;
    }> = [];
    if (unpaidInvoices.length > 0) {
      alerts.push({
        severity: 'critical',
        code: 'UNPAID_INVOICES',
        message: 'Unpaid invoices need follow-up.',
        count: unpaidInvoices.length,
        amount: unpaidInvoices.reduce(
          (sum, i) => sum + money(i.remainingAmount),
          0,
        ),
        actionHref: '/dashboard/invoices?paymentStatus=UNPAID',
        actionLabel: 'View invoices',
      });
    }
    if (partiallyPaidInvoices.length > 0) {
      alerts.push({
        severity: 'warning',
        code: 'PARTIAL_INVOICES',
        message: 'Partially paid invoices are pending completion.',
        count: partiallyPaidInvoices.length,
        actionHref: '/dashboard/invoices?paymentStatus=PARTIALLY_PAID',
        actionLabel: 'View invoices',
      });
    }
    const missingClosings = dailyClosingStatus.filter(
      (row) => row.status === 'NOT_STARTED' && row.grossSales > 0,
    );
    if (missingClosings.length > 0) {
      alerts.push({
        severity: 'warning',
        code: 'MISSING_CLOSINGS',
        message: 'Daily closings are missing on active financial days.',
        count: missingClosings.length,
        actionHref: '/dashboard/daily-closing',
        actionLabel: 'Open daily closing',
      });
    }
    const nonZeroDiffRows = dailyClosingStatus.filter(
      (row) => Math.abs(row.cashDifference) > 0.009,
    );
    if (nonZeroDiffRows.length > 0) {
      alerts.push({
        severity: 'critical',
        code: 'CASH_DIFFERENCE',
        message: 'Cash differences were detected and require reconciliation.',
        count: nonZeroDiffRows.length,
        amount: nonZeroDiffRows.reduce(
          (sum, row) => sum + row.cashDifference,
          0,
        ),
        actionHref: '/dashboard/cash-drawer',
        actionLabel: 'Open cash drawer',
      });
    }
    const staleQueue = queueEntries.filter((row) => {
      const ageDays = Math.floor(
        (Date.now() - row.checkedInAt.getTime()) / 86400000,
      );
      return (
        ageDays >= 1 &&
        (row.status === QueueEntryStatus.WAITING ||
          row.status === QueueEntryStatus.IN_SERVICE)
      );
    }).length;
    if (staleQueue > 0) {
      alerts.push({
        severity: 'info',
        code: 'STALE_QUEUE',
        message: 'Past-day queue visits are still in progress.',
        count: staleQueue,
        actionHref: '/dashboard/queue',
        actionLabel: 'Open queue',
      });
    }

    return {
      range: { from: range.fromDay, to: range.toDay },
      branchId: branchMeta,
      currency: 'EGP',
      kpis: {
        grossInvoiced,
        totalCollected,
        outstandingBalance,
        paidInvoices,
        paidInvoicesRate: invoiceCount
          ? (paidInvoices / invoiceCount) * 100
          : 0,
        invoiceCount,
        averageInvoiceValue,
        cashDifference,
        previousPeriodGrossInvoiced: prevGross,
      },
      alerts,
      revenueTrend: Array.from(trendMap.entries())
        .map(([date, value]) => ({ date, ...value }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      paymentBreakdown: {
        methods: paymentBreakdown,
        topPaymentMethod,
        cashTotal: cashAmount,
        nonCashTotal: totalCollected - cashAmount,
      },
      outstanding: {
        totalUnpaidAmount: unpaidInvoices.reduce(
          (sum, i) => sum + money(i.remainingAmount),
          0,
        ),
        unpaidInvoicesCount: unpaidInvoices.length,
        partiallyPaidInvoicesCount: partiallyPaidInvoices.length,
        oldestUnpaidInvoice:
          overdue.sort((a, b) => b.ageDays - a.ageDays)[0] ?? null,
        largestUnpaidInvoice:
          [...outstandingRows].sort((a, b) => b.remaining - a.remaining)[0] ??
          null,
        invoices: outstandingRows.slice(0, 50),
      },
      salesByItem,
      branchPerformance,
      dailyClosingStatus,
      cashDrawerSummary,
      clientInsights,
      cashierCollections,
      hasData: invoices.length > 0 || payments.length > 0,
    };
  }

  async exportFinancialSummary(
    user: DashboardJwtUser,
    query: ReportRangeQueryDto & { type?: FinancialExportType },
  ): Promise<{ csv: string; filename: string }> {
    const report = await this.financialSummary(user, query);
    const type: FinancialExportType = query.type ?? 'summary';
    const filename = `financial-report-${type}-${report.range.from}-${report.range.to}.csv`;
    if (type === 'payments') {
      const header = ['Method', 'Amount', 'Count', 'Percentage'];
      const rows = report.paymentBreakdown.methods.map((row) => [
        row.method,
        row.amount.toFixed(2),
        String(row.count),
        row.percentage.toFixed(2),
      ]);
      return {
        filename,
        csv: [header, ...rows]
          .map((row) => row.map(csvEscape).join(','))
          .join('\n'),
      };
    }
    if (type === 'outstanding') {
      const header = [
        'Invoice Number',
        'Client',
        'Phone',
        'Total',
        'Paid',
        'Remaining',
        'Age Days',
        'Status',
      ];
      const rows = report.outstanding.invoices.map((row) => [
        row.invoiceNumber,
        row.clientName,
        row.phone ?? '',
        row.total.toFixed(2),
        row.paid.toFixed(2),
        row.remaining.toFixed(2),
        String(row.ageDays),
        row.status,
      ]);
      return {
        filename,
        csv: [header, ...rows]
          .map((row) => row.map(csvEscape).join(','))
          .join('\n'),
      };
    }
    if (type === 'sales-items') {
      const header = [
        'Item',
        'Type',
        'Quantity',
        'Gross Revenue',
        'Discount',
        'Net Revenue',
        'Average Price',
        'Revenue Share',
      ];
      const rows = report.salesByItem.map((row) => [
        row.itemName,
        row.itemType,
        String(row.quantity),
        row.grossRevenue.toFixed(2),
        row.discountAmount.toFixed(2),
        row.netRevenue.toFixed(2),
        row.averagePrice.toFixed(2),
        row.revenueShare.toFixed(2),
      ]);
      return {
        filename,
        csv: [header, ...rows]
          .map((row) => row.map(csvEscape).join(','))
          .join('\n'),
      };
    }
    if (type === 'daily-closing') {
      const header = [
        'Date',
        'Branch',
        'Status',
        'Gross Sales',
        'Collected',
        'Expected Cash',
        'Counted Cash',
        'Difference',
        'Closed By',
        'Closed At',
      ];
      const rows = report.dailyClosingStatus.map((row) => [
        row.date,
        row.branchName,
        row.status,
        row.grossSales.toFixed(2),
        row.totalCollected.toFixed(2),
        row.expectedCash.toFixed(2),
        row.countedCash === null ? '' : row.countedCash.toFixed(2),
        row.cashDifference.toFixed(2),
        row.closedBy ?? '',
        row.closedAt ?? '',
      ]);
      return {
        filename,
        csv: [header, ...rows]
          .map((row) => row.map(csvEscape).join(','))
          .join('\n'),
      };
    }

    const summaryRows = [
      ['Gross Invoiced', report.kpis.grossInvoiced.toFixed(2)],
      ['Total Collected', report.kpis.totalCollected.toFixed(2)],
      ['Outstanding Balance', report.kpis.outstandingBalance.toFixed(2)],
      ['Paid Invoices', String(report.kpis.paidInvoices)],
      ['Invoice Count', String(report.kpis.invoiceCount)],
      ['Average Invoice Value', report.kpis.averageInvoiceValue.toFixed(2)],
      ['Cash Difference', report.kpis.cashDifference.toFixed(2)],
      ['Top Payment Method', report.paymentBreakdown.topPaymentMethod ?? ''],
    ];
    return {
      filename,
      csv: [['Metric', 'Value'], ...summaryRows]
        .map((row) => row.map(csvEscape).join(','))
        .join('\n'),
    };
  }

  async overview(user: DashboardJwtUser, query: ReportRangeQueryDto) {
    const bf = this.resolveReportBookingBranchWhere(user, query);
    return buildDashboardOverview(
      this.prisma,
      this.audit,
      user,
      query,
      bf,
      this.staffAvailability,
    );
  }

  async operations(user: DashboardJwtUser, query: ReportRangeQueryDto) {
    const range = this.resolveRange(query);
    const bf = this.resolveReportBookingBranchWhere(user, query);
    const branchIdForMeta = this.reportBranchMeta(query, bf);
    const branchIds = this.extractBranchIdsForSql(bf);
    const where = this.bookingWhere(range, bf);

    const [
      statusRows,
      sourceRows,
      cancellationCount,
      noShowCount,
      rescheduleCount,
      newClients,
      returningClients,
    ] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.booking.groupBy({
        by: ['source'],
        where,
        _count: { _all: true },
      }),
      this.prisma.booking.count({
        where: { ...where, status: BookingStatus.CANCELLED },
      }),
      this.prisma.booking.count({
        where: { ...where, status: BookingStatus.NO_SHOW },
      }),
      this.prisma.booking.count({
        where: { ...where, status: BookingStatus.RESCHEDULED },
      }),
      this.prisma.client.count({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          ...(branchIds?.length === 1
            ? { preferredBranchId: branchIds[0] }
            : branchIds && branchIds.length > 1
              ? { preferredBranchId: { in: branchIds } }
              : {}),
        },
      }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint as count
          FROM (
            SELECT b.client_id
            FROM bookings b
            ${
              branchIds === null
                ? Prisma.empty
                : branchIds.length === 1
                  ? Prisma.sql`WHERE b.branch_id = ${branchIds[0]}::uuid`
                  : Prisma.sql`WHERE b.branch_id IN (${Prisma.join(
                      branchIds.map((id) => Prisma.sql`${id}::uuid`),
                    )})`
            }
            GROUP BY b.client_id
            HAVING COUNT(*) > 1
          ) t
        `,
    ]);

    return {
      range: { from: range.from, to: range.to },
      branchId: branchIdForMeta,
      bookingCountsByStatus: statusRows.map((r) => ({
        status: r.status,
        count: r._count._all,
      })),
      bookingSourceBreakdown: sourceRows.map((r) => ({
        source: r.source,
        count: r._count._all,
      })),
      cancellationCount,
      noShowCount,
      rescheduleCount,
      newClients,
      returningClients: Number(returningClients[0]?.count ?? 0),
    };
  }

  async financial(user: DashboardJwtUser, query: ReportRangeQueryDto) {
    const range = this.resolveRange(query);
    const bf = this.resolveReportBookingBranchWhere(user, query);
    const branchIdForMeta = this.reportBranchMeta(query, bf);
    const bookingWhere = this.bookingWhere(range, bf);

    const [bookings, paymentMethodRows, paymentsAgg, invoiceAgg] =
      await Promise.all([
        this.prisma.booking.findMany({
          where: bookingWhere,
          select: {
            createdAt: true,
            totalAmount: true,
            discountAmount: true,
            vatAmount: true,
          },
        }),
        this.prisma.payment.groupBy({
          by: ['method'],
          where: {
            paidAt: { gte: range.from, lte: range.to },
            ...(Object.keys(bf).length ? { booking: { is: bf } } : {}),
          },
          _sum: { amount: true },
        }),
        this.prisma.payment.aggregate({
          where: {
            paidAt: { gte: range.from, lte: range.to },
            status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_PAID] },
            ...(Object.keys(bf).length ? { booking: { is: bf } } : {}),
          },
          _sum: { amount: true },
        }),
        this.prisma.invoice.aggregate({
          where: {
            createdAt: { gte: range.from, lte: range.to },
            ...(Object.keys(bf).length ? { booking: { is: bf } } : {}),
          },
          _sum: {
            totalAmount: true,
            paidAmount: true,
            remainingAmount: true,
            vatAmount: true,
            discountAmount: true,
          },
        }),
      ]);

    const revenueByDay = new Map<string, number>();
    for (const booking of bookings) {
      const day = booking.createdAt.toISOString().slice(0, 10);
      const amount = Number(booking.totalAmount.toString());
      revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + amount);
    }

    return {
      range: { from: range.from, to: range.to },
      branchId: branchIdForMeta,
      revenueByDateRange: Array.from(revenueByDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => ({ date, amount })),
      revenueByPaymentMethod: paymentMethodRows.map((row) => ({
        method: row.method,
        amount: Number(row._sum.amount?.toString() ?? '0'),
      })),
      paidAmount: Number(paymentsAgg._sum.amount?.toString() ?? '0'),
      remainingAmount: Number(
        invoiceAgg._sum.remainingAmount?.toString() ?? '0',
      ),
      invoiceTotals: Number(invoiceAgg._sum.totalAmount?.toString() ?? '0'),
      vatAmount: Number(invoiceAgg._sum.vatAmount?.toString() ?? '0'),
      discounts: Number(invoiceAgg._sum.discountAmount?.toString() ?? '0'),
    };
  }

  async bookings(user: DashboardJwtUser, query: ReportRangeQueryDto) {
    const range = this.resolveRange(query);
    const bf = this.resolveReportBookingBranchWhere(user, query);
    const branchIdForMeta = this.reportBranchMeta(query, bf);
    const where = this.bookingWhere(range, bf);

    const [statusRows, sourceRows] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.booking.groupBy({
        by: ['source'],
        where,
        _count: { _all: true },
      }),
    ]);

    return {
      range: { from: range.from, to: range.to },
      branchId: branchIdForMeta,
      byStatus: statusRows.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      bySource: sourceRows.map((row) => ({
        source: row.source,
        count: row._count._all,
      })),
    };
  }

  async services(user: DashboardJwtUser, query: ReportRangeQueryDto) {
    const range = this.resolveRange(query);
    const bf = this.resolveReportBookingBranchWhere(user, query);
    const branchIdForMeta = this.reportBranchMeta(query, bf);

    const rows = await this.prisma.bookingItem.groupBy({
      by: [
        'serviceId',
        'serviceVariantId',
        'packageId',
        'bundleId',
        'nameSnapshot',
      ],
      where: {
        booking: {
          createdAt: { gte: range.from, lte: range.to },
          ...bf,
        },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 20,
    });

    return {
      range: { from: range.from, to: range.to },
      branchId: branchIdForMeta,
      mostBookedItems: rows.map((row) => ({
        serviceId: row.serviceId,
        serviceVariantId: row.serviceVariantId,
        packageId: row.packageId,
        bundleId: row.bundleId,
        name: row.nameSnapshot,
        quantity: row._sum.quantity ?? 0,
      })),
    };
  }

  async clients(user: DashboardJwtUser, query: ReportRangeQueryDto) {
    const range = this.resolveRange(query);
    const bf = this.resolveReportBookingBranchWhere(user, query);
    const branchIdForMeta = this.reportBranchMeta(query, bf);
    const branchIds = this.extractBranchIdsForSql(bf);
    const where = this.bookingWhere(range, bf);

    const [newClients, bookingClients] = await Promise.all([
      this.prisma.client.count({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          ...(branchIds?.length === 1
            ? { preferredBranchId: branchIds[0] }
            : branchIds && branchIds.length > 1
              ? { preferredBranchId: { in: branchIds } }
              : {}),
        },
      }),
      this.prisma.booking.groupBy({
        by: ['clientId'],
        where,
        _count: { _all: true },
      }),
    ]);

    const returningClients = bookingClients.filter(
      (row) => row._count._all > 1,
    ).length;
    return {
      range: { from: range.from, to: range.to },
      branchId: branchIdForMeta,
      newClients,
      returningClients,
      activeClients: bookingClients.length,
    };
  }

  async payments(user: DashboardJwtUser, query: ReportRangeQueryDto) {
    const range = this.resolveRange(query);
    const bf = this.resolveReportBookingBranchWhere(user, query);
    const branchIdForMeta = this.reportBranchMeta(query, bf);

    const [rows, totals] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['method', 'status'],
        where: {
          createdAt: { gte: range.from, lte: range.to },
          ...(Object.keys(bf).length ? { booking: { is: bf } } : {}),
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          ...(Object.keys(bf).length ? { booking: { is: bf } } : {}),
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      range: { from: range.from, to: range.to },
      branchId: branchIdForMeta,
      totalAmount: Number(totals._sum.amount?.toString() ?? '0'),
      byMethodAndStatus: rows.map((row) => ({
        method: row.method,
        status: row.status,
        count: row._count._all,
        amount: Number(row._sum.amount?.toString() ?? '0'),
      })),
    };
  }
}
