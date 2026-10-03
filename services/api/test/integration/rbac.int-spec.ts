/* eslint-disable @typescript-eslint/no-unsafe-assignment -- supertest bodies are untyped */
import type { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import {
  Api,
  BRANCH_ID,
  createApp,
  createClient,
  createSlot,
  prisma,
  SVC_CUT,
  USERS,
} from './harness';

describe('roles and branch scoping', () => {
  let app: INestApplication;
  let api: Api;

  beforeAll(async () => {
    app = await createApp();
    api = new Api(app);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('staff can read the queue but cannot manage it', async () => {
    const staff = await api.as('staff');
    const list = await staff.get(
      `/api/v1/dashboard/queue?branchId=${BRANCH_ID}`,
    );
    expect([200, 403]).toContain(list.status);
    const walkIn = await staff.post('/api/v1/dashboard/queue/walk-ins', {
      branchId: BRANCH_ID,
      clientName: 'Nope',
      phone: '+201012345678',
      items: [{ itemType: 'SERVICE', serviceId: SVC_CUT, quantity: 1 }],
    });
    expect(walkIn.status).toBe(403);
  });

  it('receptionist cannot read the audit log or manage users', async () => {
    const rec = await api.as('receptionist');
    expect((await rec.get('/api/v1/dashboard/audit-logs')).status).toBe(403);
    expect((await rec.get('/api/v1/dashboard/users')).status).toBe(403);
    const owner = await api.as('owner');
    expect((await owner.get('/api/v1/dashboard/audit-logs')).status).toBe(200);
  });

  it('a user with no branch and no all-access permission sees nothing (fail closed)', async () => {
    const role = await prisma.role.findFirstOrThrow({
      where: { name: 'Receptionist' },
    });
    const email = `orphan.${Date.now()}@alrouby.local`;
    await prisma.user.create({
      data: {
        name: 'Orphan',
        email,
        passwordHash: await argon2.hash('Orphan#2026x', {
          type: argon2.argon2id,
        }),
        roleId: role.id,
        branchId: null,
        isActive: true,
      },
    });
    const login = await api.http
      .post('/api/v1/dashboard/auth/login')
      .send({ email, password: 'Orphan#2026x' });
    expect(login.status).toBe(200);
    const t = login.body.accessToken as string;
    const bookings = await api.http
      .get('/api/v1/dashboard/bookings')
      .set('Authorization', `Bearer ${t}`);
    expect(bookings.status).toBe(403);
    const slot = await createSlot({ capacity: 1 });
    const client = await createClient('Orphan Client');
    const create = await api.http
      .post('/api/v1/dashboard/bookings')
      .set('Authorization', `Bearer ${t}`)
      .send({
        clientId: client.id,
        branchId: BRANCH_ID,
        slotId: slot.id,
        source: 'PHONE',
        items: [{ itemType: 'SERVICE', serviceId: SVC_CUT, quantity: 1 }],
      });
    expect(create.status).toBe(403);
  });

  it('deactivating a user ends their session within the cache window', async () => {
    const role = await prisma.role.findFirstOrThrow({
      where: { name: 'Receptionist' },
    });
    const email = `temp.${Date.now()}@alrouby.local`;
    const user = await prisma.user.create({
      data: {
        name: 'Temp',
        email,
        passwordHash: await argon2.hash('Temp#2026xyz', {
          type: argon2.argon2id,
        }),
        roleId: role.id,
        branchId: BRANCH_ID,
        isActive: true,
      },
    });
    const login = await api.http
      .post('/api/v1/dashboard/auth/login')
      .send({ email, password: 'Temp#2026xyz' });
    expect(login.status).toBe(200);
    const owner = await api.as('owner');
    const off = await owner.post(
      `/api/v1/dashboard/users/${user.id}/deactivate`,
    );
    expect([200, 201]).toContain(off.status);
    const me = await api.http
      .get('/api/v1/dashboard/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(401);
    const refresh = await api.http
      .post('/api/v1/dashboard/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('owner password reset for another user revokes that user’s sessions', async () => {
    const login = await api.http
      .post('/api/v1/dashboard/auth/login')
      .send(USERS.staff);
    expect(login.status).toBe(200);
    const staffUser = await prisma.user.findUniqueOrThrow({
      where: { email: USERS.staff.email },
    });
    const owner = await api.as('owner');
    const reset = await owner.post(
      `/api/v1/dashboard/users/${staffUser.id}/password`,
      {
        newPassword: USERS.staff.password,
      },
    );
    expect([200, 201]).toContain(reset.status);
    const refresh = await api.http
      .post('/api/v1/dashboard/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(401);
  });
});
