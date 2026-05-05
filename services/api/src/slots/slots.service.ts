import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingSlotStatus, Prisma } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { buildListMeta } from '../catalog/catalog.utils';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSlotDto } from './dto/create-slot.dto';
import type { DashboardSlotListQueryDto } from './dto/dashboard-slot-list-query.dto';
import type { PatchSlotCapacityDto } from './dto/patch-slot-capacity.dto';
import type { PatchSlotOnlineBookableDto } from './dto/patch-slot-online-bookable.dto';
import type { PatchSlotStatusDto } from './dto/patch-slot-status.dto';
import type { PatchSlotDto } from './dto/patch-slot.dto';

const CAIRO_TIME_ZONE = 'Africa/Cairo';

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private toTimeOnly(value: Date): string {
    return value.toISOString().slice(11, 19);
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
      date: this.toDateOnly(row.date),
      startTime: this.toTimeOnly(row.startTime),
      endTime: this.toTimeOnly(row.endTime),
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

  private getCairoNowKey(): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: CAIRO_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const byType = new Map(parts.map((part) => [part.type, part.value]));
    return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}T${byType.get('hour')}:${byType.get('minute')}:${byType.get('second')}`;
  }

  private slotStartKey(row: { date: Date; startTime: Date }): string {
    return `${this.toDateOnly(row.date)}T${this.toTimeOnly(row.startTime)}`;
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

    const nextStart = dto.startTime ?? this.toTimeOnly(existing.startTime);
    const nextEnd = dto.endTime ?? this.toTimeOnly(existing.endTime);
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
    const row = await this.prisma.bookingSlot.update({
      where: { id: slotId },
      data: { capacity: dto.capacity },
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
    const row = await this.prisma.bookingSlot.update({
      where: { id: slotId },
      data: { isOnlineBookable: dto.isOnlineBookable },
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
    const row = await this.prisma.bookingSlot.update({
      where: { id: slotId },
      data: { status: dto.status },
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

    const cairoNowKey = this.getCairoNowKey();
    const data = rows
      .filter((slot) => slot.bookedCount < slot.capacity)
      .filter((slot) => this.slotStartKey(slot) > cairoNowKey)
      .map((slot) => this.mapSlot(slot));

    return { data };
  }
}
