import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BookingItemLineStatus,
  BookingSource,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import {
  buildDashboardBookingBranchWhere,
  canAccessAllBranches,
} from '../billing/dashboard-branch-scope';
import {
  CAIRO_TIME_ZONE,
  cairoZonedDayUtcRange,
  ymdInCairo,
} from '../common/cairo-slot-time';
import { PrismaService } from '../prisma/prisma.service';
import type { StaffServicesRevenueQueryDto } from './dto/staff-services-revenue-query.dto';

type CairoResolvedRange = {
  fromYmd: string;
  toYmd: string;
  start: Date;
  endExclusive: Date;
};

type PaymentBucket = 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';

export type StaffServiceLineMetric = {
  bookingItemId: string;
  staffProfileId: string;
  staffName: string;
  serviceId: string | null;
  serviceName: string;
  categoryId: string | null;
  bookingId: string;
  clientId: string;
  branchId: string;
  isWalkIn: boolean;
  completedAt: Date;
  completedDayCairo: string;
  quantity: number;
  lineRevenue: number;
  paidRevenue: number;
  pendingRevenue: number;
  invoiceStatus: InvoiceStatus | null;
  paymentStatus: PaymentBucket | null;
  excludedReason: 'CANCELLED_INVOICE' | null;
};

function money(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Prisma.Decimal) return Number(value.toString());
  return Number(value);
}

