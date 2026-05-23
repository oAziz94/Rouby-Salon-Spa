import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('App (e2e)', () => {
  let app: INestApplication;
  let dashboardAuthDbReady = false;

  beforeAll(async () => {
    const prisma = new PrismaClient();
    try {
      await prisma.user.findFirst({ take: 1 });
      dashboardAuthDbReady = true;
    } catch {
      dashboardAuthDbReady = false;
    } finally {
      await prisma.$disconnect();
    }
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: [{ path: 'health', method: RequestMethod.ALL }],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /health', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /api/v1/smoke', () => {
    return request(app.getHttpServer())
      .get('/api/v1/smoke')
      .expect(200)
      .expect({ ok: true, service: 'api', version: '1' });
  });

  it('GET /api/v1/client/auth/providers', () => {
    return request(app.getHttpServer())
      .get('/api/v1/client/auth/providers')
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      });
  });

  it('GET /api/v1/client/auth/oauth/google/start returns 501', () => {
    return request(app.getHttpServer())
      .get('/api/v1/client/auth/oauth/google/start')
      .expect(501)
      .expect((res) => {
        expect(res.body.code).toBe('OAUTH_NOT_CONFIGURED');
      });
  });

  it('POST /api/v1/dashboard/auth/login rejects short password (400)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/dashboard/auth/login')
      .send({ email: 'owner@alrouby.local', password: 'short' })
      .expect(400);
  });

  const itDb = dashboardAuthDbReady ? it : it.skip;

  itDb('POST /api/v1/dashboard/auth/login invalid credentials (401)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/dashboard/auth/login')
      .send({
        email: 'owner@alrouby.local',
        password: 'definitely-wrong-pass',
      })
      .expect(401);
  });

  it('GET /api/v1/dashboard/_internal/auth-probe without token (401)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/dashboard/_internal/auth-probe')
      .expect(401);
  });

  itDb('GET /api/v1/public/branches', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/branches')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  const itOwner =
    dashboardAuthDbReady && process.env.SEED_OWNER_PASSWORD ? it : it.skip;

  itOwner(
    'Sprint 2: owner GET vat + payment-policy + system settings',
    async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/dashboard/auth/login')
        .send({
          email: 'owner@alrouby.local',
          password: process.env.SEED_OWNER_PASSWORD,
        });
      expect(login.status).toBe(200);
      const token = login.body.accessToken as string;

      const vat = await request(app.getHttpServer())
        .get('/api/v1/dashboard/settings/vat')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(vat.body).toMatchObject({
        defaultTimezone: 'Africa/Cairo',
        defaultCurrency: 'EGP',
      });
      expect(typeof vat.body.defaultVatRate).toBe('number');

      const policy = await request(app.getHttpServer())
        .get('/api/v1/dashboard/settings/payment-policy')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(policy.body.paymentDepositPolicy).toBe('PAY_AT_SALON');
      expect(policy.body.defaultTimezone).toBe('Africa/Cairo');

      const sys = await request(app.getHttpServer())
        .get('/api/v1/dashboard/settings/system')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(sys.body.defaultTimezone).toBe('Africa/Cairo');
      expect(sys.body.defaultCurrency).toBe('EGP');
    },
  );

  it('Sprint 3: public catalog categories + branch-filtered services', async () => {
    const cats = await request(app.getHttpServer())
      .get('/api/v1/public/categories')
      .expect(200);
    expect(Array.isArray(cats.body.data)).toBe(true);
    expect(cats.body.data.length).toBeGreaterThan(0);

    const branchId = '00000000-0000-4000-8000-000000000001';
    const svc = await request(app.getHttpServer())
      .get(`/api/v1/public/services?branchId=${branchId}&page=1&pageSize=50`)
      .expect(200);
    const body = svc.body as {
      data: Array<{ id: string }>;
      meta: { totalItems: number };
    };
    expect(body.meta.totalItems).toBeGreaterThanOrEqual(1);
    const ids = body.data.map((s) => s.id);
    expect(ids).toContain('30000000-0000-4000-8000-000000000011');
    expect(ids).not.toContain('30000000-0000-4000-8000-000000000013');
  });

  const itReception =
    dashboardAuthDbReady && process.env.SEED_RECEPTIONIST_PASSWORD
      ? it
      : it.skip;

  itReception(
    'Sprint 3: receptionist cannot create service (403)',
    async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/dashboard/auth/login')
        .send({
          email: 'reception@alrouby.local',
          password: process.env.SEED_RECEPTIONIST_PASSWORD,
        });
      expect(login.status).toBe(200);
      const token = login.body.accessToken as string;

      await request(app.getHttpServer())
        .post('/api/v1/dashboard/services')
        .set('Authorization', `Bearer ${token}`)
        .send({
          categoryId: '30000000-0000-4000-8000-000000000001',
          name: 'Blocked',
          priceDisplayType: 'CONTACT',
          branchIds: [],
        })
        .expect(403);
    },
  );

  itOwner('Queue walk-in: empty items rejected (400)', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/dashboard/auth/login')
      .send({
        email: 'owner@alrouby.local',
        password: process.env.SEED_OWNER_PASSWORD,
      });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;
    const clientsRes = await request(app.getHttpServer())
      .get('/api/v1/dashboard/clients?page=1&pageSize=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const clientId = clientsRes.body.data[0].id as string;
    await request(app.getHttpServer())
      .post('/api/v1/dashboard/queue/walk-ins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId: '00000000-0000-4000-8000-000000000001',
        clientId,
        items: [],
      })
      .expect(400);
  });

  itOwner(
    'Queue walk-in: client not resolvable (400 WALK_IN_CLIENT_UNRESOLVED)',
    async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/dashboard/auth/login')
        .send({
          email: 'owner@alrouby.local',
          password: process.env.SEED_OWNER_PASSWORD,
        });
      expect(login.status).toBe(200);
      const token = login.body.accessToken as string;
      const res = await request(app.getHttpServer())
        .post('/api/v1/dashboard/queue/walk-ins')
        .set('Authorization', `Bearer ${token}`)
        .send({
          branchId: '00000000-0000-4000-8000-000000000001',
          clientName: 'Walk In No Phone',
          items: [
            {
              itemType: 'SERVICE_VARIANT',
              serviceId: '30000000-0000-4000-8000-000000000012',
              serviceVariantId: '30000000-0000-4000-8000-000000000021',
              quantity: 1,
            },
          ],
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('WALK_IN_CLIENT_UNRESOLVED');
    },
  );

  itOwner(
    'Queue walk-in: creates booking + queue row (bookingId, totals)',
    async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/dashboard/auth/login')
        .send({
          email: 'owner@alrouby.local',
          password: process.env.SEED_OWNER_PASSWORD,
        });
      expect(login.status).toBe(200);
      const token = login.body.accessToken as string;
      const clientsRes = await request(app.getHttpServer())
        .get('/api/v1/dashboard/clients?page=1&pageSize=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const clientId = clientsRes.body.data[0].id as string;
      const res = await request(app.getHttpServer())
        .post('/api/v1/dashboard/queue/walk-ins')
        .set('Authorization', `Bearer ${token}`)
        .send({
          branchId: '00000000-0000-4000-8000-000000000001',
          clientId,
          items: [
            {
              itemType: 'SERVICE_VARIANT',
              serviceId: '30000000-0000-4000-8000-000000000012',
              serviceVariantId: '30000000-0000-4000-8000-000000000021',
              quantity: 1,
            },
          ],
        })
        .expect(200);
      const body = res.body as { id: string; bookingId: string | null };
      expect(body.bookingId).toBeTruthy();
      const booking = await request(app.getHttpServer())
        .get(`/api/v1/dashboard/bookings/${body.bookingId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(booking.body.source).toBe('WALK_IN');
      expect(booking.body.status).toBe('ARRIVED');
      expect(Array.isArray(booking.body.items)).toBe(true);
      expect(booking.body.items.length).toBeGreaterThanOrEqual(1);
      expect(typeof booking.body.totalAmount).toBe('number');
    },
  );

  it('GET /api/v1/dashboard/reports/staff-services-revenue without token (401)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/dashboard/reports/staff-services-revenue')
      .expect(401);
  });

  itOwner('Staff services revenue report returns summary shape', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/dashboard/auth/login')
      .send({
        email: 'owner@alrouby.local',
        password: process.env.SEED_OWNER_PASSWORD,
      });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;

    const res = await request(app.getHttpServer())
      .get(
        '/api/v1/dashboard/reports/staff-services-revenue?dateFrom=2026-01-01&dateTo=2026-12-31',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body as {
      range: { timeZone: string };
      summary: {
        totalServicesDone: number;
        totalRevenue: number;
        paidRevenue: number;
        pendingRevenue: number;
      };
      staffRows: unknown[];
      charts: {
        revenueByStaff: unknown[];
        servicesCountByStaff: unknown[];
        revenueTrendByDay: unknown[];
        serviceMixByStaff: unknown[];
      };
    };

    expect(body.range.timeZone).toBe('Africa/Cairo');
    expect(typeof body.summary.totalServicesDone).toBe('number');
    expect(typeof body.summary.totalRevenue).toBe('number');
    expect(typeof body.summary.paidRevenue).toBe('number');
    expect(typeof body.summary.pendingRevenue).toBe('number');
    expect(Array.isArray(body.staffRows)).toBe(true);
    expect(Array.isArray(body.charts.revenueByStaff)).toBe(true);
    expect(Array.isArray(body.charts.servicesCountByStaff)).toBe(true);
    expect(Array.isArray(body.charts.revenueTrendByDay)).toBe(true);
    expect(Array.isArray(body.charts.serviceMixByStaff)).toBe(true);
  });
});
