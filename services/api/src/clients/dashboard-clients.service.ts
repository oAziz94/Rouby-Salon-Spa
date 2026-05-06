import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { canAccessAllBranches } from '../billing/dashboard-branch-scope';
import { buildListMeta } from '../catalog/catalog.utils';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateDashboardClientDto } from './dto/create-dashboard-client.dto';
import type { DashboardClientListQueryDto } from './dto/dashboard-client-list-query.dto';
import type { UpdateDashboardClientDto } from './dto/update-dashboard-client.dto';

@Injectable()
export class DashboardClientsService {
  constructor(private readonly prisma: PrismaService) {}

  private canViewContact(user: DashboardJwtUser): boolean {
    return user.permissions.includes('clients.contact.view');
  }

  private canViewSensitive(user: DashboardJwtUser): boolean {
    return (
      user.permissions.includes('clients.notes.sensitive') ||
      user.permissions.includes('clients.sensitive_notes.view')
    );
  }

  private buildBranchScopeWhere(
    user: DashboardJwtUser,
  ): Prisma.ClientWhereInput {
    if (canAccessAllBranches(user)) {
      return {};
    }
    if (!user.branchId) {
      return { id: '__no_branch_scope__' };
    }
    return {
      OR: [
        { preferredBranchId: user.branchId },
        { bookings: { some: { branchId: user.branchId } } },
      ],
    };
  }

  private async assertClientBranchAccess(
    user: DashboardJwtUser,
    clientId: string,
  ): Promise<void> {
    if (canAccessAllBranches(user)) {
      return;
    }
    if (!user.branchId) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const count = await this.prisma.client.count({
      where: {
        id: clientId,
        OR: [
          { preferredBranchId: user.branchId },
          { bookings: { some: { branchId: user.branchId } } },
        ],
      },
    });
    if (count === 0) {
      throw new NotFoundException('Client not found');
    }
  }

  private mapClientForUser(
    user: DashboardJwtUser,
    row: {
      id: string;
      fullName: string;
      phone: string;
      email: string | null;
      profileImageUrl: string | null;
      gender: string | null;
      birthDate: Date | null;
      preferredBranchId: string | null;
      notes: string | null;
      allergiesOrWarnings: string | null;
      tags: string[];
      createdAt: Date;
      updatedAt: Date;
    },
  ) {
    const canContact = this.canViewContact(user);
    const canSensitive = this.canViewSensitive(user);
    return {
      id: row.id,
      fullName: row.fullName,
      ...(canContact && { phone: row.phone, email: row.email }),
      profileImageUrl: row.profileImageUrl,
      gender: row.gender,
      birthDate: row.birthDate,
      preferredBranchId: row.preferredBranchId,
      ...(canSensitive && {
        notes: row.notes,
        allergiesOrWarnings: row.allergiesOrWarnings,
      }),
      tags: row.tags,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listClients(
    user: DashboardJwtUser,
    query: DashboardClientListQueryDto,
  ) {
    const skip = (query.page - 1) * query.pageSize;
    const branchScope = this.buildBranchScopeWhere(user);
    const search = query.search?.trim();
    const where: Prisma.ClientWhereInput = {
      AND: [
        branchScope,
        ...(search
          ? [
              {
                OR: [
                  { fullName: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                ],
              } satisfies Prisma.ClientWhereInput,
            ]
          : []),
      ],
    };

    const [totalItems, rows] = await Promise.all([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          profileImageUrl: true,
          gender: true,
          birthDate: true,
          preferredBranchId: true,
          notes: true,
          allergiesOrWarnings: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      data: rows.map((row) => this.mapClientForUser(user, row)),
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async getClientById(user: DashboardJwtUser, clientId: string) {
    await this.assertClientBranchAccess(user, clientId);
    const row = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        profileImageUrl: true,
        gender: true,
        birthDate: true,
        preferredBranchId: true,
        notes: true,
        allergiesOrWarnings: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) {
      throw new NotFoundException('Client not found');
    }
    return this.mapClientForUser(user, row);
  }

  async createClient(user: DashboardJwtUser, dto: CreateDashboardClientDto) {
    const preferredBranchId = dto.preferredBranchId ?? null;
    if (!canAccessAllBranches(user)) {
      if (!user.branchId) {
        throw new ForbiddenException('Insufficient permissions');
      }
      if (preferredBranchId && preferredBranchId !== user.branchId) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }
    const canSensitive = this.canViewSensitive(user);
    const row = await this.prisma.client.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email ?? null,
        profileImageUrl: dto.profileImageUrl ?? null,
        gender: dto.gender ?? null,
        birthDate: dto.birthDate ?? null,
        preferredBranchId:
          preferredBranchId ??
          (!canAccessAllBranches(user) ? user.branchId : null),
        notes: canSensitive ? (dto.notes ?? null) : null,
        allergiesOrWarnings: canSensitive
          ? (dto.allergiesOrWarnings ?? null)
          : null,
        tags: dto.tags ?? [],
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        profileImageUrl: true,
        gender: true,
        birthDate: true,
        preferredBranchId: true,
        notes: true,
        allergiesOrWarnings: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return this.mapClientForUser(user, row);
  }

  async patchClient(
    user: DashboardJwtUser,
    clientId: string,
    dto: UpdateDashboardClientDto,
  ) {
    await this.assertClientBranchAccess(user, clientId);
    if (
      !canAccessAllBranches(user) &&
      dto.preferredBranchId &&
      dto.preferredBranchId !== user.branchId
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const canSensitive = this.canViewSensitive(user);
    if (
      !canSensitive &&
      (dto.notes !== undefined || dto.allergiesOrWarnings !== undefined)
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }
    try {
      const row = await this.prisma.client.update({
        where: { id: clientId },
        data: {
          ...(dto.fullName !== undefined && { fullName: dto.fullName }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.profileImageUrl !== undefined && {
            profileImageUrl: dto.profileImageUrl,
          }),
          ...(dto.gender !== undefined && { gender: dto.gender }),
          ...(dto.birthDate !== undefined && { birthDate: dto.birthDate }),
          ...(dto.preferredBranchId !== undefined && {
            preferredBranchId: dto.preferredBranchId,
          }),
          ...(dto.tags !== undefined && { tags: dto.tags }),
          ...(dto.notes !== undefined && canSensitive && { notes: dto.notes }),
          ...(dto.allergiesOrWarnings !== undefined &&
            canSensitive && {
              allergiesOrWarnings: dto.allergiesOrWarnings,
            }),
        },
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          profileImageUrl: true,
          gender: true,
          birthDate: true,
          preferredBranchId: true,
          notes: true,
          allergiesOrWarnings: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return this.mapClientForUser(user, row);
    } catch {
      throw new NotFoundException('Client not found');
    }
  }
}
