import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffScheduleExceptionType } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { assertDashboardBranchAccess } from '../billing/dashboard-branch-scope';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAvailabilityService } from './staff-availability.service';
import type { CreateStaffProfileDto } from './dto/create-staff-profile.dto';
import type { PatchStaffProfileDto } from './dto/patch-staff-profile.dto';
import type { PutStaffScheduleDto } from './dto/put-staff-schedule.dto';
import type { PutStaffServicesDto } from './dto/put-staff-services.dto';
import type { CreateStaffExceptionDto } from './dto/create-staff-exception.dto';
import type { PatchStaffExceptionDto } from './dto/patch-staff-exception.dto';

const STAFF_ROLE_NAME = 'Staff';

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: StaffAvailabilityService,
  ) {}

  private async requireStaffRoleUser(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!u) throw new NotFoundException('User not found');
    if (u.role.name !== STAFF_ROLE_NAME) {
      throw new BadRequestException(
        `User must have the "${STAFF_ROLE_NAME}" dashboard role to attach a staff profile`,
      );
    }
    return u;
  }

  async listStaff(user: DashboardJwtUser, branchId: string) {
    assertDashboardBranchAccess(user, branchId);
    if (!user.permissions.includes('staff.read')) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const usersWithRole = await this.prisma.user.findMany({
      where: {
        role: { name: STAFF_ROLE_NAME },
        isActive: true,
        OR: [
          { branchId },
          { branchAccesses: { some: { branchId } } },
          { staffProfiles: { some: { branchId } } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    const profiles = await this.prisma.staffProfile.findMany({
      where: { branchId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isActive: true,
          },
        },
        services: { select: { id: true } },
        schedules: {
          where: { branchId },
          orderBy: { dayOfWeek: 'asc' },
        },
      },
      orderBy: { displayName: 'asc' },
    });

    const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

    return {
      branchId,
      staffUsers: usersWithRole.map((u) => {
        const p = profileByUserId.get(u.id);
        return {
          user: u,
          profile: p
            ? {
                id: p.id,
                displayName: p.displayName,
                isBookable: p.isBookable,
                isActive: p.isActive,
                servicesCount: p.services.length,
                schedulesCount: p.schedules.length,
              }
            : null,
        };
      }),
      profiles: profiles.map((p) => ({
        id: p.id,
        userId: p.userId,
        displayName: p.displayName,
        bio: p.bio,
        avatarImageId: p.avatarImageId,
        isBookable: p.isBookable,
        isActive: p.isActive,
        user: p.user,
        servicesCount: p.services.length,
        schedules: p.schedules,
      })),
    };
  }

  async createProfile(user: DashboardJwtUser, body: CreateStaffProfileDto) {
    if (!user.permissions.includes('staff.create')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    assertDashboardBranchAccess(user, body.branchId);
    await this.requireStaffRoleUser(body.userId);

    const existing = await this.prisma.staffProfile.findUnique({
      where: {
        userId_branchId: { userId: body.userId, branchId: body.branchId },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Staff profile already exists for this user and branch',
      );
    }

    const created = await this.prisma.staffProfile.create({
      data: {
        userId: body.userId,
        branchId: body.branchId,
        displayName: body.displayName.trim(),
        bio: body.bio?.trim() || null,
        avatarImageId: body.avatarImageId ?? null,
        isBookable: body.isBookable ?? true,
        isActive: body.isActive ?? true,
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
    return created;
  }

  async getProfile(user: DashboardJwtUser, profileId: string) {
    if (!user.permissions.includes('staff.read')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const p = await this.prisma.staffProfile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isActive: true,
          },
        },
        branch: { select: { id: true, name: true } },
        services: {
          include: {
            service: { select: { id: true, name: true, categoryId: true } },
          },
        },
      },
    });
    if (!p) throw new NotFoundException('Staff profile not found');
    assertDashboardBranchAccess(user, p.branchId);

    const schedules = await this.prisma.staffSchedule.findMany({
      where: { staffProfileId: p.id, branchId: p.branchId },
      orderBy: { dayOfWeek: 'asc' },
    });

    return { ...p, schedules };
  }

  async patchProfile(
    user: DashboardJwtUser,
    profileId: string,
    body: PatchStaffProfileDto,
  ) {
    if (!user.permissions.includes('staff.update')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const p = await this.prisma.staffProfile.findUnique({
      where: { id: profileId },
    });
    if (!p) throw new NotFoundException('Staff profile not found');
    assertDashboardBranchAccess(user, p.branchId);

    return this.prisma.staffProfile.update({
      where: { id: profileId },
      data: {
        displayName: body.displayName?.trim(),
        bio: body.bio === undefined ? undefined : body.bio?.trim() || null,
        avatarImageId: body.avatarImageId,
        isBookable: body.isBookable,
        isActive: body.isActive,
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
  }

  async deactivateProfile(user: DashboardJwtUser, profileId: string) {
    if (!user.permissions.includes('staff.delete')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const p = await this.prisma.staffProfile.findUnique({
      where: { id: profileId },
    });
    if (!p) throw new NotFoundException('Staff profile not found');
    assertDashboardBranchAccess(user, p.branchId);
    return this.prisma.staffProfile.update({
      where: { id: profileId },
      data: { isActive: false, isBookable: false },
    });
  }

  async getServices(user: DashboardJwtUser, profileId: string) {
    if (!user.permissions.includes('staffServices.read')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const p = await this.prisma.staffProfile.findUnique({
      where: { id: profileId },
      include: { services: { include: { service: true } } },
    });
    if (!p) throw new NotFoundException('Staff profile not found');
    assertDashboardBranchAccess(user, p.branchId);
    return p.services.map((s) => ({
      id: s.id,
      serviceId: s.serviceId,
      serviceName: s.service.name,
      categoryId: s.service.categoryId,
    }));
  }

  async putServices(
    user: DashboardJwtUser,
    profileId: string,
    body: PutStaffServicesDto,
  ) {
    if (!user.permissions.includes('staffServices.update')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const p = await this.prisma.staffProfile.findUnique({
      where: { id: profileId },
    });
    if (!p) throw new NotFoundException('Staff profile not found');
    assertDashboardBranchAccess(user, p.branchId);

    const services = await this.prisma.service.findMany({
      where: {
        id: { in: body.serviceIds },
        isActive: true,
        branches: { some: { branchId: p.branchId } },
      },
      select: { id: true },
    });
    if (services.length !== body.serviceIds.length) {
      throw new BadRequestException(
        'One or more services are invalid, inactive, or not offered at this branch',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.staffProfileService.deleteMany({
        where: { staffProfileId: profileId },
      });
      if (body.serviceIds.length === 0) return;
      await tx.staffProfileService.createMany({
        data: body.serviceIds.map((serviceId) => ({
          staffProfileId: profileId,
          serviceId,
        })),
      });
    });

    return this.getServices(user, profileId);
  }

  private assertTimeOrder(start: Date, end: Date, label: string) {
    if (start >= end) {
      throw new BadRequestException(
        `${label}: startTime must be before endTime`,
      );
    }
  }

  private assertBreakInside(
    workStart: Date,
    workEnd: Date,
    breakStart: Date | null,
    breakEnd: Date | null,
  ) {
    if (!breakStart || !breakEnd) return;
    this.assertTimeOrder(breakStart, breakEnd, 'Break');
    if (breakStart < workStart || breakEnd > workEnd) {
      throw new BadRequestException('Break must fall inside working hours');
    }
  }

  async getSchedule(user: DashboardJwtUser, profileId: string) {
    if (!user.permissions.includes('staffSchedule.read')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const p = await this.prisma.staffProfile.findUnique({
      where: { id: profileId },
    });
    if (!p) throw new NotFoundException('Staff profile not found');
    assertDashboardBranchAccess(user, p.branchId);
    return this.prisma.staffSchedule.findMany({
      where: { staffProfileId: profileId, branchId: p.branchId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async putSchedule(
    user: DashboardJwtUser,
    profileId: string,
    body: PutStaffScheduleDto,
  ) {
    if (!user.permissions.includes('staffSchedule.update')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const p = await this.prisma.staffProfile.findUnique({
      where: { id: profileId },
    });
    if (!p) throw new NotFoundException('Staff profile not found');
    assertDashboardBranchAccess(user, p.branchId);

    for (const row of body.days) {
      if (row.dayOfWeek < 0 || row.dayOfWeek > 6) {
        throw new BadRequestException('dayOfWeek must be 0–6 (Sun–Sat)');
      }
      if (row.isWorking) {
        if (!row.startTime || !row.endTime) {
          throw new BadRequestException(
            `startTime and endTime are required for working day ${row.dayOfWeek}`,
          );
        }
        this.assertTimeOrder(
          row.startTime,
          row.endTime,
          `Day ${row.dayOfWeek}`,
        );
        this.assertBreakInside(
          row.startTime,
          row.endTime,
          row.breakStartTime ?? null,
          row.breakEndTime ?? null,
        );
      }
    }

    const placeholderStart = new Date('1970-01-01T00:00:00.000Z');
    const placeholderEnd = new Date('1970-01-01T00:01:00.000Z');

    await this.prisma.$transaction(async (tx) => {
      await tx.staffSchedule.deleteMany({
        where: { staffProfileId: profileId, branchId: p.branchId },
      });
      for (const row of body.days) {
        await tx.staffSchedule.create({
          data: {
            staffProfileId: profileId,
            branchId: p.branchId,
            dayOfWeek: row.dayOfWeek,
            startTime: row.isWorking ? row.startTime! : placeholderStart,
            endTime: row.isWorking ? row.endTime! : placeholderEnd,
            breakStartTime: row.isWorking ? (row.breakStartTime ?? null) : null,
            breakEndTime: row.isWorking ? (row.breakEndTime ?? null) : null,
            isWorking: row.isWorking,
          },
        });
      }
    });

    return this.getSchedule(user, profileId);
  }

  async listExceptions(user: DashboardJwtUser, profileId: string) {
    if (!user.permissions.includes('staffSchedule.read')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const p = await this.prisma.staffProfile.findUnique({
      where: { id: profileId },
    });
    if (!p) throw new NotFoundException('Staff profile not found');
    assertDashboardBranchAccess(user, p.branchId);
    return this.prisma.staffScheduleException.findMany({
      where: { staffProfileId: profileId, branchId: p.branchId },
      orderBy: { date: 'asc' },
    });
  }

  async createException(
    user: DashboardJwtUser,
    profileId: string,
    body: CreateStaffExceptionDto,
  ) {
    if (!user.permissions.includes('staffSchedule.create')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const p = await this.prisma.staffProfile.findUnique({
      where: { id: profileId },
    });
    if (!p) throw new NotFoundException('Staff profile not found');
    assertDashboardBranchAccess(user, p.branchId);

    if (body.type === StaffScheduleExceptionType.DAY_OFF) {
      // ok
    } else {
      if (!body.startTime || !body.endTime) {
        throw new BadRequestException(
          'startTime and endTime are required for this exception type',
        );
      }
      this.assertTimeOrder(body.startTime, body.endTime, 'Exception');
    }

    return this.prisma.staffScheduleException.create({
      data: {
        staffProfileId: profileId,
        branchId: p.branchId,
        date: body.date,
        type: body.type,
        startTime: body.startTime ?? null,
        endTime: body.endTime ?? null,
        reason: body.reason?.trim() || null,
      },
    });
  }

  async patchException(
    user: DashboardJwtUser,
    profileId: string,
    exceptionId: string,
    body: PatchStaffExceptionDto,
  ) {
    if (!user.permissions.includes('staffSchedule.update')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const ex = await this.prisma.staffScheduleException.findFirst({
      where: { id: exceptionId, staffProfileId: profileId },
    });
    if (!ex) throw new NotFoundException('Exception not found');
    assertDashboardBranchAccess(user, ex.branchId);

    const type = body.type ?? ex.type;
    const start = body.startTime ?? ex.startTime;
    const end = body.endTime ?? ex.endTime;
    if (type !== StaffScheduleExceptionType.DAY_OFF) {
      if (!start || !end) {
        throw new BadRequestException(
          'startTime and endTime are required for this exception type',
        );
      }
      this.assertTimeOrder(start, end, 'Exception');
    }

    return this.prisma.staffScheduleException.update({
      where: { id: exceptionId },
      data: {
        date: body.date ?? undefined,
        type: body.type ?? undefined,
        startTime: body.startTime === undefined ? undefined : body.startTime,
        endTime: body.endTime === undefined ? undefined : body.endTime,
        reason:
          body.reason === undefined ? undefined : body.reason?.trim() || null,
      },
    });
  }

  async deleteException(
    user: DashboardJwtUser,
    profileId: string,
    exceptionId: string,
  ) {
    if (!user.permissions.includes('staffSchedule.delete')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const ex = await this.prisma.staffScheduleException.findFirst({
      where: { id: exceptionId, staffProfileId: profileId },
    });
    if (!ex) throw new NotFoundException('Exception not found');
    assertDashboardBranchAccess(user, ex.branchId);
    await this.prisma.staffScheduleException.delete({
      where: { id: exceptionId },
    });
    return { deleted: true };
  }

  async availabilityQuery(
    user: DashboardJwtUser,
    params: {
      branchId: string;
      serviceId: string;
      date?: string;
      startTime?: string;
      endTime?: string;
    },
  ) {
    if (!user.permissions.includes('staff.read')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    assertDashboardBranchAccess(user, params.branchId);

    const dateYmd = params.date?.trim() || this.availability.cairoTodayYmd();
    const composite =
      params.startTime && params.endTime
        ? `${dateYmd}T${params.startTime.slice(0, 8)}`
        : `${dateYmd}T${this.availability.cairoNowKey().slice(11, 19)}`;

    const rows = await this.availability.listQualifiedStaffForService(
      params.branchId,
      params.serviceId,
      composite,
    );
    return {
      branchId: params.branchId,
      serviceId: params.serviceId,
      evaluatedAt: composite,
      timezone: 'Africa/Cairo',
      staff: rows,
    };
  }
}
