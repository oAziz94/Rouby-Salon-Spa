import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import {
  assertDashboardBranchAccess,
  canAccessAllBranches,
  getEffectiveAllowedBranchIds,
} from '../billing/dashboard-branch-scope';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_SETTINGS_ID } from '../settings/settings.constants';
import {
  assertValidSlotGeneration,
  mergeSlotGeneration,
  parseStoredSlotGeneration,
  pickOverridesFromSlotDto,
} from '../slots/slot-generation.utils';
import type { CreateBranchDto } from './dto/create-branch.dto';
import type { PatchBranchSlotSettingsDto } from './dto/patch-branch-slot-settings.dto';
import type { UpdateBranchDto } from './dto/update-branch.dto';
import type { UpdateBranchSettingsDto } from './dto/update-branch-settings.dto';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertBranchRead(user: DashboardJwtUser, branchId: string): void {
    assertDashboardBranchAccess(user, branchId);
  }

  private assertBranchManage(user: DashboardJwtUser): void {
    if (
      !user.permissions.includes('branches.manage') &&
      !user.permissions.includes('branches.create') &&
      !user.permissions.includes('branches.update')
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private assertBranchOperationalManage(
    user: DashboardJwtUser,
    branchId: string,
  ): void {
    if (!user.permissions.includes('settings.branch.manage')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    assertDashboardBranchAccess(user, branchId);
  }

  private normalizeJson(
    value: unknown,
    fieldLabel: string,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return Prisma.JsonNull;
    }
    if (typeof value !== 'object') {
      throw new BadRequestException(
        `${fieldLabel} must be a JSON object or array`,
      );
    }
    return value;
  }

  async list(user: DashboardJwtUser) {
    const where: Prisma.BranchWhereInput = canAccessAllBranches(user)
      ? {}
      : (() => {
          const allowed = getEffectiveAllowedBranchIds(user);
          if (!allowed.length) {
            return { id: '__no_branch_access__' };
          }
          if (allowed.length === 1) {
            return { id: allowed[0] };
          }
          return { id: { in: allowed } };
        })();
    return this.prisma.branch.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async getById(user: DashboardJwtUser, branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    this.assertBranchRead(user, branch.id);
    return branch;
  }

  async create(user: DashboardJwtUser, dto: CreateBranchDto) {
    if (
      !user.permissions.includes('branches.manage') &&
      !user.permissions.includes('branches.create')
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const data: Prisma.BranchCreateInput = {
      name: dto.name.trim(),
      address: dto.address?.trim() ?? '',
      phone: dto.phone?.trim() ?? '',
      whatsapp: dto.whatsapp?.trim() ?? '',
      mapUrl: dto.mapUrl?.trim() ?? '',
      isActive: dto.isActive ?? true,
    };
    if (dto.workingHours !== undefined) {
      const j = this.normalizeJson(dto.workingHours, 'workingHours');
      data.workingHours = j === Prisma.JsonNull ? Prisma.JsonNull : j;
    }
    const created = await this.prisma.branch.create({ data });
    await this.audit.log({
      userId: user.userId,
      action: 'branch.created',
      module: 'settings',
      entityId: created.id,
      newValue: { name: created.name, isActive: created.isActive },
    });
    return created;
  }

  async update(user: DashboardJwtUser, branchId: string, dto: UpdateBranchDto) {
    if (
      !user.permissions.includes('branches.manage') &&
      !user.permissions.includes('branches.update')
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }
    await this.getById(user, branchId);
    const data: Prisma.BranchUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.address !== undefined) data.address = dto.address.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim();
    if (dto.whatsapp !== undefined) data.whatsapp = dto.whatsapp.trim();
    if (dto.mapUrl !== undefined) data.mapUrl = dto.mapUrl.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.workingHours !== undefined) {
      const j = this.normalizeJson(dto.workingHours, 'workingHours');
      data.workingHours = j === Prisma.JsonNull ? Prisma.JsonNull : j;
    }
    if (Object.keys(data).length === 0) {
      return this.prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
    }
    const before = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data,
    });
    await this.audit.log({
      userId: user.userId,
      action: 'branch.updated',
      module: 'settings',
      entityId: updated.id,
      oldValue: before
        ? {
            name: before.name,
            address: before.address,
            phone: before.phone,
            isActive: before.isActive,
          }
        : null,
      newValue: {
        name: updated.name,
        address: updated.address,
        phone: updated.phone,
        isActive: updated.isActive,
      },
    });
    return updated;
  }

  async updateOperationalSettings(
    user: DashboardJwtUser,
    branchId: string,
    dto: UpdateBranchSettingsDto,
  ) {
    await this.getById(user, branchId);
    this.assertBranchOperationalManage(user, branchId);
    const data: Prisma.BranchUpdateInput = {};
    if (dto.phone !== undefined) data.phone = dto.phone.trim();
    if (dto.whatsapp !== undefined) data.whatsapp = dto.whatsapp.trim();
    if (dto.mapUrl !== undefined) data.mapUrl = dto.mapUrl.trim();
    if (dto.workingHours !== undefined) {
      const j = this.normalizeJson(dto.workingHours, 'workingHours');
      data.workingHours = j === Prisma.JsonNull ? Prisma.JsonNull : j;
    }
    if (Object.keys(data).length === 0) {
      return this.prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
    }
    return this.prisma.branch.update({
      where: { id: branchId },
      data,
    });
  }

  async getSlotSettings(user: DashboardJwtUser, branchId: string) {
    this.assertBranchRead(user, branchId);
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
    const systemParsed = parseStoredSlotGeneration(
      settingsRow?.slotGenerationDefaults,
    );
    return branch.slotGenerationDefaults != null
      ? parseStoredSlotGeneration(branch.slotGenerationDefaults)
      : systemParsed;
  }

  async updateSlotSettings(
    user: DashboardJwtUser,
    branchId: string,
    dto: PatchBranchSlotSettingsDto,
  ) {
    this.assertBranchRead(user, branchId);
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
    const systemParsed = parseStoredSlotGeneration(
      settingsRow?.slotGenerationDefaults,
    );
    const current =
      branch.slotGenerationDefaults != null
        ? parseStoredSlotGeneration(branch.slotGenerationDefaults)
        : systemParsed;
    const merged = mergeSlotGeneration(current, pickOverridesFromSlotDto(dto));
    assertValidSlotGeneration(merged);
    await this.prisma.branch.update({
      where: { id: branchId },
      data: { slotGenerationDefaults: merged },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'settings.slot_generation.updated',
      module: 'settings',
      entityId: branchId,
      oldValue: current,
      newValue: merged,
    });
    return merged;
  }
}
