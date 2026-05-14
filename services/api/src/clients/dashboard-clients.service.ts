import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import {
  canAccessAllBranches,
  getEffectiveAllowedBranchIds,
} from '../billing/dashboard-branch-scope';
import { buildListMeta } from '../catalog/catalog.utils';
import { normalizePhoneToE164 } from '../common/phone/phone.util';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateDashboardClientDto } from './dto/create-dashboard-client.dto';
import type { DashboardClientListQueryDto } from './dto/dashboard-client-list-query.dto';
import type { UpdateDashboardClientDto } from './dto/update-dashboard-client.dto';

@Injectable()
export class DashboardClientsService {
  constructor(private readonly prisma: PrismaService) {}

  private handlePhoneUniqueConflict(error: unknown): never {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      throw new ConflictException({
        statusCode: 409,
        message: 'A client with this phone number already exists.',
        error: 'Conflict',
        code: 'CLIENT_PHONE_CONFLICT',
      });
    }
    throw error;
  }

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
    const allowed = getEffectiveAllowedBranchIds(user);
    if (!allowed.length) {
      return { id: '__no_branch_scope__' };
    }
    if (allowed.length === 1) {
      const b = allowed[0];
      return {
        OR: [{ preferredBranchId: b }, { bookings: { some: { branchId: b } } }],
      };
    }
    return {
      OR: [
        { preferredBranchId: { in: allowed } },
        { bookings: { some: { branchId: { in: allowed } } } },
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
    const allowed = getEffectiveAllowedBranchIds(user);
    if (!allowed.length) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const branchOr: Prisma.ClientWhereInput =
      allowed.length === 1
        ? {
            OR: [
              { preferredBranchId: allowed[0] },
              { bookings: { some: { branchId: allowed[0] } } },
            ],
          }
        : {
            OR: [
              { preferredBranchId: { in: allowed } },
              { bookings: { some: { branchId: { in: allowed } } } },
            ],
          };
    const count = await this.prisma.client.count({
      where: {
        id: clientId,
        ...branchOr,
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
      preferredBranch?: { name: string } | null;
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
      preferredBranchName: row.preferredBranch?.name ?? null,
      ...(canSensitive && {
        notes: row.notes,
        allergiesOrWarnings: row.allergiesOrWarnings,
      }),
      tags: row.tags,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private bookingAggregateBookingWhere(
    user: DashboardJwtUser,
  ): Prisma.BookingWhereInput {
    if (canAccessAllBranches(user)) {
      return {};
    }
    const allowed = getEffectiveAllowedBranchIds(user);
    if (!allowed.length) {
      return { id: '__no_booking_scope__' };
    }
    if (allowed.length === 1) {
      return { branchId: allowed[0] };
    }
    return { branchId: { in: allowed } };
  }

  private async countClientsWithBookingsInScope(
    user: DashboardJwtUser,
    listWhere: Prisma.ClientWhereInput,
  ): Promise<number> {
    const bookingSome = this.bookingAggregateBookingWhere(user);
    return this.prisma.client.count({
      where: {
        AND: [listWhere, { bookings: { some: bookingSome } }],
      },
    });
  }

  private async loadClientListBookingStats(
    clientIds: string[],
    branchIds: string[] | null,
  ): Promise<
    Map<
      string,
      {
        bookingCount: number;
        completedBookingCount: number;
        totalSpentCompleted: number;
        lastBookingSlotDate: string | null;
        lastBookingSlotStartTime: string | null;
      }
    >
  > {
    const out = new Map<
      string,
      {
        bookingCount: number;
        completedBookingCount: number;
        totalSpentCompleted: number;
        lastBookingSlotDate: string | null;
        lastBookingSlotStartTime: string | null;
      }
    >();
    if (clientIds.length === 0) {
      return out;
    }

    const branchFragment =
      branchIds === null
        ? Prisma.empty
        : branchIds.length === 1
          ? Prisma.sql`AND b.branch_id = CAST(${branchIds[0]} AS uuid)`
          : Prisma.sql`AND b.branch_id IN (${Prisma.join(
              branchIds.map((id) => Prisma.sql`CAST(${id} AS uuid)`),
            )})`;

    const uuidList = Prisma.join(
      clientIds.map((id) => Prisma.sql`CAST(${id} AS uuid)`),
      ', ',
    );
    const valueRows = Prisma.join(
      clientIds.map((id) => Prisma.sql`(CAST(${id} AS uuid))`),
      ', ',
    );

    const rows = await this.prisma.$queryRaw<
      Array<{
        client_id: string;
        booking_count: bigint | number | null;
        completed_count: bigint | number | null;
        total_spent: unknown;
        last_slot_date: Date | null;
        last_slot_start: Date | null;
      }>
    >(Prisma.sql`
      WITH scoped AS (
        SELECT b.*
        FROM bookings b
        WHERE b.client_id IN (${uuidList})
        ${branchFragment}
      ),
      agg AS (
        SELECT
          client_id,
          COUNT(*)::bigint AS booking_count,
          COUNT(*) FILTER (WHERE status = 'COMPLETED'::"BookingStatus")::bigint AS completed_count,
          COALESCE(
            SUM(total_amount) FILTER (WHERE status = 'COMPLETED'::"BookingStatus"),
            0
          ) AS total_spent
        FROM scoped
        GROUP BY client_id
      ),
      ranked AS (
        SELECT DISTINCT ON (s.client_id)
          s.client_id,
          sl.date AS last_slot_date,
          sl.start_time AS last_slot_start
        FROM scoped s
        INNER JOIN booking_slots sl
          ON sl.id = s.slot_id AND sl.deleted_at IS NULL
        ORDER BY s.client_id, sl.date DESC, sl.start_time DESC
      )
      SELECT
        c.id::text AS client_id,
        COALESCE(a.booking_count, 0)::bigint AS booking_count,
        COALESCE(a.completed_count, 0)::bigint AS completed_count,
        COALESCE(a.total_spent, 0) AS total_spent,
        r.last_slot_date,
        r.last_slot_start
      FROM (VALUES ${valueRows}) AS c(id)
      LEFT JOIN agg a ON a.client_id = c.id
      LEFT JOIN ranked r ON r.client_id = c.id
    `);

    const toInt = (v: bigint | number | null | undefined): number => {
      if (v === null || v === undefined) {
        return 0;
      }
      return typeof v === 'bigint' ? Number(v) : Number(v);
    };

    for (const row of rows) {
      const totalRaw = row.total_spent;
      const totalSpent =
        totalRaw === null || totalRaw === undefined
          ? 0
          : Number(
              (totalRaw as { toString?: () => string }).toString?.() ??
                totalRaw,
            );

      out.set(row.client_id, {
        bookingCount: toInt(row.booking_count),
        completedBookingCount: toInt(row.completed_count),
        totalSpentCompleted: Number.isFinite(totalSpent) ? totalSpent : 0,
        lastBookingSlotDate: row.last_slot_date
          ? row.last_slot_date.toISOString().slice(0, 10)
          : null,
        lastBookingSlotStartTime: row.last_slot_start
          ? row.last_slot_start.toISOString().slice(11, 19)
          : null,
      });
    }

    return out;
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

    const branchAggIds = canAccessAllBranches(user)
      ? null
      : getEffectiveAllowedBranchIds(user);
    const [totalItems, clientsWithBookingsCount, rows] = await Promise.all([
      this.prisma.client.count({ where }),
      this.countClientsWithBookingsInScope(user, where),
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
          preferredBranch: { select: { name: true } },
          notes: true,
          allergiesOrWarnings: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const statsMap = await this.loadClientListBookingStats(
      rows.map((r) => r.id),
      branchAggIds,
    );

    const emptyStats = {
      bookingCount: 0,
      completedBookingCount: 0,
      totalSpentCompleted: 0,
      lastBookingSlotDate: null as string | null,
      lastBookingSlotStartTime: null as string | null,
    };

    return {
      data: rows.map((row) => ({
        ...this.mapClientForUser(user, row),
        ...(statsMap.get(row.id) ?? emptyStats),
      })),
      meta: {
        ...buildListMeta({
          page: query.page,
          pageSize: query.pageSize,
          totalItems,
        }),
        clientsWithBookingsCount,
      },
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
        preferredBranch: { select: { name: true } },
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
      const allowed = getEffectiveAllowedBranchIds(user);
      if (!allowed.length) {
        throw new ForbiddenException('Insufficient permissions');
      }
      if (preferredBranchId && !allowed.includes(preferredBranchId)) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }
    const canSensitive = this.canViewSensitive(user);
    const normalizedPhone = normalizePhoneToE164(dto.phone);
    try {
      const row = await this.prisma.client.create({
        data: {
          fullName: dto.fullName,
          phone: normalizedPhone,
          email: dto.email ?? null,
          profileImageUrl: dto.profileImageUrl ?? null,
          gender: dto.gender ?? null,
          birthDate: dto.birthDate ?? null,
          preferredBranchId:
            preferredBranchId ??
            (!canAccessAllBranches(user)
              ? (user.branchId ?? getEffectiveAllowedBranchIds(user)[0] ?? null)
              : null),
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
          preferredBranch: { select: { name: true } },
          notes: true,
          allergiesOrWarnings: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return this.mapClientForUser(user, row);
    } catch (error) {
      this.handlePhoneUniqueConflict(error);
    }
  }

  async patchClient(
    user: DashboardJwtUser,
    clientId: string,
    dto: UpdateDashboardClientDto,
  ) {
    await this.assertClientBranchAccess(user, clientId);
    if (!canAccessAllBranches(user) && dto.preferredBranchId) {
      const allowed = getEffectiveAllowedBranchIds(user);
      if (!allowed.includes(dto.preferredBranchId)) {
        throw new ForbiddenException('Insufficient permissions');
      }
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
          ...(dto.phone !== undefined && {
            phone: normalizePhoneToE164(dto.phone),
          }),
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
          preferredBranch: { select: { name: true } },
          notes: true,
          allergiesOrWarnings: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return this.mapClientForUser(user, row);
    } catch (error) {
      this.handlePhoneUniqueConflict(error);
      throw new NotFoundException('Client not found');
    }
  }
}
