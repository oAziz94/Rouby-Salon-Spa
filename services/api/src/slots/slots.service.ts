import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingSlotStatus, Prisma } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { buildListMeta } from '../catalog/catalog.utils';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateSlotDto } from './dto/create-slot.dto';
import type { DashboardSlotListQueryDto } from './dto/dashboard-slot-list-query.dto';
import type { PatchSlotCapacityDto } from './dto/patch-slot-capacity.dto';
import type { PatchSlotOnlineBookableDto } from './dto/patch-slot-online-bookable.dto';
import type { PatchSlotStatusDto } from './dto/patch-slot-status.dto';
import type { PatchSlotDto } from './dto/patch-slot.dto';
import {
  isSlotStartStrictlyInFutureCairo,
  toDateOnlyUtc,
  toTimeOnlyUtc,
} from '../common/cairo-slot-time';

@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertBranchScope(user: DashboardJwtUser, branchId: string): void {
    if (
      user.permissions.includes('branches.manage') ||
      user.branchId === null
    ) {
      return;
    }
    if (user.branchId !== branchId) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

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

  private mapSlot(row: {
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
  }) {
    return {
      id: row.id,
      branchId: row.branchId,
      date: toDateOnlyUtc(row.date),
      startTime: toTimeOnlyUtc(row.startTime),
      endTime: toTimeOnlyUtc(row.endTime),
      capacity: row.capacity,
      bookedCount: row.bookedCount,
      status: row.status,
      isOnlineBookable: row.isOnlineBookable,
      notes: row.notes,
      createdByUserId: row.createdByUserId,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
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
    this.assertBranchScope(user, branchId);
    await this.getBranchOrFail(branchId);

    const where: Prisma.BookingSlotWhereInput = {
      branchId,
      deletedAt: null,
    };
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

    return {
      data: rows.map((row) => this.mapSlot(row)),
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
    this.assertBranchScope(user, branchId);
    await this.getBranchOrFail(branchId);

    const row = await this.prisma.bookingSlot.findFirst({
      where: {
        id: slotId,
        branchId,
        deletedAt: null,
      },
    });
    if (!row) {
      throw new NotFoundException('Slot not found');
    }
    return this.mapSlot(row);
  }

  async createDashboardSlot(
    user: DashboardJwtUser,
    branchId: string,
    dto: CreateSlotDto,
  ) {
    this.assertBranchScope(user, branchId);
    await this.getBranchOrFail(branchId);
    this.assertTimeRange(dto.startTime, dto.endTime);

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

    return this.mapSlot(row);
  }

  async patchDashboardSlot(
    user: DashboardJwtUser,
    branchId: string,
    slotId: string,
    dto: PatchSlotDto,
  ) {
    this.assertBranchScope(user, branchId);
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

    return this.mapSlot(row);
  }

  async patchDashboardSlotCapacity(
    user: DashboardJwtUser,
    branchId: string,
    slotId: string,
    dto: PatchSlotCapacityDto,
  ) {
    this.assertBranchScope(user, branchId);
    await this.getBranchOrFail(branchId);
    const slot = await this.getDashboardSlotOrFail(slotId);
    if (slot.branchId !== branchId) {
      throw new NotFoundException('Slot not found');
    }
    const before = await this.prisma.bookingSlot.findUnique({
      where: { id: slotId },
      select: { capacity: true },
    });
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
    return this.mapSlot(row);
  }

  async patchDashboardSlotOnlineBookable(
    user: DashboardJwtUser,
    branchId: string,
    slotId: string,
    dto: PatchSlotOnlineBookableDto,
  ) {
    this.assertBranchScope(user, branchId);
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
    return this.mapSlot(row);
  }

  async patchDashboardSlotStatus(
    user: DashboardJwtUser,
    branchId: string,
    slotId: string,
    dto: PatchSlotStatusDto,
  ) {
    this.assertBranchScope(user, branchId);
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
    return this.mapSlot(row);
  }

  async softDeleteDashboardSlot(
    user: DashboardJwtUser,
    branchId: string,
    slotId: string,
  ) {
    this.assertBranchScope(user, branchId);
    await this.getBranchOrFail(branchId);
    const slot = await this.getDashboardSlotOrFail(slotId);
    if (slot.branchId !== branchId) {
      throw new NotFoundException('Slot not found');
    }
    const row = await this.prisma.bookingSlot.update({
      where: { id: slotId },
      data: { deletedAt: new Date() },
    });
    return this.mapSlot(row);
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
        status: BookingSlotStatus.AVAILABLE,
        isOnlineBookable: true,
        branch: { isActive: true },
        capacity: { gt: 0 },
      },
      orderBy: [{ startTime: 'asc' }],
    });

    const data = rows
      .filter((slot) => slot.bookedCount < slot.capacity)
      .filter((slot) => isSlotStartStrictlyInFutureCairo(slot))
      .map((slot) => this.mapSlot(slot));

    return { data };
  }

  /**
   * Validates a slot for **public website booking submission** (same predicate as `listPublicSlots`).
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

    if (slot.status !== BookingSlotStatus.AVAILABLE || !slot.isOnlineBookable) {
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
}