function paymentBucketFromInvoice(invoice: {
  paidAmount: Prisma.Decimal;
  remainingAmount: Prisma.Decimal;
}): PaymentBucket {
  const paid = money(invoice.paidAmount);
  const remaining = money(invoice.remainingAmount);
  if (remaining <= 0.0001) return 'PAID';
  if (paid > 0) return 'PARTIALLY_PAID';
  return 'UNPAID';
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class StaffServicesRevenueReportService {
  constructor(private readonly prisma: PrismaService) {}

  resolveCairoRange(query: StaffServicesRevenueQueryDto): CairoResolvedRange {
    const today = ymdInCairo();
    const fromYmd = (query.dateFrom ?? today).trim().slice(0, 10);
    const toYmd = (query.dateTo ?? today).trim().slice(0, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(toYmd)
    ) {
      throw new BadRequestException('Invalid dateFrom/dateTo');
    }
    if (fromYmd > toYmd) {
      throw new BadRequestException(
        'dateFrom must be before or equal to dateTo',
      );
    }
    const { start } = cairoZonedDayUtcRange(fromYmd);
    const { endExclusive } = cairoZonedDayUtcRange(toYmd);
    const days =
      Math.ceil((endExclusive.getTime() - start.getTime()) / 86400000) + 0;
    if (days > 366) {
      throw new BadRequestException('Maximum date range is 365 days');
    }
    return { fromYmd, toYmd, start, endExclusive };
  }

  private resolveBookingBranchWhere(
    user: DashboardJwtUser,
    query: StaffServicesRevenueQueryDto,
  ): Prisma.BookingWhereInput {
    const unrestricted =
      canAccessAllBranches(user) ||
      user.permissions.includes('vat.settings.manage');
    if (unrestricted) {
      return query.branchId ? { branchId: query.branchId } : {};
    }
    return buildDashboardBookingBranchWhere(user, query.branchId);
  }

  private bookingSourceFilter(
    source: StaffServicesRevenueQueryDto['source'],
  ): Prisma.BookingWhereInput {
    if (source === 'walkin') {
      return { source: BookingSource.WALK_IN };
    }
    if (source === 'booking') {
      return { source: { not: BookingSource.WALK_IN } };
    }
    return {};
  }

  private computeLineRevenue(
    item: {
      id: string;
      priceSnapshot: Prisma.Decimal;
      quantity: number;
      discountAmount?: Prisma.Decimal;
    },
    invoice: {
      status: InvoiceStatus;
      subtotal: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
      paidAmount: Prisma.Decimal;
      remainingAmount: Prisma.Decimal;
      lines: Array<{
        bookingItemId: string | null;
        priceSnapshot: Prisma.Decimal;
        quantity: number;
      }>;
    } | null,
  ): {
    lineRevenue: number;
    paidRevenue: number;
    pendingRevenue: number;
    invoiceStatus: InvoiceStatus | null;
    paymentStatus: PaymentBucket | null;
    excludedReason: 'CANCELLED_INVOICE' | null;
  } {
    const grossBeforeLineDiscount = money(item.priceSnapshot) * item.quantity;
    const gross = Math.max(
      0,
      grossBeforeLineDiscount -
        (item.discountAmount ? money(item.discountAmount) : 0),
    );

    if (!invoice) {
      return {
        lineRevenue: roundMoney(gross),
        paidRevenue: 0,
        pendingRevenue: roundMoney(gross),
        invoiceStatus: null,
        paymentStatus: null,
        excludedReason: null,
      };
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      return {
        lineRevenue: 0,
        paidRevenue: 0,
        pendingRevenue: 0,
        invoiceStatus: invoice.status,
        paymentStatus: paymentBucketFromInvoice(invoice),
        excludedReason: 'CANCELLED_INVOICE',
      };
    }

    const invoiceSubtotal = Math.max(
      0.0001,
      money(invoice.subtotal) || money(invoice.totalAmount),
    );
    const invoiceDiscount = money(invoice.discountAmount);
    const proratedDiscount = (gross / invoiceSubtotal) * invoiceDiscount;
    const lineNet = Math.max(0, gross - proratedDiscount);
    const invoiceTotal = Math.max(0.0001, money(invoice.totalAmount));
    const paidShare = lineNet * (money(invoice.paidAmount) / invoiceTotal);
    const paidRevenue = roundMoney(Math.min(lineNet, paidShare));
    const pendingRevenue = roundMoney(Math.max(0, lineNet - paidRevenue));

    return {
      lineRevenue: roundMoney(lineNet),
      paidRevenue,
      pendingRevenue,
      invoiceStatus: invoice.status,
      paymentStatus: paymentBucketFromInvoice(invoice),
      excludedReason: null,
    };
  }

  async loadCompletedLineMetrics(
    user: DashboardJwtUser,
    query: StaffServicesRevenueQueryDto,
  ): Promise<{
    range: CairoResolvedRange;
    branchId: string | null;
    lines: StaffServiceLineMetric[];
    excludedCancelled: {
      servicesDone: number;
      totalRevenue: number;
    };
  }> {
    const range = this.resolveCairoRange(query);
    const bf = this.resolveBookingBranchWhere(user, query);
    const branchId =
      query.branchId ??
      (typeof bf.branchId === 'string' ? bf.branchId : null) ??
      null;

    const items = await this.prisma.bookingItem.findMany({
      where: {
        lineStatus: BookingItemLineStatus.COMPLETED,
        staffProfileId: { not: null },
        completedAt: { gte: range.start, lt: range.endExclusive },
        ...(query.staffId ? { staffProfileId: query.staffId } : {}),
        ...(query.serviceId ? { serviceId: query.serviceId } : {}),
        ...(query.categoryId
          ? { service: { is: { categoryId: query.categoryId } } }
          : {}),
        booking: {
          is: {
            ...bf,
            ...this.bookingSourceFilter(query.source),
          },
        },
      },
      include: {
        staffProfile: { select: { id: true, displayName: true } },
        service: { select: { id: true, name: true, categoryId: true } },
        booking: {
          select: {
            id: true,
            clientId: true,
            branchId: true,
            source: true,
            invoices: {
              orderBy: { createdAt: 'desc' },
              include: { lines: true },
            },
          },
        },
      },
    });

    const lines: StaffServiceLineMetric[] = [];
    let excludedServices = 0;
    let excludedRevenue = 0;

    for (const item of items) {
      const staff = item.staffProfile!;
      const finalized = item.booking.invoices.find(
        (inv) => inv.status === InvoiceStatus.FINALIZED,
      );
      const hasCancelledOnly =
        !finalized &&
        item.booking.invoices.some(
          (inv) => inv.status === InvoiceStatus.CANCELLED,
        );

      if (hasCancelledOnly) {
        excludedServices += item.quantity;
        excludedRevenue += money(item.priceSnapshot) * item.quantity;
        if (query.invoiceStatus !== InvoiceStatus.CANCELLED) {
          continue;
        }
        const gross = roundMoney(money(item.priceSnapshot) * item.quantity);
        lines.push({
          bookingItemId: item.id,
          staffProfileId: staff.id,
          staffName: staff.displayName,
          serviceId: item.serviceId,
          serviceName: item.service?.name ?? item.nameSnapshot,
          categoryId: item.service?.categoryId ?? null,
          bookingId: item.booking.id,
          clientId: item.booking.clientId,
          branchId: item.booking.branchId,
          isWalkIn: item.booking.source === BookingSource.WALK_IN,
          completedAt: item.completedAt!,
          completedDayCairo: ymdInCairo(item.completedAt!),
          quantity: item.quantity,
          lineRevenue: gross,
          paidRevenue: 0,
          pendingRevenue: gross,
          invoiceStatus: InvoiceStatus.CANCELLED,
          paymentStatus: null,
          excludedReason: 'CANCELLED_INVOICE',
        });
        continue;
      }

      const rev = this.computeLineRevenue(item, finalized ?? null);

      if (query.invoiceStatus === InvoiceStatus.FINALIZED && !finalized) {
        continue;
      }
      if (
        query.invoiceStatus === InvoiceStatus.CANCELLED &&
        !hasCancelledOnly
      ) {
        continue;
      }

      if (query.paymentStatus && rev.paymentStatus !== query.paymentStatus) {
        continue;
      }

      lines.push({
        bookingItemId: item.id,
        staffProfileId: staff.id,
        staffName: staff.displayName,
        serviceId: item.serviceId,
        serviceName: item.service?.name ?? item.nameSnapshot,
        categoryId: item.service?.categoryId ?? null,
        bookingId: item.booking.id,
        clientId: item.booking.clientId,
        branchId: item.booking.branchId,
        isWalkIn: item.booking.source === BookingSource.WALK_IN,
        completedAt: item.completedAt!,
        completedDayCairo: ymdInCairo(item.completedAt!),
        quantity: item.quantity,
        lineRevenue: rev.lineRevenue,
        paidRevenue: rev.paidRevenue,
        pendingRevenue: rev.pendingRevenue,
        invoiceStatus: rev.invoiceStatus,
        paymentStatus: rev.paymentStatus,
        excludedReason: rev.excludedReason,
      });
    }

    return {
      range,
      branchId,
      lines,
      excludedCancelled: {
        servicesDone: excludedServices,
        totalRevenue: roundMoney(excludedRevenue),
      },
    };
  }

  buildSummary(lines: StaffServiceLineMetric[]) {
    const totalServicesDone = lines.reduce((s, l) => s + l.quantity, 0);
    const totalRevenue = roundMoney(
      lines.reduce((s, l) => s + l.lineRevenue, 0),
    );
    const paidRevenue = roundMoney(
      lines.reduce((s, l) => s + l.paidRevenue, 0),
    );
    const pendingRevenue = roundMoney(
      lines.reduce((s, l) => s + l.pendingRevenue, 0),
    );
    const averageRevenuePerService =
      totalServicesDone > 0 ? roundMoney(totalRevenue / totalServicesDone) : 0;

    const byStaff = new Map<
      string,
      {
        staffId: string;
        staffName: string;
        servicesDone: number;
        totalRevenue: number;
        paidRevenue: number;
        pendingRevenue: number;
        bookings: Set<string>;
        walkins: Set<string>;
        serviceCounts: Map<string, number>;
      }
    >();

    for (const line of lines) {
      let row = byStaff.get(line.staffProfileId);
      if (!row) {
        row = {
          staffId: line.staffProfileId,
          staffName: line.staffName,
          servicesDone: 0,
          totalRevenue: 0,
          paidRevenue: 0,
          pendingRevenue: 0,
          bookings: new Set<string>(),
          walkins: new Set<string>(),
          serviceCounts: new Map<string, number>(),
        };
        byStaff.set(line.staffProfileId, row);
      }
      row.servicesDone += line.quantity;
      row.totalRevenue += line.lineRevenue;
      row.paidRevenue += line.paidRevenue;
      row.pendingRevenue += line.pendingRevenue;
      if (line.isWalkIn) {
        row.walkins.add(line.bookingId);
      } else {
        row.bookings.add(line.bookingId);
      }
      row.serviceCounts.set(
        line.serviceName,
        (row.serviceCounts.get(line.serviceName) ?? 0) + line.quantity,
      );
    }

    const staffRows = Array.from(byStaff.values())
      .map((row) => {
        let topServiceName = '';
        let topCount = 0;
        for (const [name, count] of row.serviceCounts) {
          if (count > topCount) {
            topCount = count;
            topServiceName = name;
          }
        }
        const servicesDone = row.servicesDone;
        return {
          staffId: row.staffId,
          staffName: row.staffName,
          servicesDone,
          totalRevenue: roundMoney(row.totalRevenue),
          paidRevenue: roundMoney(row.paidRevenue),
          pendingRevenue: roundMoney(row.pendingRevenue),
          averageServiceValue:
            servicesDone > 0 ? roundMoney(row.totalRevenue / servicesDone) : 0,
          topServiceName: topServiceName || null,
          bookingsCount: row.bookings.size,
          walkinsCount: row.walkins.size,
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    const topStaffByRevenue = staffRows[0] ?? null;
    const topStaffByServiceCount =
      [...staffRows].sort((a, b) => b.servicesDone - a.servicesDone)[0] ?? null;
    const highestAverageTicketStaff =
      [...staffRows]
        .filter((r) => r.servicesDone > 0)
        .sort((a, b) => b.averageServiceValue - a.averageServiceValue)[0] ??
      null;

    const trendMap = new Map<string, number>();
    for (const line of lines) {
      trendMap.set(
        line.completedDayCairo,
        (trendMap.get(line.completedDayCairo) ?? 0) + line.lineRevenue,
      );
    }
    const revenueTrendByDay = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({ date, revenue: roundMoney(revenue) }));

    const revenueByStaff = staffRows.map((r) => ({
      staffId: r.staffId,
      staffName: r.staffName,
      revenue: r.totalRevenue,
    }));
    const servicesCountByStaff = staffRows.map((r) => ({
      staffId: r.staffId,
      staffName: r.staffName,
      count: r.servicesDone,
    }));

    const serviceMixByStaff = staffRows.map((row) => {
      const staffLines = lines.filter((l) => l.staffProfileId === row.staffId);
      const mix = new Map<string, number>();
      for (const l of staffLines) {
        mix.set(l.serviceName, (mix.get(l.serviceName) ?? 0) + l.quantity);
      }
      return {
        staffId: row.staffId,
        staffName: row.staffName,
        services: Array.from(mix.entries())
          .map(([serviceName, count]) => ({ serviceName, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
      };
    });

    return {
      summary: {
        totalServicesDone,
        totalRevenue,
        paidRevenue,
        pendingRevenue,
        averageRevenuePerService,
        activeStaffCount: staffRows.length,
        topStaffByRevenue,
        topStaffByServiceCount,
        highestAverageTicketStaff,
      },
      staffRows,
      charts: {
        revenueByStaff,
        servicesCountByStaff,
        revenueTrendByDay,
        serviceMixByStaff,
      },
    };
  }

  async getReport(user: DashboardJwtUser, query: StaffServicesRevenueQueryDto) {
    const { range, branchId, lines, excludedCancelled } =
      await this.loadCompletedLineMetrics(user, query);
    const built = this.buildSummary(lines);

    return {
      range: {
        from: range.fromYmd,
        to: range.toYmd,
        timeZone: CAIRO_TIME_ZONE,
      },
      branchId,
      hasData: lines.length > 0,
      excludedCancelled,
      ...built,
    };
  }

  async getStaffDetail(
    user: DashboardJwtUser,
    staffProfileId: string,
    query: StaffServicesRevenueQueryDto,
  ) {
    const detailQuery = { ...query, staffId: staffProfileId };
    const { range, branchId, lines } = await this.loadCompletedLineMetrics(
      user,
      detailQuery,
    );

    const bf = this.resolveBookingBranchWhere(user, query);
    const branchIds =
      typeof bf.branchId === 'string'
        ? [bf.branchId]
        : (bf.branchId as { in?: string[] } | undefined)?.in;

    const profile = await this.prisma.staffProfile.findFirst({
      where: {
        id: staffProfileId,
        ...(branchIds?.length === 1
          ? { branchId: branchIds[0] }
          : branchIds?.length
            ? { branchId: { in: branchIds } }
            : branchId
              ? { branchId }
              : {}),
      },
      select: { id: true, displayName: true, branchId: true },
    });
    if (!profile) {
      return {
        staff: null,
        range: {
          from: range.fromYmd,
          to: range.toYmd,
          timeZone: CAIRO_TIME_ZONE,
        },
        branchId,
        hasData: false,
      };
    }

    const built = this.buildSummary(lines);
    const servicesDone = lines.reduce((s, l) => s + l.quantity, 0);
    const totalRevenue = roundMoney(
      lines.reduce((s, l) => s + l.lineRevenue, 0),
    );
    const paidRevenue = roundMoney(
      lines.reduce((s, l) => s + l.paidRevenue, 0),
    );

    const serviceBreakdownMap = new Map<
      string,
      {
        serviceId: string | null;
        serviceName: string;
        count: number;
        totalRevenue: number;
        paidRevenue: number;
      }
    >();
    for (const line of lines) {
      const key = line.serviceId ?? line.serviceName;
      const row = serviceBreakdownMap.get(key) ?? {
        serviceId: line.serviceId,
        serviceName: line.serviceName,
        count: 0,
        totalRevenue: 0,
        paidRevenue: 0,
      };
      row.count += line.quantity;
      row.totalRevenue += line.lineRevenue;
      row.paidRevenue += line.paidRevenue;
      serviceBreakdownMap.set(key, row);
    }
    const serviceBreakdown = Array.from(serviceBreakdownMap.values())
      .map((r) => ({
        ...r,
        totalRevenue: roundMoney(r.totalRevenue),
        paidRevenue: roundMoney(r.paidRevenue),
        averageValue: r.count > 0 ? roundMoney(r.totalRevenue / r.count) : 0,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    const mostPerformed =
      [...serviceBreakdown].sort((a, b) => b.count - a.count)[0] ?? null;
    const bestRevenue = serviceBreakdown[0] ?? null;

    const dailyMap = new Map<
      string,
      {
        date: string;
        servicesDone: number;
        totalRevenue: number;
        paidRevenue: number;
      }
    >();
    for (const line of lines) {
      const row = dailyMap.get(line.completedDayCairo) ?? {
        date: line.completedDayCairo,
        servicesDone: 0,
        totalRevenue: 0,
        paidRevenue: 0,
      };
      row.servicesDone += line.quantity;
      row.totalRevenue += line.lineRevenue;
      row.paidRevenue += line.paidRevenue;
      dailyMap.set(line.completedDayCairo, row);
    }
    const dailyBreakdown = Array.from(dailyMap.values())
      .map((r) => ({
        ...r,
        totalRevenue: roundMoney(r.totalRevenue),
        paidRevenue: roundMoney(r.paidRevenue),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const clientIds = new Set(lines.map((l) => l.clientId));
    const clientVisitCounts = new Map<string, number>();
    for (const line of lines) {
      clientVisitCounts.set(
        line.clientId,
        (clientVisitCounts.get(line.clientId) ?? 0) + 1,
      );
    }
    const repeatClients = Array.from(clientVisitCounts.values()).filter(
      (c) => c > 1,
    ).length;

    const priorBookings = await this.prisma.booking.groupBy({
      by: ['clientId'],
      where: {
        clientId: { in: Array.from(clientIds) },
        createdAt: { lt: range.start },
        ...(branchId ? { branchId } : {}),
      },
      _count: { _all: true },
    });
    const priorClientSet = new Set(priorBookings.map((r) => r.clientId));
    const repeatFromHistory = Array.from(clientIds).filter((id) =>
      priorClientSet.has(id),
    ).length;

    return {
      staff: {
        staffId: profile.id,
        staffName: profile.displayName,
        branchId: profile.branchId,
      },
      range: {
        from: range.fromYmd,
        to: range.toYmd,
        timeZone: CAIRO_TIME_ZONE,
      },
      branchId,
      hasData: lines.length > 0,
      kpis: {
        servicesDone,
        totalRevenue,
        paidRevenue,
        pendingRevenue: roundMoney(
          lines.reduce((s, l) => s + l.pendingRevenue, 0),
        ),
        averageServiceValue:
          servicesDone > 0 ? roundMoney(totalRevenue / servicesDone) : 0,
        mostPerformedService: mostPerformed?.serviceName ?? null,
        bestRevenueService: bestRevenue?.serviceName ?? null,
        totalClientsServed: clientIds.size,
        repeatClientsInPeriod: repeatClients,
        repeatClientsFromHistory: repeatFromHistory,
      },
      serviceBreakdown,
      dailyBreakdown,
      charts: built.charts,
    };
  }

  async exportCsv(
    user: DashboardJwtUser,
    query: StaffServicesRevenueQueryDto,
  ): Promise<{ csv: string; filename: string }> {
    const report = await this.getReport(user, query);
    const header = [
      'Staff',
      'Services Done',
      'Total Revenue (EGP)',
      'Paid Revenue (EGP)',
      'Pending Revenue (EGP)',
      'Avg Service Value (EGP)',
      'Top Service',
      'Bookings',
      'Walk-ins',
    ];
    const rows = report.staffRows.map((r) =>
      [
        r.staffName,
        r.servicesDone,
        r.totalRevenue,
        r.paidRevenue,
        r.pendingRevenue,
        r.averageServiceValue,
        r.topServiceName ?? '',
        r.bookingsCount,
        r.walkinsCount,
      ]
        .map((v) => this.csvEscape(v))
        .join(','),
    );
    const csv = [header.join(','), ...rows].join('\n');
    const filename = `staff-services-revenue-${report.range.from}-${report.range.to}.csv`;
    return { csv, filename };
  }

  private csvEscape(value: unknown): string {
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
}
