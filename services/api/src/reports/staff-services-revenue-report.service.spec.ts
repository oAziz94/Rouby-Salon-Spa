import { BadRequestException } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { StaffServicesRevenueReportService } from './staff-services-revenue-report.service';
import type { StaffServiceLineMetric } from './staff-services-revenue-report.service';

describe('StaffServicesRevenueReportService', () => {
  const service = new StaffServicesRevenueReportService({} as never);

  const sampleLines: StaffServiceLineMetric[] = [
    {
      bookingItemId: 'a1',
      staffProfileId: 's1',
      staffName: 'Sara',
      serviceId: 'svc1',
      serviceName: 'Haircut',
      categoryId: 'cat1',
      bookingId: 'b1',
      clientId: 'c1',
      branchId: 'br1',
      isWalkIn: false,
      completedAt: new Date('2026-05-10T10:00:00.000Z'),
      completedDayCairo: '2026-05-10',
      quantity: 1,
      lineRevenue: 200,
      paidRevenue: 200,
      pendingRevenue: 0,
      invoiceStatus: InvoiceStatus.FINALIZED,
      paymentStatus: 'PAID',
      excludedReason: null,
    },
    {
      bookingItemId: 'a2',
      staffProfileId: 's1',
      staffName: 'Sara',
      serviceId: 'svc2',
      serviceName: 'Color',
      categoryId: 'cat1',
      bookingId: 'b2',
      clientId: 'c2',
      branchId: 'br1',
      isWalkIn: true,
      completedAt: new Date('2026-05-10T14:00:00.000Z'),
      completedDayCairo: '2026-05-10',
      quantity: 1,
      lineRevenue: 500,
      paidRevenue: 100,
      pendingRevenue: 400,
      invoiceStatus: InvoiceStatus.FINALIZED,
      paymentStatus: 'PARTIALLY_PAID',
      excludedReason: null,
    },
    {
      bookingItemId: 'a3',
      staffProfileId: 's2',
      staffName: 'Nour',
      serviceId: 'svc1',
      serviceName: 'Haircut',
      categoryId: 'cat1',
      bookingId: 'b3',
      clientId: 'c3',
      branchId: 'br1',
      isWalkIn: false,
      completedAt: new Date('2026-05-11T09:00:00.000Z'),
      completedDayCairo: '2026-05-11',
      quantity: 2,
      lineRevenue: 300,
      paidRevenue: 0,
      pendingRevenue: 300,
      invoiceStatus: null,
      paymentStatus: null,
      excludedReason: null,
    },
  ];

  it('resolveCairoRange rejects inverted dates', () => {
    expect(() =>
      service.resolveCairoRange({
        dateFrom: '2026-05-20',
        dateTo: '2026-05-01',
        page: 1,
        pageSize: 20,
      }),
    ).toThrow(BadRequestException);
  });

  it('buildSummary aggregates totals and staff rows', () => {
    const built = service.buildSummary(sampleLines);
    expect(built.summary.totalServicesDone).toBe(4);
    expect(built.summary.totalRevenue).toBe(1000);
    expect(built.summary.paidRevenue).toBe(300);
    expect(built.summary.pendingRevenue).toBe(700);
    expect(built.summary.averageRevenuePerService).toBe(250);
    expect(built.summary.activeStaffCount).toBe(2);
    expect(built.summary.topStaffByRevenue?.staffName).toBe('Sara');
    expect(built.summary.topStaffByServiceCount?.staffName).toBe('Sara');
    expect(built.staffRows).toHaveLength(2);
    const sara = built.staffRows.find((r) => r.staffId === 's1');
    expect(sara?.servicesDone).toBe(2);
    expect(sara?.bookingsCount).toBe(1);
    expect(sara?.walkinsCount).toBe(1);
    expect(sara?.topServiceName).toBe('Haircut');
  });

  it('buildSummary produces chart series', () => {
    const built = service.buildSummary(sampleLines);
    expect(built.charts.revenueByStaff).toHaveLength(2);
    expect(built.charts.revenueTrendByDay).toEqual([
      { date: '2026-05-10', revenue: 700 },
      { date: '2026-05-11', revenue: 300 },
    ]);
    expect(built.charts.serviceMixByStaff[0]?.services.length).toBeGreaterThan(
      0,
    );
  });

  it('computeLineRevenue prorates invoice discount and paid share', () => {
    const compute = (
      service as unknown as {
        computeLineRevenue: (
          item: { id: string; priceSnapshot: Prisma.Decimal; quantity: number },
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
        ) => {
          lineRevenue: number;
          paidRevenue: number;
          pendingRevenue: number;
        };
      }
    ).computeLineRevenue.bind(service);

    const result = compute(
      {
        id: 'item-1',
        priceSnapshot: new Prisma.Decimal(100),
        quantity: 1,
      },
      {
        status: InvoiceStatus.FINALIZED,
        subtotal: new Prisma.Decimal(200),
        discountAmount: new Prisma.Decimal(20),
        totalAmount: new Prisma.Decimal(180),
        paidAmount: new Prisma.Decimal(90),
        remainingAmount: new Prisma.Decimal(90),
        lines: [],
      },
    );

    expect(result.lineRevenue).toBe(90);
    expect(result.paidRevenue).toBe(45);
    expect(result.pendingRevenue).toBe(45);
  });
});
