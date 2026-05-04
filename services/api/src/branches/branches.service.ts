import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateBranchDto } from './dto/create-branch.dto';
import type { UpdateBranchDto } from './dto/update-branch.dto';
import type { UpdateBranchSettingsDto } from './dto/update-branch-settings.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  private assertBranchRead(user: DashboardJwtUser, branchId: string): void {
    if (user.permissions.includes('branches.manage')) {
      return;
    }
    if (user.branchId === null) {
      return;
    }
    if (user.branchId === branchId) {
      return;
    }
    throw new ForbiddenException('Insufficient permissions');
  }

  private assertBranchManage(user: DashboardJwtUser): void {
    if (!user.permissions.includes('branches.manage')) {
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
    if (user.branchId === null) {
      return;
    }
    if (user.branchId !== branchId) {
      throw new ForbiddenException('Insufficient permissions');
    }
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
    const where =
      !user.permissions.includes('branches.manage') && user.branchId
        ? { id: user.branchId }
        : {};
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
    this.assertBranchManage(user);
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
    return this.prisma.branch.create({ data });
  }

  async update(user: DashboardJwtUser, branchId: string, dto: UpdateBranchDto) {
    this.assertBranchManage(user);
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
    return this.prisma.branch.update({
      where: { id: branchId },
      data,
    });
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
}
