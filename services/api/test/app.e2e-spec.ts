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
});
