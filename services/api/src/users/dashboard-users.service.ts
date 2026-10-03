import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import {
  canAccessAllBranches,
  getEffectiveAllowedBranchIds,
} from '../billing/dashboard-branch-scope';
import { buildListMeta } from '../catalog/catalog.utils';
import { PrismaService } from '../prisma/prisma.service';
import { invalidateDashboardUserCache } from '../auth/strategies/dashboard-jwt.strategy';
import type { CreateDashboardUserDto } from './dto/create-dashboard-user.dto';
import type { DashboardUserListQueryDto } from './dto/dashboard-user-list-query.dto';
import type { OwnerSetUserPasswordDto } from './dto/owner-set-user-password.dto';
import type { UpdateDashboardUserDto } from './dto/update-dashboard-user.dto';
import {
  DASHBOARD_USER_INITIAL_PASSWORD,
  passwordMatchesInitial,
} from './dashboard-user-password';

const PRIVILEGED_ROLE_NAMES = new Set(['Owner', 'Admin']);
const RBAC_GROUP_ORDER = [
  'main',
  'operations',
  'scheduling_setup',
  'customers',
  'catalog',
  'finance',
  'content',
  'reports',
  'admin',
] as const;

type GroupKey = (typeof RBAC_GROUP_ORDER)[number];

const MODULE_TO_GROUP: Record<string, GroupKey> = {
  overview: 'main',
  queue: 'operations',
  bookings: 'operations',
  slots: 'scheduling_setup',
  staff: 'scheduling_setup',
  clients: 'customers',
  services: 'catalog',
  service_enhancements: 'catalog',
  service_variants: 'catalog',
  packages: 'catalog',
  bundles: 'catalog',
  offers: 'catalog',
  invoices: 'finance',
  payments: 'finance',
  cash_drawer: 'finance',
  daily_closing: 'finance',
  gallery: 'content',
  reviews: 'content',
  whatsapp: 'content',
  content: 'content',
  reports: 'reports',
  settings: 'admin',
  users: 'admin',
  roles: 'admin',
  branches: 'admin',
  audit: 'admin',
  vat: 'admin',
};

