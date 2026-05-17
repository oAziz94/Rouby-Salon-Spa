import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationStatus, Prisma } from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import {
  canAccessAllBranches,
  getEffectiveAllowedBranchIds,
} from '../billing/dashboard-branch-scope';
import {
  extractBookingIdSearchCompact,
  formatBookingReference,
  tryDashedUuid,
} from '../common/booking-reference.util';
import {
  formatBookingDateLabel,
  formatBookingTimeLabel,
} from './booking-slot-format';
import { buildListMeta } from '../catalog/catalog.utils';
import { PrismaService } from '../prisma/prisma.service';
import { BookingNotificationService } from './booking-notification.service';
import type { NotificationLogListQueryDto } from './dto/notification-log-list-query.dto';

const notificationLogListArgs =
  Prisma.validator<Prisma.NotificationLogDefaultArgs>()({
    include: {
      booking: {
        select: {
          id: true,
          branchId: true,
          client: {
            select: { id: true, fullName: true, phone: true },
          },
          branch: { select: { id: true, name: true } },
          slot: { select: { date: true, startTime: true } },
        },
      },
    },
  });

const notificationLogDetailArgs =
  Prisma.validator<Prisma.NotificationLogDefaultArgs>()({
    include: {
      booking: {
        include: {
          client: true,
          branch: true,
          slot: true,
          items: { orderBy: { createdAt: 'asc' }, take: 8 },
        },
      },
      changeRequest: {
        select: {
          id: true,
          status: true,
          requestType: true,
          handledAt: true,
        },
      },
    },
  });

type LogWithRelations = Prisma.NotificationLogGetPayload<
  typeof notificationLogListArgs
>;

type NotificationLogDetailRow = Prisma.NotificationLogGetPayload<
  typeof notificationLogDetailArgs
>;

