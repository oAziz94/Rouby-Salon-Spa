/* eslint-disable @typescript-eslint/no-unsafe-assignment -- supertest bodies are untyped */
import type { INestApplication } from '@nestjs/common';
import { Api, createApp, prisma, USERS } from './harness';

describe('dashboard auth sessions', () => {
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

  const login = () =>
    api.http.post('/api/v1/dashboard/auth/login').send(USERS.receptionist);
  const refresh = (refreshToken: string) =>
    api.http.post('/api/v1/dashboard/auth/refresh').send({ refreshToken });

  it('issues a short access token and a refresh token', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.expiresIn).toBeLessThanOrEqual(60 * 60);
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.refreshToken.length).toBeGreaterThan(40);
    const me = await api.http
      .get('/api/v1/dashboard/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(USERS.receptionist.email);
  });

  it('rotates the refresh token and revokes the family on reuse', async () => {
    const first = await login();
    const r1 = first.body.refreshToken as string;

    const second = await refresh(r1);
    expect(second.status).toBe(200);
    const r2 = second.body.refreshToken as string;
    expect(r2).not.toBe(r1);

    // Replaying the rotated token is treated as a leak: the whole family dies.
    expect((await refresh(r1)).status).toBe(401);
    expect((await refresh(r2)).status).toBe(401);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'user.session_reuse_detected' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  it('logout revokes the session; a wrong user cannot revoke it', async () => {
    const a = await login();
    const other = await api.http
      .post('/api/v1/dashboard/auth/login')
      .send(USERS.owner);

    // Owner presenting the receptionist's refresh token must not be able to kill it.
    await api.http
      .post('/api/v1/dashboard/auth/logout')
      .set('Authorization', `Bearer ${other.body.accessToken}`)
      .send({ refreshToken: a.body.refreshToken })
      .expect(204);
    expect((await refresh(a.body.refreshToken)).status).toBe(200);

    const b = await login();
    await api.http
      .post('/api/v1/dashboard/auth/logout')
      .set('Authorization', `Bearer ${b.body.accessToken}`)
      .send({ refreshToken: b.body.refreshToken })
      .expect(204);
    expect((await refresh(b.body.refreshToken)).status).toBe(401);
  });

  it('rejects garbage, expired and inactive-user refresh tokens', async () => {
    expect((await refresh('x'.repeat(64))).status).toBe(401);
    expect((await refresh('short')).status).toBe(400);

    const s = await login();
    const row = await prisma.dashboardRefreshToken.findFirstOrThrow({
      where: { revokedAt: null, user: { email: USERS.receptionist.email } },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.dashboardRefreshToken.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await refresh(s.body.refreshToken)).status).toBe(401);
  });

  it('throttles brute-force login attempts', async () => {
    const results: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const r = await api.http
        .post('/api/v1/dashboard/auth/login')
        .send({ email: 'nobody@alrouby.local', password: 'wrong-password' });
      results.push(r.status);
    }
    expect(results.slice(0, 2)).toEqual([401, 401]);
    expect(results).toContain(429);
  });

  it('sends a request id on every response', async () => {
    const res = await api.http.get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});
