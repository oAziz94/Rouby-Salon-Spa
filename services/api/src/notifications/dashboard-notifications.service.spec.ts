import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { DashboardNotificationsService } from './dashboard-notifications.service';

describe('DashboardNotificationsService', () => {
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const bookingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const logId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  const ownerUser: DashboardJwtUser = {
    userId: 'user-owner',
    email: 'owner@example.com',
    roleId: 'role-owner',
    branchId: null,
    allowedBranchIds: [],
    permissions: ['notifications.read', 'notifications.retry', 'audit.read'],
  };

  const branchUser: DashboardJwtUser = {
    userId: 'user-branch',
    email: 'mgr@example.com',
    roleId: 'role-mgr',
    branchId: branchA,
    allowedBranchIds: [branchA],
    permissions: ['notifications.read'],
  };

  const baseLogRow = {
    id: logId,
    branchId: branchA,
    bookingId,
    changeRequestId: null,
    channel: NotificationChannel.WHATSAPP,
    type: NotificationType.BOOKING_CONFIRMATION,
    recipientPhone: '201001234567',
    provider: 'wapilot',
    status: NotificationStatus.FAILED,
    providerMessageId: null,
    errorMessage: 'Provider timeout',
    sentAt: null,
    createdAt: new Date('2026-05-16T10:00:00.000Z'),
    updatedAt: new Date('2026-05-16T10:00:00.000Z'),
    booking: {
      id: bookingId,
      branchId: branchA,
      client: {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        fullName: 'Sara Client',
        phone: '+201001234567',
      },
      branch: { id: branchA, name: 'Maadi' },
      slot: {
        date: new Date('2026-05-20T00:00:00.000Z'),
        startTime: new Date('1970-01-01T14:00:00.000Z'),
      },
    },
  };

  function createService(
    prisma: Record<string, unknown>,
    bookingNotifications: { retryFailedNotificationLog: jest.Mock } = {
      retryFailedNotificationLog: jest.fn(),
    },
  ) {
    return new DashboardNotificationsService(
      prisma as never,
      bookingNotifications as never,
    );
  }

  it('lists logs with status and type filters', async () => {
    const findMany = jest.fn().mockResolvedValue([baseLogRow]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          notificationLog: { findMany, count },
        }),
      ),
    };
    const service = createService(prisma);

    await service.list(ownerUser, {
      page: 1,
      pageSize: 20,
      status: NotificationStatus.FAILED,
      type: NotificationType.BOOKING_CONFIRMATION,
    });

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { status: NotificationStatus.FAILED },
        { type: NotificationType.BOOKING_CONFIRMATION },
      ]),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('hides errorMessage for users without elevated permissions', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          notificationLog: {
            count: jest.fn().mockResolvedValue(1),
            findMany: jest.fn().mockResolvedValue([baseLogRow]),
          },
        }),
      ),
    };
    const service = createService(prisma);

    const res = await service.list(branchUser, { page: 1, pageSize: 20 });
    expect(res.data[0].errorMessage).toBeNull();
    expect(res.data[0].canRetry).toBe(false);
  });

  it('exposes errorMessage and canRetry for authorized users', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          notificationLog: {
            count: jest.fn().mockResolvedValue(1),
            findMany: jest.fn().mockResolvedValue([baseLogRow]),
          },
        }),
      ),
    };
    const service = createService(prisma);

    const res = await service.list(ownerUser, { page: 1, pageSize: 20 });
    expect(res.data[0].errorMessage).toBe('Provider timeout');
    expect(res.data[0].canRetry).toBe(true);
  });

  it('rejects detail when branch is outside user scope', async () => {
    const prisma = {
      notificationLog: {
        findUnique: jest.fn().mockResolvedValue({
          ...baseLogRow,
          branchId: branchB,
          changeRequest: null,
          booking: {
            ...baseLogRow.booking,
            branchId: branchB,
            branch: { id: branchB, name: 'Zamalek' },
            client: {
              id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
              fullName: 'Sara Client',
              phone: '+201001234567',
              email: null,
            },
            items: [],
            status: 'CONFIRMED',
          },
        }),
      },
      booking: {
        findUnique: jest.fn().mockResolvedValue({ branchId: branchB }),
      },
    };
    const service = createService(prisma);

    await expect(service.getById(branchUser, logId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns detail for in-scope branch user', async () => {
    const prisma = {
      notificationLog: {
        findUnique: jest.fn().mockResolvedValue({
          ...baseLogRow,
          changeRequest: null,
          booking: {
            ...baseLogRow.booking,
            status: 'CONFIRMED',
            client: {
              id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
              fullName: 'Sara Client',
              phone: '+201001234567',
              email: 'sara@example.com',
            },
            items: [{ nameSnapshot: 'Manicure', quantity: 1 }],
          },
        }),
      },
    };
    const service = createService(prisma);

    const detail = await service.getById(branchUser, logId);
    expect(detail.id).toBe(logId);
    expect(detail.client?.fullName).toBe('Sara Client');
    expect(detail.errorMessage).toBeNull();
  });

  it('retries failed notification and returns new attempt', async () => {
    const newLogId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const retry = jest.fn().mockResolvedValue({
      id: newLogId,
      status: NotificationStatus.SENT,
    });
    const prisma = {
      notificationLog: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: logId,
            status: NotificationStatus.FAILED,
            branchId: branchA,
            bookingId,
          })
          .mockResolvedValueOnce({
            ...baseLogRow,
            id: newLogId,
            status: NotificationStatus.SENT,
            errorMessage: null,
            sentAt: new Date('2026-05-16T10:05:00.000Z'),
            changeRequest: null,
            booking: {
              ...baseLogRow.booking,
              status: 'CONFIRMED',
              client: {
                id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                fullName: 'Sara Client',
                phone: '+201001234567',
                email: null,
              },
              items: [],
            },
          }),
      },
    };
    const service = createService(prisma, { retryFailedNotificationLog: retry });

    const res = await service.retry(ownerUser, logId);
    expect(retry).toHaveBeenCalledWith(logId);
    expect(res.success).toBe(true);
    expect(res.attempt.id).toBe(newLogId);
    expect(res.attempt.status).toBe(NotificationStatus.SENT);
  });

  it('rejects retry for sent notifications', async () => {
    const prisma = {
      notificationLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: logId,
          status: NotificationStatus.SENT,
          branchId: branchA,
          bookingId,
        }),
      },
    };
    const retry = jest.fn();
    const service = createService(prisma, { retryFailedNotificationLog: retry });

    await expect(service.retry(ownerUser, logId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(retry).not.toHaveBeenCalled();
  });

  it('requires notifications.retry permission to retry', async () => {
    const prisma = {
      notificationLog: {
        findUnique: jest.fn().mockResolvedValue({
          id: logId,
          status: NotificationStatus.FAILED,
          branchId: branchA,
          bookingId,
        }),
      },
    };
    const service = createService(prisma);

    await expect(service.retry(branchUser, logId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns not found for missing log on retry', async () => {
    const prisma = {
      notificationLog: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = createService(prisma);

    await expect(service.retry(ownerUser, logId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
