import { Injectable } from '@nestjs/common';
import { computeNotificationHealth } from '../notifications/notification-health';
import {
  BookingStatus,
  InvoiceStatus,
  Prisma,
  QueueEntryStatus,
} from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import {
  buildDashboardBookingBranchWhere,
  canAccessAllBranches,
  getEffectiveAllowedBranchIds,
} from '../billing/dashboard-branch-scope';
import {
  cairoTodayYmd,
  cairoZonedDayUtcRange,
  compositeKeyToApproxUtcMs,
  getCairoNowCompositeKey,
  slotStartCompositeKey,
} from '../common/cairo-slot-time';
import { PrismaService } from '../prisma/prisma.service';

const UPCOMING_WINDOW_MS = 90 * 60 * 1000;

/**
 * Light "today" summary for the front desk. Gated by `overview.read` only, so
 * roles without `reports.view` (Receptionist, Staff) still get a landing strip
 * and bell notifications without the 55-query reports overview.
 */
@Injectable()
export class OverviewTodayService {
  constructor(private readonly prisma: PrismaService) {}

  async today(user: DashboardJwtUser, branchId?: string) {
    const todayYmd = cairoTodayYmd();
    const slotToday = new Date(`${todayYmd}T00:00:00.000Z`);
    const { start, endExclusive } = cairoZonedDayUtcRange(todayYmd);

    const bookingWhere = buildDashboardBookingBranchWhere(user, branchId);
    const queueBranch: Prisma.QueueEntryWhereInput = canAccessAllBranches(user)
      ? branchId
        ? { branchId }
        : {}
      : { branchId: { in: getEffectiveAllowedBranchIds(user) } };
    if (branchId && !canAccessAllBranches(user)) {
      queueBranch.branchId = branchId;
    }

    const [queueRows, expected, todayBookings, unpaidInvoices] =
      await Promise.all([
        this.prisma.queueEntry.groupBy({
          by: ['status'],
          where: {
            ...queueBranch,
            OR: [
              {
                status: {
                  in: [QueueEntryStatus.WAITING, QueueEntryStatus.IN_SERVICE],
                },
              },
              {
                status: QueueEntryStatus.COMPLETED,
                completedAt: { gte: start, lt: endExclusive },
              },
            ],
          },
          _count: { _all: true },
        }),
        this.prisma.booking.count({
          where: {
            ...bookingWhere,
            slot: { date: slotToday },
            status: {
              in: [BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED],
            },
            queueEntries: { none: {} },
          },
        }),
        this.prisma.booking.findMany({
          where: {
            ...bookingWhere,
            slot: { date: slotToday },
            status: {
              in: [
                BookingStatus.CONFIRMED,
                BookingStatus.RESCHEDULED,
                BookingStatus.ARRIVED,
              ],
            },
          },
          select: {
            id: true,
            status: true,
            slot: { select: { date: true, startTime: true, endTime: true } },
            client: { select: { id: true, fullName: true } },
          },
          orderBy: [{ slot: { startTime: 'asc' } }],
          take: 100,
        }),
        this.prisma.invoice.count({
          where: {
            status: InvoiceStatus.FINALIZED,
            remainingAmount: { gt: 0 },
            createdAt: { gte: start, lt: endExclusive },
            ...(Object.keys(bookingWhere).length
              ? { booking: { is: bookingWhere } }
              : {}),
          },
        }),
      ]);

    // "Running out of bookable slots" warning: last future slot date across the visible branches.
    const lastSlot = await this.prisma.bookingSlot.findFirst({
      where: {
        deletedAt: null,
        isWalkInBucket: false,
        date: { gte: slotToday },
        ...(queueBranch.branchId
          ? {
              branchId:
                queueBranch.branchId as Prisma.BookingSlotWhereInput['branchId'],
            }
          : {}),
      },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    const lastSlotDate = lastSlot
      ? lastSlot.date.toISOString().slice(0, 10)
      : null;
    const slotDaysAhead = lastSlot
      ? Math.round((lastSlot.date.getTime() - slotToday.getTime()) / 86_400_000)
      : -1;

    const count = (status: QueueEntryStatus) =>
      queueRows.find((r) => r.status === status)?._count._all ?? 0;

    const nowMs =
      compositeKeyToApproxUtcMs(getCairoNowCompositeKey()) ?? Date.now();
    const upcomingAppointments = todayBookings
      .filter((b) => {
        const startMs = compositeKeyToApproxUtcMs(
          slotStartCompositeKey(b.slot),
        );
        return (
          startMs !== null &&
          startMs >= nowMs - 15 * 60 * 1000 &&
          startMs <= nowMs + UPCOMING_WINDOW_MS
        );
      })
      .slice(0, 10)
      .map((b) => ({
        id: b.id,
        status: b.status,
        slot: {
          date: b.slot.date.toISOString().slice(0, 10),
          startTime: b.slot.startTime.toISOString().slice(11, 19),
          endTime: b.slot.endTime.toISOString().slice(11, 19),
        },
        client: b.client
          ? { id: b.client.id, fullName: b.client.fullName }
          : null,
      }));

    return {
      todayYmd,
      branchId: branchId ?? null,
      generatedAt: new Date().toISOString(),
      queue: {
        expected,
        waiting: count(QueueEntryStatus.WAITING),
        inService: count(QueueEntryStatus.IN_SERVICE),
        completed: count(QueueEntryStatus.COMPLETED),
      },
      unpaidInvoicesToday: unpaidInvoices,
      slotHorizon: {
        lastSlotDate,
        daysAhead: slotDaysAhead,
        low: slotDaysAhead < 7,
      },
      notifications: await computeNotificationHealth(this.prisma),
      upcomingAppointments,
    };
  }
}