@Injectable()
export class DashboardNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingNotifications: BookingNotificationService,
  ) {}

  async list(user: DashboardJwtUser, query: NotificationLogListQueryDto) {
    const where = await this.buildWhere(user, query);
    const page = query.page;
    const pageSize = query.pageSize;

    return this.prisma.$transaction(async (tx) => {
      const totalItems = await tx.notificationLog.count({ where });
      const rows = await tx.notificationLog.findMany({
        ...notificationLogListArgs,
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      return {
        data: rows.map((row) => this.mapListItem(row, user)),
        meta: buildListMeta({ page, pageSize, totalItems }),
      };
    });
  }

  async getById(user: DashboardJwtUser, id: string) {
    const row = await this.prisma.notificationLog.findUnique({
      ...notificationLogDetailArgs,
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Notification log not found');
    }
    await this.assertLogBranchAccess(user, row);
    return this.mapDetail(row, user);
  }

  async retry(user: DashboardJwtUser, id: string) {
    if (!user.permissions.includes('notifications.retry')) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const existing = await this.prisma.notificationLog.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        branchId: true,
        bookingId: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Notification log not found');
    }
    await this.assertLogBranchAccess(user, existing);
    if (existing.status !== NotificationStatus.FAILED) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Only failed notifications can be retried.',
        error: 'Bad Request',
        code: 'NOTIFICATION_NOT_RETRYABLE',
      });
    }

    const result = await this.bookingNotifications.retryFailedNotificationLog(
      id,
    );
    const row = await this.getById(user, result.id);
    return {
      success: true,
      attempt: row,
    };
  }

  private async buildWhere(
    user: DashboardJwtUser,
    query: NotificationLogListQueryDto,
  ): Promise<Prisma.NotificationLogWhereInput> {
    const and: Prisma.NotificationLogWhereInput[] = [
      this.buildBranchScopeWhere(user, query.branchId),
    ];

    if (query.channel) {
      and.push({ channel: query.channel });
    }
    if (query.type) {
      and.push({ type: query.type });
    }
    if (query.status) {
      and.push({ status: query.status });
    }

    if (query.dateFrom) {
      and.push({
        createdAt: { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) },
      });
    }
    if (query.dateTo) {
      and.push({
        createdAt: {
          lte: new Date(`${query.dateTo}T23:59:59.999Z`),
        },
      });
    }

    const search = query.search?.trim();
    if (search) {
      const digits = search.replace(/\D/g, '');
      const or: Prisma.NotificationLogWhereInput[] = [
        {
          booking: {
            client: {
              fullName: { contains: search, mode: 'insensitive' },
            },
          },
        },
      ];
      if (digits.length >= 3) {
        or.push({
          recipientPhone: { contains: digits, mode: 'insensitive' },
        });
      }
      const bookingFrag = extractBookingIdSearchCompact(search);
      if (bookingFrag) {
        const dashed = tryDashedUuid(bookingFrag);
        if (dashed) {
          or.push({ bookingId: dashed });
        } else if (bookingFrag.length >= 4) {
          const bookingIds =
            await this.findBookingIdsMatchingCompactId(bookingFrag);
          if (bookingIds.length) {
            or.push({ bookingId: { in: bookingIds } });
          }
        }
      }
      and.push({ OR: or });
    }

    return { AND: and };
  }

  private buildBranchScopeWhere(
    user: DashboardJwtUser,
    queryBranchId?: string,
  ): Prisma.NotificationLogWhereInput {
    if (canAccessAllBranches(user)) {
      if (!queryBranchId) {
        return {};
      }
      return {
        OR: [
          { branchId: queryBranchId },
          { booking: { branchId: queryBranchId } },
        ],
      };
    }

    const allowed = getEffectiveAllowedBranchIds(user);
    if (!allowed.length) {
      throw new ForbiddenException('Insufficient permissions');
    }

    let branchIds = allowed;
    if (queryBranchId) {
      if (!allowed.includes(queryBranchId)) {
        throw new ForbiddenException('Insufficient permissions');
      }
      branchIds = [queryBranchId];
    }

    return {
      OR: [
        { branchId: { in: branchIds } },
        { booking: { branchId: { in: branchIds } } },
      ],
    };
  }

  private async assertLogBranchAccess(
    user: DashboardJwtUser,
    row: {
      branchId: string | null;
      bookingId?: string | null;
      booking?: { branchId: string } | null;
    },
  ): Promise<void> {
    if (canAccessAllBranches(user)) {
      return;
    }
    const allowed = new Set(getEffectiveAllowedBranchIds(user));
    const directBranchId = row.branchId ?? row.booking?.branchId;
    if (directBranchId && allowed.has(directBranchId)) {
      return;
    }
    if (row.bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: row.bookingId },
        select: { branchId: true },
      });
      if (booking && allowed.has(booking.branchId)) {
        return;
      }
    }
    throw new ForbiddenException('Insufficient permissions');
  }

  private canViewErrorMessage(user: DashboardJwtUser): boolean {
    return (
      user.permissions.includes('notifications.retry') ||
      user.permissions.includes('users.manage') ||
      user.permissions.includes('audit.read')
    );
  }

  private mapListItem(row: LogWithRelations, user: DashboardJwtUser) {
    const booking = row.booking;
    return {
      id: row.id,
      channel: row.channel,
      type: row.type,
      status: row.status,
      recipientPhone: row.recipientPhone,
      provider: row.provider,
      bookingId: row.bookingId,
      bookingReference: row.bookingId
        ? formatBookingReference(row.bookingId)
        : null,
      clientName: booking?.client.fullName ?? null,
      branchId: row.branchId ?? booking?.branchId ?? null,
      branchName: booking?.branch.name ?? null,
      bookingDateLabel: booking
        ? formatBookingDateLabel(booking.slot.date)
        : null,
      bookingTimeLabel: booking
        ? formatBookingTimeLabel(booking.slot.startTime)
        : null,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
      errorMessage: this.canViewErrorMessage(user)
        ? row.errorMessage
        : null,
      canRetry:
        row.status === NotificationStatus.FAILED &&
        user.permissions.includes('notifications.retry'),
    };
  }

  private async findBookingIdsMatchingCompactId(
    compactHex: string,
  ): Promise<string[]> {
    const pattern = `%${compactHex.toLowerCase()}%`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT b.id::text AS id
      FROM bookings b
      WHERE replace(lower(b.id::text), '-', '') LIKE ${pattern}
      LIMIT 50
    `;
    return rows.map((r) => r.id);
  }

  private mapDetail(row: NotificationLogDetailRow, user: DashboardJwtUser) {
    const booking = row.booking;
    const services =
      booking?.items
        .map((it) =>
          it.quantity > 1
            ? `${it.nameSnapshot} x${it.quantity}`
            : it.nameSnapshot,
        )
        .join(', ') ?? null;

    return {
      id: row.id,
      channel: row.channel,
      type: row.type,
      status: row.status,
      recipientPhone: row.recipientPhone,
      provider: row.provider,
      providerMessageId: row.providerMessageId,
      bookingId: row.bookingId,
      changeRequestId: row.changeRequestId,
      bookingReference: row.bookingId
        ? formatBookingReference(row.bookingId)
        : null,
      branchId: row.branchId ?? booking?.branchId ?? null,
      branchName: booking?.branch.name ?? null,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      errorMessage: this.canViewErrorMessage(user) ? row.errorMessage : null,
      canRetry:
        row.status === NotificationStatus.FAILED &&
        user.permissions.includes('notifications.retry'),
      client: booking
        ? {
            id: booking.client.id,
            fullName: booking.client.fullName,
            phone: booking.client.phone,
            email: booking.client.email,
          }
        : null,
      booking: booking
        ? {
            id: booking.id,
            status: booking.status,
            reference: formatBookingReference(booking.id),
            dateLabel: formatBookingDateLabel(booking.slot.date),
            timeLabel: formatBookingTimeLabel(booking.slot.startTime),
            services: services || '—',
          }
        : null,
      changeRequest: row.changeRequest
        ? {
            id: row.changeRequest.id,
            status: row.changeRequest.status,
            requestType: row.changeRequest.requestType,
            handledAt: row.changeRequest.handledAt?.toISOString() ?? null,
          }
        : null,
    };
  }
}
