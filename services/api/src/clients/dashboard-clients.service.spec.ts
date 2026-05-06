import { ForbiddenException } from '@nestjs/common';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { DashboardClientsService } from './dashboard-clients.service';

describe('DashboardClientsService', () => {
  const baseUser: DashboardJwtUser = {
    userId: 'user-1',
    email: 'manager@example.com',
    roleId: 'role-1',
    branchId: null,
    permissions: ['clients.read'],
  };

  const clientRow = {
    id: 'f4db7a3d-2549-43fd-96fe-e6bc7c0f4a81',
    fullName: 'Test Client',
    phone: '+201234567890',
    email: 'client@example.com',
    profileImageUrl: null,
    gender: null,
    birthDate: null,
    preferredBranchId: null,
    notes: 'private note',
    allergiesOrWarnings: 'allergy',
    tags: ['vip'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  it('masks contact and sensitive fields without permissions', async () => {
    const prisma = {
      client: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([clientRow]),
      },
    };
    const service = new DashboardClientsService(prisma as never);

    const res = await service.listClients(baseUser, { page: 1, pageSize: 20 });
    expect(res.data[0]).not.toHaveProperty('phone');
    expect(res.data[0]).not.toHaveProperty('email');
    expect(res.data[0]).not.toHaveProperty('notes');
    expect(res.data[0]).not.toHaveProperty('allergiesOrWarnings');
  });

  it('rejects sensitive updates without sensitive permission', async () => {
    const prisma = {
      client: {
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new DashboardClientsService(prisma as never);

    await expect(
      service.patchClient(baseUser, clientRow.id, { notes: 'new note' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
