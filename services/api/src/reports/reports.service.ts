import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import {
  canAccessAllBranches,
  resolveDashboardBranchFilter,
} from '../billing/dashboard-branch-scope';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ReportRangeQueryDto } from './dto/report-range-query.dto';

type ResolvedRange = { from: Date; to: Date };

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private resolveRange(query: ReportRangeQueryDto): ResolvedRange {
    const now = new Date();
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const endOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );

    const from = query.dateFrom ? new Date(query.dateFrom) : startOfMonth;
    const to = query.dateTo ? new Date(query.dateTo) : endOfMonth;

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
    return { from, to };
  }

  private resolveBranchId(
    user: DashboardJwtUser,
    query: ReportRangeQueryDto,
  ): string | undefined {
    if (
      canAccessAllBranches(user) ||
      user.permissions.includes('vat.settings.manage')
    ) {
      return query.branchId;
    }
    return resolveDashboardBranchFilter(user, query.branchId);
  }

  private bookingWhere(
    range: ResolvedRange,
    branchId?: string,
  ): Prisma.BookingWhereInput {
    return {
      ...(branchId ? { branchId } : {}),
      createdAt: {
        gte: range.from,
        lte: range.to,
      },
    };
  }

  async overview(user: DashboardJwtUser, query: ReportRangeQueryDto) {
    const branchId = this.resolveBranchId(user, query);
    const now = new Date();
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setUTCHours(23, 59, 59, 999);

    const baseWhere: Prisma.BookingWhereInput = branchId ? { branchId } : {};
    const todayWhere: Prisma.BookingWhereInput = {
      ...baseWhere,
      createdAt: { gte: start, lte: end },
    };

    const [
      todayBookings,
      pending,
      confirmed,
      completed,
      cancelled,
      noShow,
      upcomingAppointments,
      recentActivity,
    ] = await Promise.all([
      this.prisma.booking.count({ where: todayWhere }),
      this.prisma.booking.count({
        where: { ...baseWhere, status: BookingStatus.PENDING },
      }),
      this.prisma.booking.count({
        where: { ...baseWhere, status: BookingStatus.CONFIRMED },
      }),
      this.prisma.booking.count({
        where: { ...baseWhere, status: BookingStatus.COMPLETED },
      }),
      this.prisma.booking.count({
        where: { ...baseWhere, status: BookingStatus.CANCELLED },
      }),
      this.prisma.booking.count({
        where: { ...baseWhere, status: BookingStatus.NO_SHOW },
      }),
      this.prisma.booking.findMany({
        where: {
          ...baseWhere,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED] },
        },
        take: 10,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          status: true,
          slot: { select: { date: true, startTime: true, endTime: true } },
          client: { select: { id: true, fullName: true } },
        },
      }),
      this.audit.listRecent(10),
    ]);

    return {
      range: { from: query.dateFrom ?? null, to: query.dateTo ?? null },
      branchId: branchId ?? null,
      todayBookings,
      pendingBookings: pending,
      confirmedBookings: confirmed,
      completedBookings: completed,
      cancelledBookings: cancelled,
      noShowBookings: noShow,
      upcomingAppointments,
      recentActivity,
    };
  }

  async operations(user: DashboardJwtUser, query: ReportRangeQueryDto) {
    const range = this.resolveRange(query);
    const branchId = this.resolveBranchId(user, query);
    const where = this.bookingWhere(range, branchId);

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
          ...(branchId ? { preferredBranchId: branchId } : {}),
        },
      }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint as count
          FROM (
            SELECT b.client_id
            FROM bookings b
            ${branchId ? Prisma.sql`WHERE b.branch_id = ${branchId}` : Prisma.empty}
            GROUP BY b.client_id
            HAVING COUNT(*) > 1
          ) t
        `,
    ]);

    return {
      range: { from: range.from, to: range.to },
      branchId: branchId ?? null,
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
    const branchId = this.resolveBranchId(user, query);
    const bookingWhere = this.bookingWhere(range, branchId);

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
            ...(branchId ? { booking: { branchId } } : {}),
          },
          _sum: { amount: true },
        }),
        this.prisma.payment.aggregate({
          where: {
            paidAt: { gte: range.from, lte: range.to },
            status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_PAID] },
            ...(branchId ? { booking: { branchId } } : {}),
          },
          _sum: { amount: true },
        }),
        this.prisma.invoice.aggregate({
          where: {
            createdAt: { gte: range.from, lte: range.to },
            ...(branchId ? { booking: { branchId } } : {}),
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
      branchId: branchId ?? null,
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
    const branchId = this.resolveBranchId(user, query);
    const where = this.bookingWhere(range, branchId);

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
      branchId: branchId ?? null,
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
    const branchId = this.resolveBranchId(user, query);

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
          ...(branchId ? { branchId } : {}),
        },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 20,
    });

    return {
      range: { from: range.from, to: range.to },
      branchId: branchId ?? null,
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
    const branchId = this.resolveBranchId(user, query);
    const where = this.bookingWhere(range, branchId);

    const [newClients, bookingClients] = await Promise.all([
      this.prisma.client.count({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          ...(branchId ? { preferredBranchId: branchId } : {}),
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
      branchId: branchId ?? null,
      newClients,
      returningClients,
      activeClients: bookingClients.length,
    };
  }

  async payments(user: DashboardJwtUser, query: ReportRangeQueryDto) {
    const range = this.resolveRange(query);
    const branchId = this.resolveBranchId(user, query);

    const [rows, totals] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['method', 'status'],
        where: {
          createdAt: { gte: range.from, lte: range.to },
          ...(branchId ? { booking: { branchId } } : {}),
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          ...(branchId ? { booking: { branchId } } : {}),
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      range: { from: range.from, to: range.to },
      branchId: branchId ?? null,
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
