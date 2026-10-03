import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingSlotStatus, BookingStatus, Prisma } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { assertDashboardBranchAccess } from '../billing/dashboard-branch-scope';
import { buildListMeta } from '../catalog/catalog.utils';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateSlotDto } from './dto/create-slot.dto';
import type { DashboardSlotListQueryDto } from './dto/dashboard-slot-list-query.dto';
import type { PatchSlotCapacityDto } from './dto/patch-slot-capacity.dto';
import type { PatchSlotOnlineBookableDto } from './dto/patch-slot-online-bookable.dto';
import type { PatchSlotStatusDto } from './dto/patch-slot-status.dto';
import type { PatchSlotDto } from './dto/patch-slot.dto';
import type { GenerateWeekSlotsDto } from './dto/generate-week-slots.dto';
import {
  addUtcDaysToDateString,
  assertValidSlotGeneration,
  mergeSlotGeneration,
  minutesToTimeString,
  parseStoredSlotGeneration,
  pickOverridesFromSlotDto,
  slotDuplicateKey,
  slotOverlapsAnyBreak,
  timeToMinutes,
  type SlotGenerationDefaultsV1,
} from './slot-generation.utils';
import {
  cairoTodayYmd,
  cairoWeekdayIndexFromDateString,
  isSlotStartStrictlyInFutureCairo,
  toDateOnlyUtc,
  toTimeOnlyUtc,
} from '../common/cairo-slot-time';
import { SYSTEM_SETTINGS_ID } from '../settings/settings.constants';

/** Sentinel window for internal walk-in capacity buckets (UTC time-of-day only). */
const WALK_IN_BUCKET_START = '23:30:00';
const WALK_IN_BUCKET_END = '23:45:00';

/** Bookings excluded from dashboard “live” occupancy on a slot (historical / voided). */
const SLOT_LIVE_BOOKING_COUNT_EXCLUDED: BookingStatus[] = [
  BookingStatus.CANCELLED,
  BookingStatus.REJECTED,
  BookingStatus.COMPLETED,
  BookingStatus.NO_SHOW,
];

