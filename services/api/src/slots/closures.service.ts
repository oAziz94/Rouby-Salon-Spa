import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingSlotStatus, BookingStatus, Prisma } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { AuditService } from '../audit/audit.service';
import { assertDashboardBranchAccess } from '../billing/dashboard-branch-scope';
import {
  cairoTodayYmd,
  toDateOnlyUtc,
  toTimeOnlyUtc,
} from '../common/cairo-slot-time';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateClosureDto } from './dto/create-closure.dto';
import { slotHorizonDays } from './slot-generation.utils';
import { SlotsService } from './slots.service';

const MAX_CLOSURE_DAYS = 60;

/** Appointments that still expect the client to come (need a call / reschedule when the day closes). */
const AFFECTED_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.RESCHEDULED,
];

function parseYmd(value: string): Date {
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`"${value}" is not a valid date`);
  }
  return d;
}

/**
 * Holidays & closures (spec v2 §5): a date range on which a branch takes no appointments.
 * Creating one closes the existing slots in the range (hidden from the website, not offered
 * for new bookings) and makes slot generation skip those days. Removing it reopens exactly
 * the slots it closed and refills the days.
 */
@Injectable()
export class ClosuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly slots: SlotsService,
  ) {}

  private async affectedBookings(
    branchId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const rows = await this.prisma.booking.findMany({
      where: {
        branchId,
        status: { in: AFFECTED_BOOKING_STATUSES },
        slot: {
          is: {
            isWalkInBucket: false,
            date: { gte: startDate, lte: endDate },
          },
        },
      },
      select: {
        id: true,
        status: true,
        client: { select: { id: true, fullName: true, phone: true } },
        slot: { select: { date: true, startTime: true, endTime: true } },
      },
      orderBy: [{ slot: { date: 'asc' } }, { slot: { startTime: 'asc' } }],
      take: 200,
    });
    return rows.map((b) => ({
      id: b.id,
      status: b.status,
      client: b.client,
      slot: {
        date: toDateOnlyUtc(b.slot.date),
        startTime: toTimeOnlyUtc(b.slot.startTime),
        endTime: toTimeOnlyUtc(b.slot.endTime),
      },
    }));
  }

  private async mapClosure(row: {
    id: string;
    branchId: string;
    startDate: Date;
    endDate: Date;
    reason: string;
    createdByUserId: string | null;
    createdAt: Date;
  }) {
    const [affectedBookings, closedSlotCount] = await Promise.all([
      this.affectedBookings(row.branchId, row.startDate, row.endDate),
      this.prisma.bookingSlot.count({
        where: { closedByClosureId: row.id, deletedAt: null },
      }),
    ]);
    const start = toDateOnlyUtc(row.startDate);
    const end = toDateOnlyUtc(row.endDate);
    const today = cairoTodayYmd();
    return {
      id: row.id,
      branchId: row.branchId,
      startDate: start,
      endDate: end,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
      state:
        end < today
          ? ('PAST' as const)
          : start <= today
            ? ('ACTIVE' as const)
            : ('UPCOMING' as const),
      closedSlotCount,
      affectedBookings,
    };
  }

  async list(user: DashboardJwtUser, branchId: string, includePast: boolean) {
    assertDashboardBranchAccess(user, branchId);
    const today = parseYmd(cairoTodayYmd());
    const rows = await this.prisma.branchClosure.findMany({
      where: {
        branchId,
        ...(includePast ? {} : { endDate: { gte: today } }),
      },
      orderBy: [{ startDate: includePast ? 'desc' : 'asc' }],
      take: 200,
    });
    return {
      data: await Promise.all(rows.map((r) => this.mapClosure(r))),
      horizon: await this.slots.getSlotHorizonStatus(
        branchId,
        slotHorizonDays(),
      ),
    };
  }

  /** What a closure would touch — shown before the user confirms. */
  async preview(
    user: DashboardJwtUser,
    branchId: string,
    dto: CreateClosureDto,
  ) {
    assertDashboardBranchAccess(user, branchId);
    const { startDate, endDate } = this.validateRange(dto);
    const [affectedBookings, openSlotCount] = await Promise.all([
      this.affectedBookings(branchId, startDate, endDate),
      this.prisma.bookingSlot.count({
        where: {
          branchId,
          deletedAt: null,
          isWalkInBucket: false,
          date: { gte: startDate, lte: endDate },
          status: { not: BookingSlotStatus.CLOSED },
        },
      }),
    ]);
    return { affectedBookings, openSlotCount };
  }

  private validateRange(dto: CreateClosureDto): {
    startDate: Date;
    endDate: Date;
  } {
    const startDate = parseYmd(dto.startDate);
    const endDate = parseYmd(dto.endDate);
    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('End date must be on or after start date');
    }
    if (dto.endDate < cairoTodayYmd()) {
      throw new BadRequestException('A closure cannot be entirely in the past');
    }
    const days =
      Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
    if (days > MAX_CLOSURE_DAYS) {
      throw new BadRequestException(
        `A closure can cover at most ${MAX_CLOSURE_DAYS} days`,
      );
    }
    return { startDate, endDate };
  }

  async create(
    user: DashboardJwtUser,
    branchId: string,
    dto: CreateClosureDto,
  ) {
    assertDashboardBranchAccess(user, branchId);
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    const { startDate, endDate } = this.validateRange(dto);

    const overlap = await this.prisma.branchClosure.findFirst({
      where: {
        branchId,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { reason: true, startDate: true, endDate: true },
    });
    if (overlap) {
      throw new ConflictException(
        `These dates overlap an existing closure ("${overlap.reason}", ${toDateOnlyUtc(overlap.startDate)} – ${toDateOnlyUtc(overlap.endDate)})`,
      );
    }

    const { row, closedSlots } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.branchClosure.create({
        data: {
          branchId,
          startDate,
          endDate,
          reason: dto.reason.trim(),
          createdByUserId: user.userId,
        },
      });
      const res = await tx.bookingSlot.updateMany({
        where: {
          branchId,
          deletedAt: null,
          isWalkInBucket: false,
          date: { gte: startDate, lte: endDate },
          status: {
            in: [
              BookingSlotStatus.AVAILABLE,
              BookingSlotStatus.PENDING,
              BookingSlotStatus.FILLED,
            ],
          },
        },
        data: {
          status: BookingSlotStatus.CLOSED,
          closedByClosureId: created.id,
        },
      });
      return { row: created, closedSlots: res.count };
    });

    const mapped = await this.mapClosure(row);
    await this.audit.log({
      userId: user.userId,
      action: 'slots.closure_created',
      module: 'slots',
      entityType: 'BranchClosure',
      entityId: row.id,
      branchId,
      severity: 'WARNING',
      newValue: {
        startDate: mapped.startDate,
        endDate: mapped.endDate,
        reason: row.reason,
        closedSlots,
        affectedBookings: mapped.affectedBookings.length,
      },
    });
    return mapped;
  }

  async remove(user: DashboardJwtUser, branchId: string, closureId: string) {
    assertDashboardBranchAccess(user, branchId);
    const row = await this.prisma.branchClosure.findFirst({
      where: { id: closureId, branchId },
    });
    if (!row) {
      throw new NotFoundException('Closure not found');
    }

    const reopened = await this.prisma.$transaction(async (tx) => {
      const slots = await tx.bookingSlot.findMany({
        where: { closedByClosureId: row.id },
        select: { id: true },
      });
      const ids = slots.map((s) => s.id);
      if (ids.length > 0) {
        await tx.bookingSlot.updateMany({
          where: { id: { in: ids }, status: BookingSlotStatus.CLOSED },
          data: {
            status: BookingSlotStatus.AVAILABLE,
            closedByClosureId: null,
          },
        });
        // Slots that were full before the closure go back to FILLED.
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE booking_slots
            SET status = 'FILLED'
            WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
              AND status = 'AVAILABLE'
              AND capacity > 0
              AND booked_count >= capacity
          `,
        );
      }
      await tx.branchClosure.delete({ where: { id: row.id } });
      return ids.length;
    });

    // Days that were skipped by generation while closed get their slots now.
    const refill = await this.slots.ensureSlotHorizonForBranch(
      branchId,
      slotHorizonDays(),
      user.userId,
    );

    await this.audit.log({
      userId: user.userId,
      action: 'slots.closure_removed',
      module: 'slots',
      entityType: 'BranchClosure',
      entityId: row.id,
      branchId,
      severity: 'WARNING',
      oldValue: {
        startDate: toDateOnlyUtc(row.startDate),
        endDate: toDateOnlyUtc(row.endDate),
        reason: row.reason,
      },
      newValue: { reopenedSlots: reopened, createdSlots: refill.createdCount },
    });
    return {
      id: row.id,
      reopenedSlots: reopened,
      createdSlots: refill.createdCount,
    };
  }
}