@Injectable()
export class DashboardUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async getRoleOrThrow(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new BadRequestException(
        'Role does not exist in system RBAC matrix.',
      );
    }
    return role;
  }

  private mapUserRow(
    row: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
      role: { id: string; name: string; description: string | null };
      branch: { id: string; name: string; address: string } | null;
      branchAccesses: Array<{
        branchId: string;
        branch: { id: string; name: string; address: string };
      }>;
    },
    allBranches: Array<{ id: string; name: string; address: string }>,
  ) {
    const defaultId = row.branch?.id ?? null;
    const accessFromJoin = (row.branchAccesses ?? []).map((a) => ({
      branchId: a.branch.id,
      branchName: a.branch.name,
      address: a.branch.address || undefined,
      isDefault: defaultId === a.branch.id,
    }));
    const legacyFallback =
      accessFromJoin.length === 0 && row.branch
        ? [
            {
              branchId: row.branch.id,
              branchName: row.branch.name,
              address: row.branch.address || undefined,
              isDefault: true,
            },
          ]
        : [];
    const branchAccess = (
      accessFromJoin.length ? accessFromJoin : legacyFallback
    ).sort((a, b) => a.branchName.localeCompare(b.branchName));
    const activeIdSet = new Set(allBranches.map((b) => b.id));
    const coversAllActive =
      allBranches.length > 0 &&
      branchAccess.length === allBranches.length &&
      branchAccess.every((b) => activeIdSet.has(b.branchId));
    const branchAccessLabel =
      branchAccess.length === 0
        ? 'No branch'
        : coversAllActive && branchAccess.length > 1
          ? 'All branches'
          : branchAccess.length === 1
            ? branchAccess[0].branchName
            : `${branchAccess[0].branchName} +${branchAccess.length - 1} more`;
    const defaultBranch = row.branch
      ? { branchId: row.branch.id, branchName: row.branch.name }
      : null;
    return {
      id: row.id,
      fullName: row.name,
      email: row.email,
      phone: row.phone,
      isActive: row.isActive,
      lastLoginAt: null as string | null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      role: {
        id: row.role.id,
        name: row.role.name,
        description: row.role.description,
      },
      branchAccess,
      branchAccessCount: branchAccess.length,
      branchAccessLabel,
      defaultBranch,
    };
  }

  private async isOwnerOrAdminUser(userId: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { name: true } } },
    });
    return row?.role?.name === 'Owner' || row?.role?.name === 'Admin';
  }

  private async assertLastPrivilegedPathNotBroken(
    targetUserId: string,
    nextRoleName?: string,
  ) {
    const activePrivileged = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { name: { in: ['Owner', 'Admin'] } },
      },
      select: { id: true, role: { select: { name: true } } },
    });
    if (
      activePrivileged.length <= 1 &&
      activePrivileged[0]?.id === targetUserId
    ) {
      if (!nextRoleName || !PRIVILEGED_ROLE_NAMES.has(nextRoleName)) {
        throw new BadRequestException(
          'Cannot remove the last active admin/owner access path.',
        );
      }
    }
  }

  private async assertNotLastOwner(targetUserId: string) {
    const activeOwners = await this.prisma.user.count({
      where: { isActive: true, role: { name: 'Owner' } },
    });
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { role: { select: { name: true } }, isActive: true },
    });
    if (target?.isActive && target.role.name === 'Owner' && activeOwners <= 1) {
      throw new BadRequestException('Cannot deactivate the last active Owner.');
    }
  }

  private async assertBranchExists(branchId: string | null | undefined) {
    if (!branchId) return;
    const found = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!found) {
      throw new BadRequestException('Selected branch was not found.');
    }
  }

  private async assertBranchesExistActive(branchIds: string[]) {
    const rows = await this.prisma.branch.findMany({
      where: { id: { in: branchIds }, isActive: true },
      select: { id: true },
    });
    if (rows.length !== branchIds.length) {
      throw new BadRequestException(
        'One or more branches are invalid or inactive.',
      );
    }
  }

  private assertActorCanAssignBranches(
    actor: DashboardJwtUser,
    branchIds: string[],
  ) {
    if (canAccessAllBranches(actor)) {
      return;
    }
    const allowed = new Set(getEffectiveAllowedBranchIds(actor));
    if (branchIds.some((id) => !allowed.has(id))) {
      throw new ForbiddenException(
        'You cannot assign branches outside your access.',
      );
    }
  }

  private async normalizeBranchIdsForCreate(
    dto: CreateDashboardUserDto,
  ): Promise<{ branchIds: string[]; defaultBranchId: string }> {
    const active = await this.prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    if (!active.length) {
      throw new BadRequestException('No active branches configured.');
    }
    if (active.length === 1) {
      const only = active[0].id;
      const branchIds = dto.branchIds?.length
        ? [...new Set(dto.branchIds)]
        : [only];
      const defaultBranchId = dto.defaultBranchId ?? branchIds[0];
      return { branchIds, defaultBranchId };
    }
    if (!dto.branchIds?.length) {
      throw new BadRequestException('branchIds is required.');
    }
    if (!dto.defaultBranchId) {
      throw new BadRequestException('defaultBranchId is required.');
    }
    return {
      branchIds: [...new Set(dto.branchIds)],
      defaultBranchId: dto.defaultBranchId,
    };
  }

  private async assertPrivilegedKeepsBranches(
    userId: string,
    branchIds: string[],
    roleName: string,
  ) {
    if (branchIds.length > 0) {
      return;
    }
    if (!PRIVILEGED_ROLE_NAMES.has(roleName)) {
      return;
    }
    const activePrivileged = await this.prisma.user.count({
      where: { isActive: true, role: { name: { in: ['Owner', 'Admin'] } } },
    });
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, role: { select: { name: true } } },
    });
    if (
      activePrivileged <= 1 &&
      target?.isActive &&
      target.role.name &&
      PRIVILEGED_ROLE_NAMES.has(target.role.name)
    ) {
      throw new BadRequestException(
        'Cannot remove all branch access from the last privileged dashboard user.',
      );
    }
  }

  private buildMatrixOperation(permissionKey: string): string {
    if (permissionKey.endsWith('.read') || permissionKey.endsWith('.view'))
      return 'read';
    if (permissionKey.endsWith('.create')) return 'create';
    if (
      permissionKey.endsWith('.update') ||
      permissionKey.endsWith('.manage') ||
      permissionKey.endsWith('.edit')
    ) {
      return 'update';
    }
    if (permissionKey.endsWith('.delete') || permissionKey.endsWith('.cancel'))
      return 'deleteDeactivate';
    if (permissionKey.endsWith('.print')) return 'print';
    if (permissionKey.endsWith('.export')) return 'export';
    if (permissionKey.includes('finalize') || permissionKey.includes('close'))
      return 'closeFinalize';
    return 'update';
  }

  async listUsers(actor: DashboardJwtUser, query: DashboardUserListQueryDto) {
    const skip = (query.page - 1) * query.pageSize;
    const where: Prisma.UserWhereInput = {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.roleId ? { roleId: query.roleId } : {}),
      ...(query.branchId
        ? {
            OR: [
              { branchId: query.branchId },
              {
                branchAccesses: { some: { branchId: query.branchId } },
              },
            ],
          }
        : {}),
      ...(query.status === 'active' ? { isActive: true } : {}),
      ...(query.status === 'inactive' ? { isActive: false } : {}),
    };
    const [totalItems, rows, allBranches] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: [{ name: 'asc' }],
        include: {
          role: { select: { id: true, name: true, description: true } },
          branch: { select: { id: true, name: true, address: true } },
          branchAccesses: {
            include: {
              branch: { select: { id: true, name: true, address: true } },
            },
          },
        },
      }),
      this.prisma.branch.findMany({
        where: { isActive: true },
        select: { id: true, name: true, address: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const activeCount = await this.prisma.user.count({
      where: { ...where, isActive: true },
    });
    const inactiveCount = await this.prisma.user.count({
      where: { ...where, isActive: false },
    });
    const adminManagerCount = await this.prisma.user.count({
      where: {
        ...where,
        isActive: true,
        role: { name: { in: ['Owner', 'Admin', 'Branch Manager'] } },
      },
    });

    const actorIsPrivileged = await this.isOwnerOrAdminUser(actor.userId);
    const ownerHashes = new Map<string, string>();
    if (actorIsPrivileged && rows.length > 0) {
      const hashRows = await this.prisma.user.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: { id: true, passwordHash: true },
      });
      for (const h of hashRows) {
        ownerHashes.set(h.id, h.passwordHash);
      }
    }

    const data = await Promise.all(
      rows.map(async (row) => {
        const base = this.mapUserRow(row, allBranches);
        if (!actorIsPrivileged) {
          return base;
        }
        const hash = ownerHashes.get(row.id);
        if (!hash) {
          return base;
        }
        const isInitial = await passwordMatchesInitial(hash);
        return {
          ...base,
          ownerPasswordPlaintext: isInitial
            ? DASHBOARD_USER_INITIAL_PASSWORD
            : null,
        };
      }),
    );

    return {
      data,
      summary: {
        totalUsers: totalItems,
        activeUsers: activeCount,
        inactiveUsers: inactiveCount,
        adminManagerUsers: adminManagerCount,
      },
      meta: buildListMeta({
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
      }),
    };
  }

  async getUser(actor: DashboardJwtUser, userId: string) {
    const [row, allBranches] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              rolePermissions: { include: { permission: true } },
            },
          },
          branch: { select: { id: true, name: true, address: true } },
          branchAccesses: {
            include: {
              branch: { select: { id: true, name: true, address: true } },
            },
          },
        },
      }),
      this.prisma.branch.findMany({
        where: { isActive: true },
        select: { id: true, name: true, address: true },
      }),
    ]);
    if (!row) throw new NotFoundException('User not found');
    const base = this.mapUserRow(row, allBranches);
    const actorIsPrivileged = await this.isOwnerOrAdminUser(actor.userId);
    let ownerPasswordPlaintext: string | null | undefined;
    if (actorIsPrivileged) {
      const full = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });
      if (full && (await passwordMatchesInitial(full.passwordHash))) {
        ownerPasswordPlaintext = DASHBOARD_USER_INITIAL_PASSWORD;
      } else {
        ownerPasswordPlaintext = null;
      }
    }
    return {
      ...base,
      ...(actorIsPrivileged ? { ownerPasswordPlaintext } : {}),
      permissions: row.role.rolePermissions
        .map((rp) => rp.permission.key)
        .sort(),
      safetyWarning: PRIVILEGED_ROLE_NAMES.has(row.role.name)
        ? 'Changing this user may affect administrative access.'
        : null,
    };
  }

  async createUser(actor: DashboardJwtUser, dto: CreateDashboardUserDto) {
    const role = await this.getRoleOrThrow(dto.roleId);
    const { branchIds, defaultBranchId } =
      await this.normalizeBranchIdsForCreate(dto);
    if (!branchIds.includes(defaultBranchId)) {
      throw new BadRequestException(
        'defaultBranchId must be one of the branchIds.',
      );
    }
    await this.assertBranchesExistActive(branchIds);
    this.assertActorCanAssignBranches(actor, branchIds);
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }
    const passwordHash = await argon2.hash(DASHBOARD_USER_INITIAL_PASSWORD, {
      type: argon2.argon2id,
    });
    const created = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: dto.fullName.trim(),
          email,
          phone: dto.phone?.trim() || null,
          roleId: role.id,
          branchId: defaultBranchId,
          isActive: dto.isActive ?? true,
          passwordHash,
        },
        include: {
          role: { select: { id: true, name: true, description: true } },
          branch: { select: { id: true, name: true, address: true } },
          branchAccesses: {
            include: {
              branch: { select: { id: true, name: true, address: true } },
            },
          },
        },
      });
      await tx.userBranchAccess.createMany({
        data: branchIds.map((branchId) => ({ userId: u.id, branchId })),
        skipDuplicates: true,
      });
      return tx.user.findUniqueOrThrow({
        where: { id: u.id },
        include: {
          role: { select: { id: true, name: true, description: true } },
          branch: { select: { id: true, name: true, address: true } },
          branchAccesses: {
            include: {
              branch: { select: { id: true, name: true, address: true } },
            },
          },
        },
      });
    });
    await this.audit.log({
      userId: actor.userId,
      action: 'user.created',
      module: 'users',
      entityId: created.id,
      newValue: {
        fullName: created.name,
        email: created.email,
        roleId: created.roleId,
        branchIds,
        defaultBranchId,
        isActive: created.isActive,
      },
    });
    const allBranches = await this.prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true, address: true },
    });
    return this.mapUserRow(created, allBranches);
  }

  async updateUser(
    actor: DashboardJwtUser,
    userId: string,
    dto: UpdateDashboardUserDto,
  ) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        branchAccesses: { select: { branchId: true } },
      },
    });
    if (!current) throw new NotFoundException('User not found');
    const nextRole = dto.roleId
      ? await this.getRoleOrThrow(dto.roleId)
      : current.role;

    if (
      actor.userId === userId &&
      PRIVILEGED_ROLE_NAMES.has(current.role.name) &&
      !PRIVILEGED_ROLE_NAMES.has(nextRole.name)
    ) {
      throw new ForbiddenException(
        'You cannot remove your own admin/owner access.',
      );
    }
    await this.assertLastPrivilegedPathNotBroken(userId, nextRole.name);

    const previousBranchIds = (
      current.branchAccesses.length > 0
        ? current.branchAccesses.map((a) => a.branchId)
        : current.branchId
          ? [current.branchId]
          : []
    ).sort();
    const previousDefaultBranchId = current.branchId;

    let nextBranchIds: string[] | undefined;
    let nextDefaultBranchId = current.branchId;

    if (dto.branchIds !== undefined) {
      if (dto.defaultBranchId === undefined || dto.defaultBranchId === null) {
        throw new BadRequestException(
          'defaultBranchId is required when updating branchIds.',
        );
      }
      nextBranchIds = [...new Set(dto.branchIds)];
      if (!nextBranchIds.length) {
        throw new BadRequestException('branchIds must not be empty.');
      }
      if (!nextBranchIds.includes(dto.defaultBranchId)) {
        throw new BadRequestException(
          'defaultBranchId must be one of branchIds.',
        );
      }
      await this.assertBranchesExistActive(nextBranchIds);
      this.assertActorCanAssignBranches(actor, nextBranchIds);
      await this.assertPrivilegedKeepsBranches(
        userId,
        nextBranchIds,
        nextRole.name,
      );
      nextDefaultBranchId = dto.defaultBranchId;
    } else if (
      dto.defaultBranchId !== undefined &&
      dto.defaultBranchId !== null
    ) {
      await this.assertBranchExists(dto.defaultBranchId);
      const allowed =
        current.branchAccesses.length > 0
          ? current.branchAccesses.map((a) => a.branchId)
          : current.branchId
            ? [current.branchId]
            : [];
      if (!allowed.includes(dto.defaultBranchId)) {
        throw new BadRequestException(
          'Default branch must be within the user’s branch access.',
        );
      }
      nextDefaultBranchId = dto.defaultBranchId;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.fullName !== undefined ? { name: dto.fullName.trim() } : {}),
          ...(dto.email !== undefined
            ? { email: dto.email.trim().toLowerCase() }
            : {}),
          ...(dto.phone !== undefined
            ? { phone: dto.phone?.trim() || null }
            : {}),
          ...(dto.roleId !== undefined ? { roleId: nextRole.id } : {}),
          ...(dto.defaultBranchId !== undefined || dto.branchIds !== undefined
            ? { branchId: nextDefaultBranchId }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      if (nextBranchIds) {
        await tx.userBranchAccess.deleteMany({ where: { userId } });
        await tx.userBranchAccess.createMany({
          data: nextBranchIds.map((branchId) => ({ userId, branchId })),
          skipDuplicates: true,
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          role: { select: { id: true, name: true, description: true } },
          branch: { select: { id: true, name: true, address: true } },
          branchAccesses: {
            include: {
              branch: { select: { id: true, name: true, address: true } },
            },
          },
        },
      });
    });

    // Role, branch and active changes must apply to the very next request, not after the cache window.
    invalidateDashboardUserCache(userId);

    const newBranchIds = (
      updated.branchAccesses.length > 0
        ? updated.branchAccesses.map((a) => a.branchId)
        : updated.branchId
          ? [updated.branchId]
          : []
    ).sort();
    const newDefaultBranchId = updated.branchId;

    const roleChanged = current.roleId !== updated.role.id;
    const defaultBranchChanged = previousDefaultBranchId !== newDefaultBranchId;
    const branchAccessChanged =
      previousBranchIds.join(',') !== newBranchIds.join(',');

    await this.audit.log({
      userId: actor.userId,
      action: 'user.updated',
      module: 'users',
      entityId: updated.id,
      oldValue: {
        fullName: current.name,
        email: current.email,
        phone: current.phone,
        roleId: current.roleId,
        branchId: current.branchId,
        isActive: current.isActive,
      },
      newValue: {
        fullName: updated.name,
        email: updated.email,
        phone: updated.phone,
        roleId: updated.role.id,
        branchId: updated.branch?.id ?? null,
        isActive: updated.isActive,
      },
    });
    if (roleChanged) {
      await this.audit.log({
        userId: actor.userId,
        action: 'user.role_changed',
        module: 'users',
        entityId: updated.id,
        oldValue: { roleId: current.roleId },
        newValue: { roleId: updated.role.id },
      });
    }
    if (branchAccessChanged || defaultBranchChanged) {
      await this.audit.log({
        userId: actor.userId,
        action: 'user.branch_access_changed',
        module: 'users',
        entityId: updated.id,
        oldValue: {
          targetUserId: userId,
          previousBranchIds,
          previousDefaultBranchId,
          performedByUserId: actor.userId,
        },
        newValue: {
          targetUserId: userId,
          newBranchIds,
          newDefaultBranchId,
          performedByUserId: actor.userId,
        },
      });
    }
    const allBranches = await this.prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true, address: true },
    });
    return this.mapUserRow(updated, allBranches);
  }

  async activateUser(actor: DashboardJwtUser, userId: string) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!current) throw new NotFoundException('User not found');
    invalidateDashboardUserCache(userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });
    await this.audit.log({
      userId: actor.userId,
      action: 'user.activated',
      module: 'users',
      entityId: userId,
      oldValue: { isActive: current.isActive },
      newValue: { isActive: true },
    });
    return { id: updated.id, isActive: updated.isActive };
  }

  async deactivateUser(actor: DashboardJwtUser, userId: string) {
    if (actor.userId === userId) {
      throw new ForbiddenException('You cannot deactivate yourself.');
    }
    await this.assertNotLastOwner(userId);
    await this.assertLastPrivilegedPathNotBroken(userId);
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!current) throw new NotFoundException('User not found');
    invalidateDashboardUserCache(userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
    await this.prisma.dashboardRefreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'deactivated' },
    });
    await this.audit.log({
      userId: actor.userId,
      action: 'user.deactivated',
      module: 'users',
      entityId: userId,
      oldValue: { isActive: current.isActive },
      newValue: { isActive: false },
    });
    return { id: updated.id, isActive: updated.isActive };
  }

  async ownerSetUserPassword(
    actor: DashboardJwtUser,
    userId: string,
    dto: OwnerSetUserPasswordDto,
  ) {
    if (!(await this.isOwnerOrAdminUser(actor.userId))) {
      throw new ForbiddenException(
        'Only an Owner or Admin may set another user’s password.',
      );
    }
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    const passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    invalidateDashboardUserCache(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.prisma.dashboardRefreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'password_reset' },
    });
    await this.audit.log({
      userId: actor.userId,
      action: 'user.password_reset_by_privileged',
      module: 'users',
      entityId: userId,
      newValue: { targetUserId: userId, targetEmail: target.email },
    });
    return { id: userId, ok: true as const };
  }

  async listRoles(actor: DashboardJwtUser) {
    void actor;
    const roles = await this.prisma.role.findMany({
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { users: true } },
      },
    });
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      level: role.level,
      userCount: role._count.users,
      isSystemRole: true,
    }));
  }

  async getRbacMatrix(actor: DashboardJwtUser) {
    void actor;
    const roles = await this.prisma.role.findMany({
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { users: true } },
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return {
      note: 'Roles and permissions are controlled by the system RBAC matrix. This page only assigns users to existing roles.',
      roles: roles.map((role) => {
        const groups = new Map<string, Map<string, Record<string, boolean>>>();
        for (const rp of role.rolePermissions) {
          const perm = rp.permission;
          const group = MODULE_TO_GROUP[perm.module] ?? 'admin';
          const moduleName = perm.module;
          if (!groups.has(group)) groups.set(group, new Map());
          const groupModules = groups.get(group)!;
          if (!groupModules.has(moduleName)) groupModules.set(moduleName, {});
          const operations = groupModules.get(moduleName)!;
          operations[this.buildMatrixOperation(perm.key)] = true;
        }
        const grouped = RBAC_GROUP_ORDER.map((group) => {
          const modules = groups.get(group);
          if (!modules)
            return {
              key: group,
              modules: [] as Array<{
                moduleKey: string;
                operations: Record<string, boolean>;
              }>,
            };
          return {
            key: group,
            modules: Array.from(modules.entries()).map(
              ([moduleKey, operations]) => ({
                moduleKey,
                operations,
              }),
            ),
          };
        });
        return {
          id: role.id,
          name: role.name,
          description: role.description,
          userCount: role._count.users,
          isSystemRole: true,
          groups: grouped,
          permissionKeys: role.rolePermissions
            .map((rp) => rp.permission.key)
            .sort(),
        };
      }),
    };
  }
}