@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertTimeRange(startTime: string, endTime: string): void {
    const startSeconds = this.timeToSeconds(startTime);
    const endSeconds = this.timeToSeconds(endTime);
    if (startSeconds >= endSeconds) {
      throw new BadRequestException('startTime must be earlier than endTime');
    }
  }

  private timeToSeconds(value: string): number {
    const [h, m, s = '0'] = value.split(':');
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  }

  private normalizeTime(value: string): string {
    return value.length === 5 ? `${value}:00` : value;
  }

  private parseDateOnly(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private parseTimeOnly(value: string): Date {
    return new Date(`1970-01-01T${this.normalizeTime(value)}.000Z`);
  }

  private mapSlot(
    row: {
      id: string;
      branchId: string;
      date: Date;
      startTime: Date;
      endTime: Date;
      capacity: number;
      bookedCount: number;
      status: BookingSlotStatus;
      isOnlineBookable: boolean;
      notes: string | null;
      createdByUserId: string | null;
      deletedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
    liveBookingsCount?: number,
  ) {
    return {
      id: row.id,
      branchId: row.branchId,
      date: toDateOnlyUtc(row.date),
      startTime: toTimeOnlyUtc(row.startTime),
      endTime: toTimeOnlyUtc(row.endTime),
      capacity: row.capacity,
      bookedCount: row.bookedCount,
      ...(liveBookingsCount !== undefined ? { liveBookingsCount } : {}),
      status: row.status,
      isOnlineBookable: row.isOnlineBookable,
      notes: row.notes,
      createdByUserId: row.createdByUserId,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async liveBookingsCountBySlotIds(
    slotIds: string[],
  ): Promise<Map<string, number>> {
    if (slotIds.length === 0) {
      return new Map();
    }
    const grouped = await this.prisma.booking.groupBy({
      by: ['slotId'],
      where: {
        slotId: { in: slotIds },
        status: { notIn: SLOT_LIVE_BOOKING_COUNT_EXCLUDED },
      },
      _count: { _all: true },
    });
    const map = new Map<string, number>();
    for (const row of grouped) {
      map.set(row.slotId, row._count._all);
    }
    return map;
  }

  /**
   * Sets slot to FILLED when bookedCount reaches capacity, and back to AVAILABLE
   * when below capacity. BLOCKED / CLOSED are never changed here.
   */
  async syncBookingSlotFilledFromCapacityTx(
    tx: Prisma.TransactionClient,
    slotId: string,
  ): Promise<void> {
    const slot = await tx.bookingSlot.findUnique({
      where: { id: slotId },
      select: {
        bookedCount: true,
        capacity: true,
        status: true,
        deletedAt: true,
      },
    });
    if (!slot || slot.deletedAt !== null) {
      return;
    }
    if (
      slot.status === BookingSlotStatus.BLOCKED ||
      slot.status === BookingSlotStatus.CLOSED
    ) {
      return;
    }
    if (slot.capacity <= 0) {
      return;
    }
    if (slot.bookedCount >= slot.capacity) {
      if (
        slot.status === BookingSlotStatus.AVAILABLE ||
        slot.status === BookingSlotStatus.PENDING
      ) {
        await tx.bookingSlot.update({
          where: { id: slotId },
          data: { status: BookingSlotStatus.FILLED },
        });
      }
    } else if (slot.status === BookingSlotStatus.FILLED) {
      await tx.bookingSlot.update({
        where: { id: slotId },
        data: { status: BookingSlotStatus.AVAILABLE },
      });
    }
  }

  private async getBranchOrFail(
    branchId: string,
  ): Promise<{ id: string; isActive: boolean }> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, isActive: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branch;
  }

  private async getDashboardSlotOrFail(slotId: string): Promise<{
    id: string;
    branchId: string;
    deletedAt: Date | null;
  }> {
    const slot = await this.prisma.bookingSlot.findUnique({
      where: { id: slotId },
      select: { id: true, branchId: true, deletedAt: true },
    });
    if (!slot || slot.deletedAt !== null) {
      throw new NotFoundException('Slot not found');
    }
    return slot;
  }

  async listDashboardSlots(
    user: DashboardJwtUser,
    branchId: string,
    query: DashboardSlotListQueryDto,
  ) {
    assertDashboardBranchAccess(user, branchId);
    await this.getBranchOrFail(branchId);

    const where = {
      branchId,
      deletedAt: null,
      isWalkInBucket: false,
    } as Prisma.BookingSlotWhereInput;
    if (query.status) {
      where.status = query.status;
    }
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) {
        where.date.gte = this.parseDateOnly(query.dateFrom);
      }
      if (query.dateTo) {
        where.date.lte = this.parseDateOnly(query.dateTo);
      }
    }

    const skip = (query.page - 1) * query.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.prisma.bookingSlot.count({ where }),
      this.prisma.bookingSlot.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
    ]);

    const liveBySlot = await this.liveBookingsCountBySlotIds(
      rows.map((r) => r.id),
    );

    return {
      data: rows.map((row) => this.mapSlot(row, liveBySlot.get(row.id) ?? 0)),
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async getDashboardSlot(
    user: DashboardJwtUser,
    branchId: string,
    slotId: string,
  ) {
    assertDashboardBranchAccess(user, branchId);
    await this.getBranchOrFail(branchId);

    const row = await this.prisma.bookingSlot.findFirst({
      where: {
        id: slotId,
        branchId,
        deletedAt: null,
        isWalkInBucket: false,
      },
    });
    if (!row) {
      throw new NotFoundException('Slot not found');
    }
    const liveBySlot = await this.liveBookingsCountBySlotIds([row.id]);
    return this.mapSlot(row, liveBySlot.get(row.id) ?? 0);
  }

  async createDashboardSlot(
    user: DashboardJwtUser,
    branchId: string,
    dto: CreateSlotDto,
  ) {
    assertDashboardBranchAccess(user, branchId);
    await this.getBranchOrFail(branchId);
    this.assertTimeRange(dto.startTime, dto.endTime);

    const duplicate = await this.prisma.bookingSlot.findFirst({
      where: {
        branchId,
        date: this.parseDateOnly(dto.date),
        startTime: this.parseTimeOnly(dto.startTime),
        endTime: this.parseTimeOnly(dto.endTime),
        deletedAt: null,
        isWalkInBucket: false,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          message:
            'A slot with the same date and start and end time already exists for this branch. Edit that slot instead.',
          error: 'Conflict',
          code: 'SLOT_DUPLICATE',
        },
        HttpStatus.CONFLICT,
      );
    }

    const row = await this.prisma.bookingSlot.create({
      data: {
        branchId,
        date: this.parseDateOnly(dto.date),
        startTime: this.parseTimeOnly(dto.startTime),
        endTime: this.parseTimeOnly(dto.endTime),
        capacity: dto.capacity,
        status: dto.status ?? BookingSlotStatus.AVAILABLE,
        isOnlineBookable: dto.isOnlineBookable ?? true,
        notes: dto.notes ?? null,
        createdByUserId: user.userId,
      },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'slot.created',
      module: 'slots',
      entityId: row.id,
      newValue: {
        branchId: row.branchId,
        date: row.date.toISOString(),
        startTime: row.startTime.toISOString(),
        endTime: row.endTime.toISOString(),
        capacity: row.capacity,
        status: row.status,
      },
    });

    return this.mapSlot(row, 0);
  }

  async patchDashboardSlot(
    user: DashboardJwtUser,
    branchId: string,
    slotId: string,
    dto: PatchSlotDto,
  ) {
    assertDashboardBranchAccess(user, branchId);
    await this.getBranchOrFail(branchId);

    const existing = await this.prisma.bookingSlot.findUnique({
      where: { id: slotId },
    });
    if (!existing || existing.deletedAt !== null) {
      throw new NotFoundException('Slot not found');
    }
    if (existing.branchId !== branchId) {
      throw new NotFoundException('Slot not found');
    }

    const nextStart = dto.startTime ?? toTimeOnlyUtc(existing.startTime);
    const nextEnd = dto.endTime ?? toTimeOnlyUtc(existing.endTime);
    this.assertTimeRange(nextStart, nextEnd);

    const row = await this.prisma.bookingSlot.update({
      where: { id: slotId },
      data: {
        ...(dto.date !== undefined && { date: this.parseDateOnly(dto.date) }),
        ...(dto.startTime !== undefined && {
          startTime: this.parseTimeOnly(dto.startTime),
        }),
        ...(dto.endTime !== undefined && {
          endTime: this.parseTimeOnly(dto.endTime),
        }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'slot.updated',
      module: 'slots',
      entityId: row.id,
      oldValue: {
        date: existing.date.toISOString(),
        startTime: existing.startTime.toISOString(),
        endTime: existing.endTime.toISOString(),
        notes: existing.notes,
      },
      newValue: {
        date: row.date.toISOString(),
        startTime: row.startTime.toISOString(),
        endTime: row.endTime.toISOString(),
        notes: row.notes,
      },
    });

    const liveBySlot = await this.liveBookingsCountBySlotIds([row.id]);
    return this.mapSlot(row, liveBySlot.get(row.id) ?? 0);
  }

  async patchDashboardSlotCapacity(
    user: DashboardJwtUser,
    branchId: string,
    slotId: string,
    dto: PatchSlotCapacityDto,
  ) {
    assertDashboardBranchAccess(user, branchId);
    await this.getBranchOrFail(branchId);
    const slot = await this.getDashboardSlotOrFail(slotId);
    if (slot.branchId !== branchId) {
      throw new NotFoundException('Slot not found');
    }
    const before = await this.prisma.bookingSlot.findUnique({
      where: { id: slotId },
      select: { capacity: true },
    });
    const live = (await this.liveBookingsCountBySlotIds([slotId])).get(slotId);
    if (live !== undefined && dto.capacity < live) {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          message: `This slot has ${live} active booking(s), so the capacity cannot be lower than ${live}. Cancel or move some bookings first.`,
          error: 'Conflict',
          code: 'SLOT_CAPACITY_BELOW_BOOKINGS',
        },
        HttpStatus.CONFLICT,
      );
    }
    const row = await this.prisma.bookingSlot.update({
      where: { id: slotId },
      data: { capacity: dto.capacity },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'slot.capacity_changed',
      module: 'slots',
      entityId: row.id,
      oldValue: { capacity: before?.capacity ?? null },
      newValue: { capacity: row.capacity },
    });
    await this.prisma.$transaction(async (tx) => {
      await this.syncBookingSlotFilledFromCapacityTx(tx, slotId);
    });
    const finalRow =
      (await this.prisma.bookingSlot.findUnique({ where: { id: slotId } })) ??
      row;
    const liveBySlot = await this.liveBookingsCountBySlotIds([finalRow.id]);
    return this.mapSlot(finalRow, liveBySlot.get(finalRow.id) ?? 0);
  }

  async patchDashboardSlotOnlineBookable(
    user: DashboardJwtUser,
    branchId: string,
    slotId: string,
    dto: PatchSlotOnlineBookableDto,
  ) {
    assertDashboardBranchAccess(user, branchId);
    await this.getBranchOrFail(branchId);
    const slot = await this.getDashboardSlotOrFail(slotId);
    if (slot.branchId !== branchId) {
      throw new NotFoundException('Slot not found');
    }
    const before = await this.prisma.bookingSlot.findUnique({
      where: { id: slotId },
      select: { isOnlineBookable: true },
    });
    const row = await this.prisma.bookingSlot.update({
      where: { id: slotId },
      data: { isOnlineBookable: dto.isOnlineBookable },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'slot.updated',
      module: 'slots',
      entityId: row.id,
      oldValue: { isOnlineBookable: before?.isOnlineBookable ?? null },
      newValue: { isOnlineBookable: row.isOnlineBookable },
    });
    const liveBySlot = await this.liveBookingsCountBySlotIds([row.id]);
    return this.mapSlot(row, liveBySlot.get(row.id) ?? 0);
  }

  async patchDashboardSlotStatus(
    user: DashboardJwtUser,
    branchId: string,
    slotId: string,
    dto: PatchSlotStatusDto,
  ) {
    assertDashboardBranchAccess(user, branchId);
    await this.getBranchOrFail(branchId);
    const slot = await this.getDashboardSlotOrFail(slotId);
    if (slot.branchId !== branchId) {
      throw new NotFoundException('Slot not found');
    }
    const before = await this.prisma.bookingSlot.findUnique({
      where: { id: slotId },
      select: { status: true },
    });
    const row = await this.prisma.bookingSlot.update({
      where: { id: slotId },
      data: { status: dto.status },
    });
    const action =
      dto.status === BookingSlotStatus.FILLED
        ? 'slot.marked_filled'
        : 'slot.updated';
    await this.audit.log({
      userId: user.userId,
      action,
      module: 'slots',
      entityId: row.id,
      oldValue: { status: before?.status ?? null },
      newValue: { status: row.status },
    });
    const liveBySlot = await this.liveBookingsCountBySlotIds([row.id]);
    return this.mapSlot(row, liveBySlot.get(row.id) ?? 0);
  }

  async softDeleteDashboardSlot(
    user: DashboardJwtUser,
    branchId: string,
    slotId: string,
  ) {
    assertDashboardBranchAccess(user, branchId);
    await this.getBranchOrFail(branchId);
    const slot = await this.getDashboardSlotOrFail(slotId);
    if (slot.branchId !== branchId) {
      throw new NotFoundException('Slot not found');
    }
    const live = (await this.liveBookingsCountBySlotIds([slotId])).get(slotId);
    if (live !== undefined && live > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          message: `This slot has ${live} active booking(s) and cannot be deleted. Cancel or move them first.`,
          error: 'Conflict',
          code: 'SLOT_HAS_BOOKINGS',
        },
        HttpStatus.CONFLICT,
      );
    }
    const row = await this.prisma.bookingSlot.update({
      where: { id: slotId },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'slot.deleted',
      module: 'slots',
      entityId: row.id,
      branchId: row.branchId,
      oldValue: {
        date: row.date.toISOString(),
        startTime: row.startTime.toISOString(),
        endTime: row.endTime.toISOString(),
        capacity: row.capacity,
        status: row.status,
      },
    });
    const liveBySlot = await this.liveBookingsCountBySlotIds([row.id]);
    return this.mapSlot(row, liveBySlot.get(row.id) ?? 0);
  }

  /** Branch defaults win over system defaults; `configured` is false when neither was ever saved. */
  private async resolveSlotGenerationForBranch(branchId: string): Promise<{
    effective: SlotGenerationDefaultsV1;
    configured: boolean;
  }> {
    const [branch, settingsRow] = await Promise.all([
      this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, slotGenerationDefaults: true },
      }),
      this.prisma.systemSettings.findUnique({
        where: { id: SYSTEM_SETTINGS_ID },
        select: { slotGenerationDefaults: true },
      }),
    ]);
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    const effective =
      branch.slotGenerationDefaults != null
        ? parseStoredSlotGeneration(branch.slotGenerationDefaults)
        : parseStoredSlotGeneration(settingsRow?.slotGenerationDefaults);
    return {
      effective,
      configured:
        branch.slotGenerationDefaults != null ||
        settingsRow?.slotGenerationDefaults != null,
    };
  }

  /**
   * Shared generator. Idempotent: an existing slot with the same date/start/end is never duplicated.
   * - Days inside a Holidays & Closures entry are skipped.
   * - `respectDeleted`: slots an admin removed on purpose are not recreated (rolling/nightly runs).
   * - `alignDefaults`: untouched AVAILABLE slots are updated to the current capacity / online flag.
   */
  private async generateSlotsCore(params: {
    branchId: string;
    dateStart: string;
    days: number;
    effective: SlotGenerationDefaultsV1;
    createdByUserId: string | null;
    respectDeleted: boolean;
    alignDefaults: boolean;
  }): Promise<{
    createdCount: number;
    skippedCount: number;
    alignedDefaultsCount: number;
    closedDaysSkipped: number;
    dateFrom: string;
    dateTo: string;
  }> {
    const { branchId, dateStart, days, effective } = params;
    const dateEnd = addUtcDaysToDateString(dateStart, days - 1);
    const rangeStart = this.parseDateOnly(dateStart);
    const rangeEnd = this.parseDateOnly(dateEnd);

    const [existingRows, closures] = await Promise.all([
      this.prisma.bookingSlot.findMany({
        where: {
          branchId,
          isWalkInBucket: false,
          ...(params.respectDeleted ? {} : { deletedAt: null }),
          date: { gte: rangeStart, lte: rangeEnd },
        },
        select: {
          id: true,
          date: true,
          startTime: true,
          endTime: true,
          capacity: true,
          bookedCount: true,
          status: true,
          isOnlineBookable: true,
          deletedAt: true,
        },
      }),
      this.prisma.branchClosure.findMany({
        where: {
          branchId,
          startDate: { lte: rangeEnd },
          endDate: { gte: rangeStart },
        },
        select: { startDate: true, endDate: true },
      }),
    ]);

    const closedDates = new Set<string>();
    for (const c of closures) {
      let cursor = toDateOnlyUtc(c.startDate);
      const last = toDateOnlyUtc(c.endDate);
      for (let guard = 0; cursor <= last && guard < 400; guard += 1) {
        closedDates.add(cursor);
        cursor = addUtcDaysToDateString(cursor, 1);
      }
    }

    const existingByKey = new Map<string, (typeof existingRows)[number]>();
    for (const row of existingRows) {
      const key = slotDuplicateKey(row);
      const prev = existingByKey.get(key);
      // Prefer the live row when a deleted twin exists for the same window.
      if (!prev || (prev.deletedAt !== null && row.deletedAt === null)) {
        existingByKey.set(key, row);
      }
    }
    const localKeys = new Set<string>();
    const slotIdsToAlignDefaults = new Set<string>();

    const breakRanges = effective.breakPeriods.map((b) => ({
      start: timeToMinutes(b.startTime),
      end: timeToMinutes(b.endTime),
    }));
    const startM = timeToMinutes(effective.startTime);
    const endM = timeToMinutes(effective.endTime);
    const dur = effective.slotDurationMinutes;

    const createRows: Prisma.BookingSlotCreateManyInput[] = [];
    let skippedCount = 0;
    let closedDaysSkipped = 0;

    for (let day = 0; day < days; day += 1) {
      const dateStr = addUtcDaysToDateString(dateStart, day);
      const cairoDow = cairoWeekdayIndexFromDateString(dateStr);
      if (!effective.workingDays.includes(cairoDow)) {
        continue;
      }
      if (closedDates.has(dateStr)) {
        closedDaysSkipped += 1;
        continue;
      }
      const dateObj = this.parseDateOnly(dateStr);
      for (let cursor = startM; cursor + dur <= endM; cursor += dur) {
        const slotEndM = cursor + dur;
        if (slotOverlapsAnyBreak(cursor, slotEndM, breakRanges)) {
          continue;
        }
        const startStr = minutesToTimeString(cursor);
        const endStr = minutesToTimeString(slotEndM);
        const key = slotDuplicateKey({
          date: dateObj,
          startTime: this.parseTimeOnly(startStr),
          endTime: this.parseTimeOnly(endStr),
        });
        const hit = existingByKey.get(key);
        if (hit || localKeys.has(key)) {
          skippedCount += 1;
          if (
            params.alignDefaults &&
            hit &&
            hit.deletedAt === null &&
            hit.bookedCount === 0 &&
            hit.status === BookingSlotStatus.AVAILABLE &&
            (hit.capacity !== effective.defaultCapacity ||
              hit.isOnlineBookable !== effective.defaultOnlineBookable)
          ) {
            slotIdsToAlignDefaults.add(hit.id);
          }
          continue;
        }
        localKeys.add(key);
        createRows.push({
          branchId,
          date: dateObj,
          startTime: this.parseTimeOnly(startStr),
          endTime: this.parseTimeOnly(endStr),
          capacity: effective.defaultCapacity,
          bookedCount: 0,
          status: BookingSlotStatus.AVAILABLE,
          isOnlineBookable: effective.defaultOnlineBookable,
          notes: null,
          createdByUserId: params.createdByUserId,
        });
      }
    }

    let createdCount = 0;
    if (createRows.length > 0) {
      const res = await this.prisma.bookingSlot.createMany({
        data: createRows,
      });
      createdCount = res.count;
    }

    let alignedDefaultsCount = 0;
    if (slotIdsToAlignDefaults.size > 0) {
      const alignRes = await this.prisma.bookingSlot.updateMany({
        where: {
          id: { in: [...slotIdsToAlignDefaults] },
          branchId,
          deletedAt: null,
          bookedCount: 0,
          status: BookingSlotStatus.AVAILABLE,
        },
        data: {
          capacity: effective.defaultCapacity,
          isOnlineBookable: effective.defaultOnlineBookable,
        },
      });
      alignedDefaultsCount = alignRes.count;
    }

    return {
      createdCount,
      skippedCount,
      alignedDefaultsCount,
      closedDaysSkipped,
      dateFrom: dateStart,
      dateTo: dateEnd,
    };
  }

  async generateWeekSlots(
    user: DashboardJwtUser,
    branchId: string,
    dto: GenerateWeekSlotsDto,
  ) {
    assertDashboardBranchAccess(user, branchId);

    const { effective: stored } =
      await this.resolveSlotGenerationForBranch(branchId);
    const effective = mergeSlotGeneration(
      stored,
      pickOverridesFromSlotDto(dto),
    );
    assertValidSlotGeneration(effective);

    const result = await this.generateSlotsCore({
      branchId,
      dateStart: dto.weekStartDate,
      days: 7,
      effective,
      createdByUserId: user.userId,
      respectDeleted: false,
      alignDefaults: true,
    });

    await this.audit.log({
      userId: user.userId,
      action: 'slots.week_generated',
      module: 'slots',
      entityId: branchId,
      newValue: result,
    });

    return result;
  }

  /**
   * Rolling horizon (spec v2 §5): make sure slots exist from today through `horizonDays` ahead.
   * Used by the nightly job, on API start, and by the "Fill now" button. Never touches existing
   * slots and never recreates a slot that was deleted on purpose.
   */
  async ensureSlotHorizonForBranch(
    branchId: string,
    horizonDays: number,
    actorUserId: string | null,
  ) {
    const { effective, configured } =
      await this.resolveSlotGenerationForBranch(branchId);
    if (!configured) {
      return {
        branchId,
        configured: false as const,
        createdCount: 0,
        skippedCount: 0,
        closedDaysSkipped: 0,
        dateFrom: cairoTodayYmd(),
        dateTo: cairoTodayYmd(),
      };
    }
    assertValidSlotGeneration(effective);
    const result = await this.generateSlotsCore({
      branchId,
      dateStart: cairoTodayYmd(),
      days: horizonDays + 1,
      effective,
      createdByUserId: actorUserId,
      respectDeleted: true,
      alignDefaults: false,
    });
    if (result.createdCount > 0) {
      await this.audit.log({
        userId: actorUserId,
        action: 'slots.horizon_extended',
        module: 'slots',
        entityId: branchId,
        branchId,
        newValue: {
          createdCount: result.createdCount,
          closedDaysSkipped: result.closedDaysSkipped,
          dateFrom: result.dateFrom,
          dateTo: result.dateTo,
          trigger: actorUserId ? 'manual' : 'automatic',
        },
      });
    }
    return {
      branchId,
      configured: true as const,
      createdCount: result.createdCount,
      skippedCount: result.skippedCount,
      closedDaysSkipped: result.closedDaysSkipped,
      dateFrom: result.dateFrom,
      dateTo: result.dateTo,
    };
  }

  async ensureSlotHorizonAllBranches(horizonDays: number) {
    const branches = await this.prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const results: Awaited<
      ReturnType<SlotsService['ensureSlotHorizonForBranch']>
    >[] = [];
    for (const b of branches) {
      results.push(
        await this.ensureSlotHorizonForBranch(b.id, horizonDays, null),
      );
    }
    return results;
  }

  /** How far ahead bookable slots exist for a branch (drives the "running out of slots" warning). */
  async getSlotHorizonStatus(branchId: string, horizonDays: number) {
    const todayYmd = cairoTodayYmd();
    const [{ configured }, last] = await Promise.all([
      this.resolveSlotGenerationForBranch(branchId),
      this.prisma.bookingSlot.findFirst({
        where: {
          branchId,
          deletedAt: null,
          isWalkInBucket: false,
          date: { gte: this.parseDateOnly(todayYmd) },
        },
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
    ]);
    const lastSlotDate = last ? toDateOnlyUtc(last.date) : null;
    const daysAhead = lastSlotDate
      ? Math.round(
          (this.parseDateOnly(lastSlotDate).getTime() -
            this.parseDateOnly(todayYmd).getTime()) /
            86_400_000,
        )
      : -1;
    return {
      branchId,
      todayYmd,
      lastSlotDate,
      daysAhead,
      horizonDays,
      autoGenerationConfigured: configured,
      low: daysAhead < 7,
    };
  }

  async dashboardSlotHorizonStatus(
    user: DashboardJwtUser,
    branchId: string,
    horizonDays: number,
  ) {
    assertDashboardBranchAccess(user, branchId);
    return this.getSlotHorizonStatus(branchId, horizonDays);
  }

  async dashboardEnsureSlotHorizon(
    user: DashboardJwtUser,
    branchId: string,
    horizonDays: number,
  ) {
    assertDashboardBranchAccess(user, branchId);
    const result = await this.ensureSlotHorizonForBranch(
      branchId,
      horizonDays,
      user.userId,
    );
    if (!result.configured) {
      throw new BadRequestException(
        'Save the slot defaults (working days and hours) first — automatic slots need them.',
      );
    }
    return {
      ...result,
      status: await this.getSlotHorizonStatus(branchId, horizonDays),
    };
  }

  async listPublicSlots(branchId: string, date: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, isActive: true },
    });
    if (!branch || !branch.isActive) {
      return { data: [] };
    }

    const rows = await this.prisma.bookingSlot.findMany({
      where: {
        branchId,
        date: this.parseDateOnly(date),
        deletedAt: null,
        status: {
          in: [BookingSlotStatus.AVAILABLE, BookingSlotStatus.FILLED],
        },
        isOnlineBookable: true,
        isWalkInBucket: false,
        branch: { isActive: true },
        capacity: { gt: 0 },
      },
      orderBy: [{ startTime: 'asc' }],
    });

    const data = rows
      .filter((slot) => isSlotStartStrictlyInFutureCairo(slot))
      .map((slot) => this.mapSlot(slot));

    return { data };
  }

  /**
   * Validates a slot for **public website booking submission** (stricter than `listPublicSlots`,
   * which also returns full slots so the client can show them disabled).
   * Dashboard bookings may target offline / non-available slots via separate validation.
   */
  async assertSlotPubliclyBookable(
    branchId: string,
    slotId: string,
  ): Promise<{
    id: string;
    branchId: string;
    date: Date;
    startTime: Date;
    endTime: Date;
    capacity: number;
    bookedCount: number;
    status: BookingSlotStatus;
    isOnlineBookable: boolean;
    deletedAt: Date | null;
  }> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, isActive: true },
    });
    if (!branch?.isActive) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Branch is not available for booking',
          error: 'Bad Request',
          code: 'BRANCH_INACTIVE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const slot = await this.prisma.bookingSlot.findFirst({
      where: { id: slotId, branchId, deletedAt: null },
    });
    if (!slot) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Slot is not available for online booking',
          error: 'Bad Request',
          code: 'SLOT_NOT_ONLINE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!slot.isOnlineBookable) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Slot is not available for online booking',
          error: 'Bad Request',
          code: 'SLOT_NOT_ONLINE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if ((slot as { isWalkInBucket?: boolean }).isWalkInBucket) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Slot is not available for online booking',
          error: 'Bad Request',
          code: 'SLOT_NOT_ONLINE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (slot.status !== BookingSlotStatus.AVAILABLE) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Slot is not available for online booking',
          error: 'Bad Request',
          code: 'SLOT_NOT_ONLINE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (slot.capacity <= 0 || slot.bookedCount >= slot.capacity) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Selected slot is full',
          error: 'Bad Request',
          code: 'SLOT_FULL',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!isSlotStartStrictlyInFutureCairo(slot)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Slot is not available for online booking',
          error: 'Bad Request',
          code: 'SLOT_NOT_ONLINE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return slot;
  }

  /**
   * Public policy checks for a website submit (branch, slot flags, time window).
   * Capacity is enforced separately via {@link tryReserveOneSlotCapacityTx} to avoid races.
   */
  async assertWebsiteSubmitSlotPolicyTx(
    tx: Prisma.TransactionClient,
    branchId: string,
    slotId: string,
  ): Promise<void> {
    const branch = await tx.branch.findUnique({
      where: { id: branchId },
      select: { id: true, isActive: true },
    });
    if (!branch?.isActive) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Branch is not available for booking',
          error: 'Bad Request',
          code: 'BRANCH_INACTIVE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const slot = await tx.bookingSlot.findFirst({
      where: { id: slotId, branchId, deletedAt: null },
    });
    if (!slot) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Slot is not available for online booking',
          error: 'Bad Request',
          code: 'SLOT_NOT_ONLINE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!slot.isOnlineBookable) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Slot is not available for online booking',
          error: 'Bad Request',
          code: 'SLOT_NOT_ONLINE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if ((slot as { isWalkInBucket?: boolean }).isWalkInBucket) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Slot is not available for online booking',
          error: 'Bad Request',
          code: 'SLOT_NOT_ONLINE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (slot.status !== BookingSlotStatus.AVAILABLE) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Slot is not available for online booking',
          error: 'Bad Request',
          code: 'SLOT_NOT_ONLINE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (slot.capacity <= 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Selected slot is full',
          error: 'Bad Request',
          code: 'SLOT_FULL',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!isSlotStartStrictlyInFutureCairo(slot)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Slot is not available for online booking',
          error: 'Bad Request',
          code: 'SLOT_NOT_ONLINE',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Ensures a single high-capacity internal slot exists for walk-in queue bookings for a branch/day.
   * Safe under `Serializable` isolation: concurrent creates contend on a partial unique index and fall back to find.
   */
  async ensureWalkInBucketSlotTx(
    tx: Prisma.TransactionClient,
    params: { branchId: string; date: Date },
  ): Promise<{ id: string }> {
    const { branchId, date } = params;
    const existing = await tx.bookingSlot.findFirst({
      where: {
        branchId,
        date,
        isWalkInBucket: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      return existing;
    }
    try {
      return await tx.bookingSlot.create({
        data: {
          branchId,
          date,
          startTime: this.parseTimeOnly(WALK_IN_BUCKET_START),
          endTime: this.parseTimeOnly(WALK_IN_BUCKET_END),
          capacity: 1000,
          bookedCount: 0,
          status: BookingSlotStatus.AVAILABLE,
          isOnlineBookable: false,
          isWalkInBucket: true,
          notes: 'Internal walk-in capacity bucket',
          createdByUserId: null,
        },
        select: { id: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const again = await tx.bookingSlot.findFirst({
          where: {
            branchId,
            date,
            isWalkInBucket: true,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (again) {
          return again;
        }
      }
      throw err;
    }
  }

  /**
   * Atomically consumes one seat if `booked_count < capacity`.
   * @returns whether a row was updated
   */
  async tryReserveOneSlotCapacityTx(
    tx: Prisma.TransactionClient,
    slotId: string,
  ): Promise<boolean> {
    const updated = await tx.$executeRaw(
      Prisma.sql`
        UPDATE booking_slots
        SET booked_count = booked_count + 1
        WHERE id = ${slotId}::uuid
          AND deleted_at IS NULL
          AND booked_count < capacity
      `,
    );
    return updated > 0;
  }

  /**
   * Releases one reserved seat (never below zero).
   */
  async releaseOneSlotCapacityTx(
    tx: Prisma.TransactionClient,
    slotId: string,
  ): Promise<void> {
    await tx.$executeRaw(
      Prisma.sql`
        UPDATE booking_slots
        SET booked_count = GREATEST(0, booked_count - 1)
        WHERE id = ${slotId}::uuid
          AND deleted_at IS NULL
      `,
    );
  }
}
