import {
  BookingChangeRequestStatus,
  BookingStatus,
  BookingItemLineStatus,
  DailyClosingStatus,
  GalleryItemLibraryStatus,
  InvoiceStatus,
  PaymentStatus,
  Prisma,
  QueueEntrySource,
  QueueEntryStatus,
  ReviewStatus,
} from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { canAccessAllBranches } from '../billing/dashboard-branch-scope';
import {
  addDaysToYmdInCairo,
  cairoMondayWeekRangeContainingYmd,
  cairoMonthRangeContainingYmd,
  cairoTodayYmd,
  cairoZonedDayUtcRange,
  compositeKeyToApproxUtcMs,
  getCairoNowCompositeKey,
  slotStartCompositeKey,
} from '../common/cairo-slot-time';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StaffAvailabilityService } from '../staff/staff-availability.service';
import type { ReportRangeQueryDto } from './dto/report-range-query.dto';

function parseDateOnlyUtc(value: string): Date {
  return new Date(`${value.trim().slice(0, 10)}T00:00:00.000Z`);
}

function money(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Prisma.Decimal) return Number(value.toString());
  return Number(value);
}

function reportBranchMeta(
  query: ReportRangeQueryDto,
  bf: Prisma.BookingWhereInput,
): string | null {
  return (
    query.branchId ??
    (typeof bf.branchId === 'string' ? bf.branchId : null) ??
    null
  );
}

function extractBranchIdsForSql(bf: Prisma.BookingWhereInput): string[] | null {
  if (bf.branchId === undefined || bf.branchId === null) {
    return null;
  }
  if (typeof bf.branchId === 'string') {
    return [bf.branchId];
  }
  const ins = (bf.branchId as { in?: string[] }).in;
  return ins?.length ? ins : null;
}

function branchScopeForDirectBranchModels(
  bf: Prisma.BookingWhereInput,
):
  | { branchId: string }
  | { branchId: { in: string[] } }
  | Record<string, never> {
  const ids = extractBranchIdsForSql(bf);
  if (!ids?.length) return {};
  if (ids.length === 1) return { branchId: ids[0] };
  return { branchId: { in: ids } };
}

function paymentStatusFromInvoice(invoice: {
  paidAmount: Prisma.Decimal;
  remainingAmount: Prisma.Decimal;
}): 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' {
  const paid = money(invoice.paidAmount);
  const remaining = money(invoice.remainingAmount);
  if (remaining <= 0) return 'PAID';
  if (paid > 0) return 'PARTIALLY_PAID';
  return 'UNPAID';
}

function summarizeItems(
  items: Array<{ nameSnapshot: string }> | null | undefined,
): string {
  if (!items?.length) return '—';
  if (items.length === 1) return items[0].nameSnapshot;
  return `${items[0].nameSnapshot} +${items.length - 1} more`;
}

function mapAppointmentShell(
  b: {
    id: string;
    status: BookingStatus;
    slot: { date: Date; startTime: Date; endTime: Date };
    client: { id: string; fullName: string } | null;
  },
  includePhone?: boolean,
  phone?: string | null,
) {
  return {
    id: b.id,
    status: b.status,
    slot: {
      date: b.slot.date.toISOString().slice(0, 10),
      startTime: b.slot.startTime.toISOString().slice(11, 19),
      endTime: b.slot.endTime.toISOString().slice(11, 19),
    },
    client: b.client
      ? {
          id: b.client.id,
          fullName: b.client.fullName,
          ...(includePhone && phone !== undefined ? { phone } : {}),
        }
      : null,
  };
}

function buildTrendSeries(
  rows: Array<{ status: BookingStatus; slot: { date: Date } }>,
  dayKeys: string[],
) {
  const map = new Map<
    string,
    { total: number; completed: number; cancelled: number; noShow: number }
  >();
  for (const d of dayKeys) {
    map.set(d, { total: 0, completed: 0, cancelled: 0, noShow: 0 });
  }
  for (const r of rows) {
    const dk = r.slot.date.toISOString().slice(0, 10);
    if (!map.has(dk)) continue;
    const cur = map.get(dk)!;
    cur.total += 1;
    if (r.status === BookingStatus.COMPLETED) cur.completed += 1;
    if (r.status === BookingStatus.CANCELLED) cur.cancelled += 1;
    if (r.status === BookingStatus.NO_SHOW) cur.noShow += 1;
  }
  return dayKeys.map((date) => ({
    date,
    ...map.get(date)!,
  }));
}

export async function buildDashboardOverview(
  prisma: PrismaService,
  audit: AuditService,
  user: DashboardJwtUser,
  query: ReportRangeQueryDto,
  bf: Prisma.BookingWhereInput,
  staffAvailability: StaffAvailabilityService,
): Promise<Record<string, unknown>> {
  const branchIdForMeta = reportBranchMeta(query, bf);
  const branchScope = branchScopeForDirectBranchModels(bf);
  const todayYmd = cairoTodayYmd();
  const slotToday = parseDateOnlyUtc(todayYmd);
  const bookingSlotToday: Prisma.BookingWhereInput = {
    ...bf,
    slot: { date: slotToday },
  };
  const paymentBookingFilter: Prisma.PaymentWhereInput =
    Object.keys(bf).length > 0 ? { booking: { is: bf } } : {};

  const permFinancial = user.permissions.includes('reports.view_financial');
  const permQueue = user.permissions.includes('queue.read');
  const permBookings = user.permissions.includes('bookings.read');
  const permClients = user.permissions.includes('clients.read');
  const permDailyClosing = user.permissions.includes('dailyClosing.read');
  const permWebsite = user.permissions.includes('websiteContent.read');
  const permGallery = user.permissions.includes('gallery.read');
  const permServices = user.permissions.includes('services.read');
  const permReviews = user.permissions.includes('reviews.read');

  const { start: cairoDayStart, endExclusive: cairoDayEnd } =
    cairoZonedDayUtcRange(todayYmd);
  const { weekStartYmd } = cairoMondayWeekRangeContainingYmd(todayYmd);
  const { monthStartYmd, monthEndYmd } = cairoMonthRangeContainingYmd(todayYmd);
  const weekPaidStart = cairoZonedDayUtcRange(weekStartYmd).start;
  const monthPaidStart = cairoZonedDayUtcRange(monthStartYmd).start;
  const branchIds = extractBranchIdsForSql(bf);

  let branchIdsForOps: string[] | null = extractBranchIdsForSql(bf);
  if (branchIdsForOps === null) {
    if (query.branchId) {
      branchIdsForOps = [query.branchId];
    } else if (canAccessAllBranches(user)) {
      branchIdsForOps = (
        await prisma.branch.findMany({ select: { id: true } })
      ).map((r) => r.id);
    } else {
      branchIdsForOps = [];
    }
  }

  const [
    statusTodayRows,
    auditRows,
    pendingChangeRequests,
    trendRows,
    closingRows,
  ] = await Promise.all([
    prisma.booking.groupBy({
      by: ['status'],
      where: bookingSlotToday,
      _count: { _all: true },
    }),
    audit.listRecent(12),
    prisma.bookingChangeRequest.count({
      where: {
        status: BookingChangeRequestStatus.PENDING,
        booking: { is: bf },
      },
    }),
    prisma.booking.findMany({
      where: {
        ...bf,
        slot: {
          date: {
            gte: parseDateOnlyUtc(addDaysToYmdInCairo(todayYmd, -40)),
            lte: parseDateOnlyUtc(todayYmd),
          },
        },
      },
      select: { status: true, slot: { select: { date: true } } },
    }),
    permDailyClosing && branchIdsForOps.length > 0
      ? prisma.dailyClosing.findMany({
          where: {
            businessDate: slotToday,
            branchId: { in: branchIdsForOps },
          },
          select: { branchId: true, status: true },
        })
      : Promise.resolve(
          [] as Array<{ branchId: string; status: DailyClosingStatus }>,
        ),
  ]);

  const countBy = new Map<BookingStatus, number>();
  for (const row of statusTodayRows) {
    countBy.set(row.status, row._count._all);
  }
  const pendingToday = countBy.get(BookingStatus.PENDING) ?? 0;
  const confirmedToday =
    (countBy.get(BookingStatus.CONFIRMED) ?? 0) +
    (countBy.get(BookingStatus.RESCHEDULED) ?? 0) +
    (countBy.get(BookingStatus.ARRIVED) ?? 0) +
    (countBy.get(BookingStatus.IN_PROGRESS) ?? 0);
  const completedToday = countBy.get(BookingStatus.COMPLETED) ?? 0;
  const cancelledToday = countBy.get(BookingStatus.CANCELLED) ?? 0;
  const noShowToday = countBy.get(BookingStatus.NO_SHOW) ?? 0;
  const rejectedToday = countBy.get(BookingStatus.REJECTED) ?? 0;
  const totalToday =
    pendingToday +
    confirmedToday +
    completedToday +
    cancelledToday +
    noShowToday +
    rejectedToday;
  const completionRate =
    totalToday > 0
      ? Math.round((completedToday / totalToday) * 1000) / 1000
      : 0;

  const dayKeys7 = Array.from({ length: 7 }, (_, i) =>
    addDaysToYmdInCairo(todayYmd, -6 + i),
  );
  const dayKeys30 = Array.from({ length: 30 }, (_, i) =>
    addDaysToYmdInCairo(todayYmd, -29 + i),
  );
  const monthDayKeys: string[] = [];
  {
    let d = monthStartYmd;
    while (d <= monthEndYmd) {
      monthDayKeys.push(d);
      d = addDaysToYmdInCairo(d, 1);
    }
  }

  const trend7 = buildTrendSeries(trendRows, dayKeys7);
  const trend30 = buildTrendSeries(trendRows, dayKeys30);
  const trendMonth = buildTrendSeries(trendRows, monthDayKeys);

  const nowKey = getCairoNowCompositeKey();
  const nowMs = compositeKeyToApproxUtcMs(nowKey) ?? Date.now();
  const upcomingUntilMs = nowMs + 60 * 60 * 1000;

  const scheduleSelect = {
    id: true,
    status: true,
    source: true,
    clientId: true,
    slot: { select: { id: true, date: true, startTime: true, endTime: true } },
    client: { select: { id: true, fullName: true, phone: true } },
    items: {
      take: 5,
      orderBy: { createdAt: 'asc' as const },
      select: { nameSnapshot: true },
    },
    invoices: {
      take: 1,
      orderBy: { createdAt: 'desc' as const },
      select: {
        paidAmount: true,
        remainingAmount: true,
        status: true,
      },
    },
  } as const;

  const queueWaitCutoff = new Date(Date.now() - 20 * 60 * 1000);

  const [
    scheduleBookings,
    recentBookings,
    unpaidCompletedBookings,
    queueWaiting,
    queueInService,
    queueWaitingOver20,
    walkInsToday,
    queueServedToday,
    queueCompletedSamples,
    longestWaiting,
    paidTodayAgg,
    paidWeekAgg,
    paidMonthAgg,
    refundsTodayAgg,
    unpaidInvoicesAgg,
    monthBookingAgg,
    unpaidTodayAgg,
    websiteHealthRows,
    recentClientRows,
    newClientsWeek,
  ] = await Promise.all([
    permBookings
      ? prisma.booking.findMany({
          where: bookingSlotToday,
          orderBy: [{ slot: { startTime: 'asc' } }],
          take: 48,
          select: scheduleSelect,
        })
      : Promise.resolve([]),
    permBookings
      ? prisma.booking.findMany({
          where: Object.keys(bf).length ? bf : {},
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: scheduleSelect,
        })
      : Promise.resolve([]),
    permBookings && permFinancial
      ? prisma.booking.count({
          where: {
            ...bf,
            status: BookingStatus.COMPLETED,
            invoices: {
              some: {
                status: InvoiceStatus.FINALIZED,
                remainingAmount: { gt: 0 },
              },
            },
          },
        })
      : Promise.resolve(0),
    permQueue
      ? prisma.queueEntry.count({
          where: { ...branchScope, status: QueueEntryStatus.WAITING },
        })
      : Promise.resolve(0),
    permQueue
      ? prisma.queueEntry.count({
          where: { ...branchScope, status: QueueEntryStatus.IN_SERVICE },
        })
      : Promise.resolve(0),
    permQueue
      ? prisma.queueEntry.count({
          where: {
            ...branchScope,
            status: QueueEntryStatus.WAITING,
            checkedInAt: { lt: queueWaitCutoff },
          },
        })
      : Promise.resolve(0),
    permQueue
      ? prisma.queueEntry.count({
          where: {
            ...branchScope,
            source: QueueEntrySource.WALK_IN,
            checkedInAt: { gte: cairoDayStart, lt: cairoDayEnd },
          },
        })
      : Promise.resolve(0),
    permQueue
      ? prisma.queueEntry.count({
          where: {
            ...branchScope,
            status: QueueEntryStatus.COMPLETED,
            completedAt: { gte: cairoDayStart, lt: cairoDayEnd },
          },
        })
      : Promise.resolve(0),
    permQueue
      ? prisma.queueEntry.findMany({
          where: {
            ...branchScope,
            status: QueueEntryStatus.COMPLETED,
            completedAt: { gte: cairoDayStart, lt: cairoDayEnd },
            startedAt: { not: null },
          },
          select: { checkedInAt: true, startedAt: true },
        })
      : Promise.resolve([]),
    permQueue
      ? prisma.queueEntry.findFirst({
          where: { ...branchScope, status: QueueEntryStatus.WAITING },
          orderBy: { checkedInAt: 'asc' },
          select: {
            clientNameSnapshot: true,
            checkedInAt: true,
            serviceSummarySnapshot: true,
          },
        })
      : Promise.resolve(null),
    permFinancial
      ? prisma.payment.aggregate({
          where: {
            ...paymentBookingFilter,
            status: {
              in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_PAID],
            },
            OR: [
              { paidAt: { gte: cairoDayStart, lt: cairoDayEnd } },
              {
                AND: [
                  { paidAt: null },
                  { createdAt: { gte: cairoDayStart, lt: cairoDayEnd } },
                ],
              },
            ],
          },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: null } }),
    permFinancial
      ? prisma.payment.aggregate({
          where: {
            ...paymentBookingFilter,
            status: {
              in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_PAID],
            },
            OR: [
              { paidAt: { gte: weekPaidStart, lt: cairoDayEnd } },
              {
                AND: [
                  { paidAt: null },
                  { createdAt: { gte: weekPaidStart, lt: cairoDayEnd } },
                ],
              },
            ],
          },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: null } }),
    permFinancial
      ? prisma.payment.aggregate({
          where: {
            ...paymentBookingFilter,
            status: {
              in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_PAID],
            },
            OR: [
              { paidAt: { gte: monthPaidStart, lt: cairoDayEnd } },
              {
                AND: [
                  { paidAt: null },
                  { createdAt: { gte: monthPaidStart, lt: cairoDayEnd } },
                ],
              },
            ],
          },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: null } }),
    permFinancial
      ? prisma.payment.aggregate({
          where: {
            ...paymentBookingFilter,
            status: PaymentStatus.REFUNDED,
            OR: [
              { paidAt: { gte: cairoDayStart, lt: cairoDayEnd } },
              {
                AND: [
                  { paidAt: null },
                  { createdAt: { gte: cairoDayStart, lt: cairoDayEnd } },
                ],
              },
            ],
          },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: null } }),
    permFinancial
      ? prisma.invoice.aggregate({
          where: {
            status: InvoiceStatus.FINALIZED,
            remainingAmount: { gt: 0 },
            ...(Object.keys(bf).length ? { booking: { is: bf } } : {}),
          },
          _sum: { remainingAmount: true },
        })
      : Promise.resolve({ _sum: { remainingAmount: null } }),
    permFinancial
      ? prisma.booking.aggregate({
          where: {
            ...bf,
            slot: {
              date: {
                gte: parseDateOnlyUtc(monthStartYmd),
                lte: parseDateOnlyUtc(todayYmd),
              },
            },
          },
          _avg: { totalAmount: true },
          _count: { _all: true },
        })
      : Promise.resolve({ _avg: { totalAmount: null }, _count: { _all: 0 } }),
    permFinancial
      ? prisma.invoice.aggregate({
          where: {
            status: InvoiceStatus.FINALIZED,
            remainingAmount: { gt: 0 },
            booking: {
              is: {
                ...(Object.keys(bf).length ? bf : {}),
                slot: { date: slotToday },
              },
            },
          },
          _sum: { remainingAmount: true },
        })
      : Promise.resolve({ _sum: { remainingAmount: null } }),
    Promise.all([
      permWebsite
        ? prisma.websiteContentSection.count({ where: { isVisible: true } })
        : Promise.resolve(0),
      permWebsite
        ? prisma.websiteContentSection.count({ where: { isVisible: false } })
        : Promise.resolve(0),
      permGallery
        ? prisma.galleryItem.count({
            where: {
              libraryStatus: GalleryItemLibraryStatus.ACTIVE,
              isActive: true,
            },
          })
        : Promise.resolve(0),
      permReviews
        ? prisma.review.count({
            where: { isActive: true, status: ReviewStatus.APPROVED },
          })
        : Promise.resolve(0),
      permServices
        ? prisma.service.count({
            where: {
              isActive: true,
              imageMediaId: null,
              imageUrl: null,
            },
          })
        : Promise.resolve(0),
      permServices
        ? prisma.package.count({
            where: {
              isActive: true,
              OR: [{ imageUrl: null }, { imageUrl: '' }],
            },
          })
        : Promise.resolve(0),
    ]),
    permClients
      ? prisma.client.findMany({
          take: 6,
          orderBy: { updatedAt: 'desc' },
          where: {
            ...(branchIds?.length === 1
              ? { preferredBranchId: branchIds[0] }
              : branchIds && branchIds.length > 1
                ? { preferredBranchId: { in: branchIds } }
                : {}),
          },
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            createdAt: true,
            _count: { select: { bookings: true } },
            bookings: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: {
                createdAt: true,
                slot: { select: { date: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    permClients
      ? prisma.client.count({
          where: {
            createdAt: { gte: weekPaidStart, lt: cairoDayEnd },
            ...(branchIds?.length === 1
              ? { preferredBranchId: branchIds[0] }
              : branchIds && branchIds.length > 1
                ? { preferredBranchId: { in: branchIds } }
                : {}),
          },
        })
      : Promise.resolve(0),
  ]);

  const [
    publishedSections,
    draftSections,
    galleryCount,
    activeTestimonials,
    servicesMissingImages,
    packagesMissingImages,
  ] = websiteHealthRows;

  let avgWaitMinutes: number | null = null;
  if (permQueue && queueCompletedSamples.length) {
    const waits = queueCompletedSamples
      .map((r) => {
        if (!r.startedAt) return null;
        return (r.startedAt.getTime() - r.checkedInAt.getTime()) / (60 * 1000);
      })
      .filter((v): v is number => v !== null && !Number.isNaN(v));
    if (waits.length) {
      avgWaitMinutes =
        Math.round((waits.reduce((a, b) => a + b, 0) / waits.length) * 10) / 10;
    }
  }

  let longestWaitMinutes: number | null = null;
  if (permQueue && longestWaiting) {
    longestWaitMinutes =
      Math.round(
        ((Date.now() - longestWaiting.checkedInAt.getTime()) / (60 * 1000)) *
          10,
      ) / 10;
  }

  const closedBranchSet = new Set(
    closingRows
      .filter((c) => c.status === DailyClosingStatus.CLOSED)
      .map((c) => c.branchId),
  );
  const branchesMissingClosing = branchIdsForOps.filter(
    (id) => !closedBranchSet.has(id),
  ).length;

  const attention: Array<{
    severity: 'critical' | 'warning' | 'info';
    title: string;
    detail?: string;
    count?: number;
    href: string;
  }> = [];

  if (pendingToday > 0) {
    attention.push({
      severity: 'warning',
      title: 'Pending bookings need confirmation',
      count: pendingToday,
      href: `/dashboard/bookings?status=PENDING&dateFrom=${todayYmd}&dateTo=${todayYmd}`,
    });
  }
  if (pendingChangeRequests > 0) {
    attention.push({
      severity: 'warning',
      title: 'Pending booking change requests',
      count: pendingChangeRequests,
      href: '/dashboard/booking-change-requests',
    });
  }
  if (permQueue && queueWaitingOver20 > 0) {
    attention.push({
      severity: 'critical',
      title: 'Clients waiting over 20 minutes',
      count: queueWaitingOver20,
      href: '/dashboard/queue',
    });
  }
  if (permBookings && permFinancial && unpaidCompletedBookings > 0) {
    attention.push({
      severity: 'warning',
      title: 'Completed visits with unpaid balance',
      count: unpaidCompletedBookings,
      href: '/dashboard/invoices?paymentStatus=UNPAID',
    });
  }
  if (permDailyClosing && branchesMissingClosing > 0) {
    attention.push({
      severity: 'info',
      title: 'Daily closing not completed',
      count: branchesMissingClosing,
      href: `/dashboard/daily-closing?date=${todayYmd}`,
    });
  }

  const upcomingAppointments: ReturnType<typeof mapAppointmentShell>[] = [];
  if (permBookings) {
    for (const b of scheduleBookings) {
      const st = b.status;
      if (
        st !== BookingStatus.PENDING &&
        st !== BookingStatus.CONFIRMED &&
        st !== BookingStatus.RESCHEDULED
      ) {
        continue;
      }
      const key = slotStartCompositeKey({
        date: b.slot.date,
        startTime: b.slot.startTime,
      });
      const ms = compositeKeyToApproxUtcMs(key);
      if (ms === null || ms <= nowMs || ms > upcomingUntilMs) continue;
      upcomingAppointments.push(mapAppointmentShell(b));
      if (upcomingAppointments.length >= 10) break;
    }
  }

  const schedulePreview = permBookings
    ? scheduleBookings.map((b) => {
        const inv = b.invoices[0];
        return {
          bookingId: b.id,
          slotId: b.slot.id,
          slotDate: b.slot.date.toISOString().slice(0, 10),
          startTime: b.slot.startTime.toISOString().slice(11, 19),
          endTime: b.slot.endTime.toISOString().slice(11, 19),
          clientName: b.client?.fullName ?? null,
          clientId: b.client?.id ?? null,
          serviceSummary: summarizeItems(b.items),
          status: b.status,
          source: b.source,
          paymentStatus: inv ? paymentStatusFromInvoice(inv) : null,
        };
      })
    : [];

  const recentBookingsOut = permBookings
    ? recentBookings.map((b) => {
        const inv = b.invoices[0];
        return {
          bookingId: b.id,
          slotDate: b.slot.date.toISOString().slice(0, 10),
          startTime: b.slot.startTime.toISOString().slice(11, 19),
          clientName: b.client?.fullName ?? null,
          serviceSummary: summarizeItems(b.items),
          status: b.status,
          source: b.source,
          paymentStatus: inv ? paymentStatusFromInvoice(inv) : null,
        };
      })
    : [];

  let returningClientsToday = 0;
  if (permBookings && permClients && scheduleBookings.length) {
    const clientIds = [
      ...new Set(scheduleBookings.map((b) => b.clientId).filter(Boolean)),
    ] as string[];
    if (clientIds.length) {
      const firsts = await prisma.booking.groupBy({
        by: ['clientId'],
        where: { clientId: { in: clientIds } },
        _min: { createdAt: true },
      });
      for (const row of firsts) {
        if (row._min.createdAt && row._min.createdAt < cairoDayStart) {
          returningClientsToday += 1;
        }
      }
    }
  }

  const recentActivity = auditRows.map((a) => ({
    id: a.id,
    action: a.action,
    module: a.module,
    entityId: a.entityId,
    createdAt: a.createdAt,
    user: a.user
      ? { id: a.user.id, name: a.user.name, email: a.user.email }
      : null,
  }));

  const paidToday = money(paidTodayAgg._sum.amount);
  const paidWeek = money(paidWeekAgg._sum.amount);
  const paidMonth = money(paidMonthAgg._sum.amount);
  const refundsToday = money(refundsTodayAgg._sum.amount);
  const unpaidInvoicesTotal = money(unpaidInvoicesAgg._sum.remainingAmount);
  const unpaidToday = money(unpaidTodayAgg._sum.remainingAmount);
  const avgBookingValueMonth =
    monthBookingAgg._count._all > 0
      ? money(monthBookingAgg._avg.totalAmount)
      : 0;

  const permStaff = user.permissions.includes('staff.read');
  const { start: cairoStaffDayStart, endExclusive: cairoStaffDayEnd } =
    cairoZonedDayUtcRange(todayYmd);

  let staffTodayPayload: Record<string, unknown> = {
    supported: false,
    scheduledStaffToday: 0,
    availableNow: 0,
    busyNow: 0,
    offToday: 0,
    staffToday: [] as Array<Record<string, unknown>>,
  };

  if (permStaff && branchIdsForOps.length > 0) {
    try {
      const profiles = await prisma.staffProfile.findMany({
        where: {
          branchId: { in: branchIdsForOps },
          isActive: true,
        },
        select: {
          id: true,
          branchId: true,
          displayName: true,
          isBookable: true,
        },
        orderBy: { displayName: 'asc' },
      });

      const busyRows = await prisma.bookingItem.groupBy({
        by: ['staffProfileId'],
        where: {
          staffProfileId: { not: null },
          lineStatus: BookingItemLineStatus.IN_PROGRESS,
          booking: { branchId: { in: branchIdsForOps } },
        },
        _count: { _all: true },
      });
      const busySet = new Set(
        busyRows.map((r) => r.staffProfileId).filter(Boolean) as string[],
      );

      const completedRows = await prisma.bookingItem.findMany({
        where: {
          staffProfileId: { not: null },
          lineStatus: BookingItemLineStatus.COMPLETED,
          completedAt: { gte: cairoStaffDayStart, lt: cairoStaffDayEnd },
          booking: { branchId: { in: branchIdsForOps } },
        },
        select: {
          staffProfileId: true,
          durationMinutesSnapshot: true,
        },
      });
      const completedByStaff = new Map<
        string,
        { count: number; minutes: number }
      >();
      for (const row of completedRows) {
        const sid = row.staffProfileId!;
        const cur = completedByStaff.get(sid) ?? { count: 0, minutes: 0 };
        cur.count += 1;
        cur.minutes += row.durationMinutesSnapshot;
        completedByStaff.set(sid, cur);
      }

      const inProgRows = await prisma.bookingItem.findMany({
        where: {
          staffProfileId: { not: null },
          lineStatus: BookingItemLineStatus.IN_PROGRESS,
          booking: { branchId: { in: branchIdsForOps } },
        },
        select: { staffProfileId: true, durationMinutesSnapshot: true },
      });
      const inProgByStaff = new Map<string, number>();
      const inProgMinutesByStaff = new Map<string, number>();
      for (const row of inProgRows) {
        const sid = row.staffProfileId!;
        inProgByStaff.set(sid, (inProgByStaff.get(sid) ?? 0) + 1);
        inProgMinutesByStaff.set(
          sid,
          (inProgMinutesByStaff.get(sid) ?? 0) + row.durationMinutesSnapshot,
        );
      }

      const bookingTouchRows = await prisma.bookingItem.groupBy({
        by: ['staffProfileId', 'bookingId'],
        where: {
          staffProfileId: { not: null },
          booking: {
            branchId: { in: branchIdsForOps },
            slot: { date: slotToday },
          },
        },
        _count: { _all: true },
      });
      const bookingsTodayByStaff = new Map<string, number>();
      for (const row of bookingTouchRows) {
        const sid = row.staffProfileId!;
        bookingsTodayByStaff.set(sid, (bookingsTodayByStaff.get(sid) ?? 0) + 1);
      }

      function wallMinutes(a: string, b: string): number {
        const pa = a.split(':').map(Number);
        const pb = b.split(':').map(Number);
        const ma = pa[0] * 60 + pa[1] + pa[2] / 60;
        const mb = pb[0] * 60 + pb[1] + pb[2] / 60;
        return Math.max(0, Math.round(mb - ma));
      }

      const staffRows: Array<Record<string, unknown>> = [];
      let scheduledStaffToday = 0;
      let availableNow = 0;
      let busyNow = 0;
      let offToday = 0;

      for (const p of profiles) {
        const intervals = await staffAvailability.buildWorkingIntervals(
          p.id,
          p.branchId,
          todayYmd,
        );
        const hasScheduleToday = intervals.length > 0;
        const scheduledNow =
          hasScheduleToday &&
          staffAvailability.isInstantAvailableOnDate(intervals, nowKey);
        if (hasScheduleToday) scheduledStaffToday += 1;

        const isBusy = busySet.has(p.id);
        let status: 'available' | 'busy' | 'off';
        if (isBusy) {
          status = 'busy';
          busyNow += 1;
        } else if (scheduledNow) {
          status = 'available';
          availableNow += 1;
        } else {
          status = 'off';
          offToday += 1;
        }

        const scheduledMinutesToday = intervals.reduce(
          (sum, w) => sum + wallMinutes(w.start, w.end),
          0,
        );
        const comp = completedByStaff.get(p.id) ?? { count: 0, minutes: 0 };
        const servicesCompletedToday = comp.count;
        const servicesInProgressNow = inProgByStaff.get(p.id) ?? 0;
        const bookedMinutesToday = comp.minutes;
        const inProgMinutes = inProgMinutesByStaff.get(p.id) ?? 0;
        const workloadPercent =
          scheduledMinutesToday > 0
            ? Math.min(
                100,
                Math.round(
                  ((bookedMinutesToday + inProgMinutes) /
                    scheduledMinutesToday) *
                    100,
                ),
              )
            : null;

        staffRows.push({
          staffProfileId: p.id,
          displayName: p.displayName,
          status,
          scheduledStart: intervals[0]?.start ?? null,
          scheduledEnd: intervals[intervals.length - 1]?.end ?? null,
          bookingsCountToday: bookingsTodayByStaff.get(p.id) ?? 0,
          servicesCompletedToday,
          servicesInProgressNow,
          bookedMinutesToday,
          scheduledMinutesToday,
          workloadPercent,
        });
      }

      staffTodayPayload = {
        supported: true,
        scheduledStaffToday,
        availableNow,
        busyNow,
        offToday,
        staffToday: staffRows,
      };
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2021'
      ) {
        staffTodayPayload = {
          supported: false,
          scheduledStaffToday: 0,
          availableNow: 0,
          busyNow: 0,
          offToday: 0,
          staffToday: [] as Array<Record<string, unknown>>,
          staffTablesMissing: true,
        };
      } else {
        throw e;
      }
    }
  }

  return {
    meta: {
      timezone: 'Africa/Cairo',
      todayYmd,
      quickWeekStartYmd:
        cairoMondayWeekRangeContainingYmd(todayYmd).weekStartYmd,
      generatedAt: new Date().toISOString(),
    },
    todayRevenue: permFinancial ? paidToday : undefined,
    range: { from: query.dateFrom ?? null, to: query.dateTo ?? null },
    branchId: branchIdForMeta,
    todayBookings: totalToday,
    pendingBookings: pendingToday,
    confirmedBookings: confirmedToday,
    completedBookings: completedToday,
    cancelledBookings: cancelledToday,
    noShowBookings: noShowToday,
    upcomingAppointments,
    recentActivity,
    today: {
      ymd: todayYmd,
      bookings: {
        total: totalToday,
        pending: pendingToday,
        confirmed: confirmedToday,
        completed: completedToday,
        cancelled: cancelledToday,
        noShow: noShowToday,
        rejected: rejectedToday,
        completionRate,
      },
    },
    attention,
    schedulePreview,
    trends: {
      last7Days: trend7,
      last30Days: trend30,
      monthToDate: trendMonth,
    },
    revenue: permFinancial
      ? {
          paidToday,
          paidThisWeek: paidWeek,
          paidThisMonth: paidMonth,
          unpaidInvoicesTotal,
          unpaidToday,
          refundsToday,
          averageBookingValueMonth: avgBookingValueMonth,
          paidShareMonth:
            paidMonth + unpaidInvoicesTotal > 0
              ? Math.round(
                  (paidMonth / (paidMonth + unpaidInvoicesTotal)) * 1000,
                ) / 1000
              : null,
        }
      : null,
    queue: permQueue
      ? {
          waitingNow: queueWaiting,
          inServiceNow: queueInService,
          walkInsToday,
          servedToday: queueServedToday,
          avgWaitMinutes,
          longestWaitMinutes,
          longestWaitingClientName: longestWaiting?.clientNameSnapshot ?? null,
          waitingOver20Minutes: queueWaitingOver20,
        }
      : null,
    staffToday: staffTodayPayload,
    recentBookings: recentBookingsOut,
    recentClients: permClients
      ? {
          newClientsThisWeek: newClientsWeek,
          returningClientsToday,
          rows: recentClientRows.map((c) => ({
            id: c.id,
            fullName: c.fullName,
            phone: c.phone,
            email: c.email,
            createdAt: c.createdAt.toISOString(),
            totalVisits: c._count.bookings,
            lastVisitDate: c.bookings[0]?.slot?.date
              ? c.bookings[0].slot.date.toISOString().slice(0, 10)
              : null,
            lastBookingAt: c.bookings[0]?.createdAt.toISOString() ?? null,
          })),
        }
      : null,
    websiteHealth: {
      activeTestimonials: permReviews ? activeTestimonials : null,
      galleryImageCount: permGallery ? galleryCount : null,
      servicesMissingImages: permServices ? servicesMissingImages : null,
      packagesMissingImages: permServices ? packagesMissingImages : null,
      publishedWebsiteSections: permWebsite ? publishedSections : null,
      draftWebsiteSections: permWebsite ? draftSections : null,
    },
  };
}
