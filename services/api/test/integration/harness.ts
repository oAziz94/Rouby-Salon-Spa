import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BookingSlotStatus, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/all-exceptions.filter';
import { requestIdMiddleware } from '../../src/common/request-id.middleware';
import { WapilotWhatsAppClient } from '../../src/wapilot/wapilot-whatsapp.client';
import { TEST_PASSWORDS } from './global-setup';

export const BRANCH_ID = '00000000-0000-4000-8000-000000000001';
/** Seeded catalog ids (prisma/seed.ts). */
export const SVC_CUT = '30000000-0000-4000-8000-000000000011';
export const SVC_MANI = '30000000-0000-4000-8000-000000000014';

export const USERS = {
  owner: { email: 'owner@alrouby.local', password: TEST_PASSWORDS.owner },
  receptionist: {
    email: 'reception@alrouby.local',
    password: TEST_PASSWORDS.receptionist,
  },
  staff: { email: 'mona.staff@alrouby.local', password: TEST_PASSWORDS.staff },
} as const;

export type Role = keyof typeof USERS;

export const prisma = new PrismaClient();

/**
 * Same wiring as src/main.ts so the tests see real validation, prefixes and error shapes.
 * `whatsapp` replaces the Wapilot HTTP client: messages are built by the real code and
 * captured instead of sent.
 */
export async function createApp(
  opts: { whatsapp?: Pick<WapilotWhatsAppClient, 'sendTextMessage'> } = {},
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (opts.whatsapp) {
    builder = builder
      .overrideProvider(WapilotWhatsAppClient)
      .useValue(opts.whatsapp);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'health/ready', method: RequestMethod.ALL },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

export class Api {
  private readonly tokens = new Map<Role, string>();
  constructor(readonly app: INestApplication) {}

  get http() {
    return request(this.app.getHttpServer());
  }

  async token(role: Role): Promise<string> {
    const cached = this.tokens.get(role);
    if (cached) return cached;
    const res = await this.http
      .post('/api/v1/dashboard/auth/login')
      .send(USERS[role]);
    if (res.status !== 200) {
      throw new Error(
        `login as ${role} failed: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    const t = (res.body as { accessToken: string }).accessToken;
    this.tokens.set(role, t);
    return t;
  }

  async as(role: Role) {
    const t = await this.token(role);
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${t}`);
    return {
      get: (p: string) => auth(this.http.get(p)),
      post: (p: string, body?: unknown) =>
        auth(this.http.post(p)).send(body ?? {}),
      patch: (p: string, body?: unknown) =>
        auth(this.http.patch(p)).send(body ?? {}),
      delete: (p: string) => auth(this.http.delete(p)),
    };
  }
}

let counter = 0;
/** Unique Egyptian mobile per call so client lookups never collide across runs. */
export function uniquePhone(): string {
  counter += 1;
  const n = (Date.now() % 10_000_000) * 10 + (counter % 10);
  return `+2010${String(n).padStart(8, '0').slice(-8)}`;
}

export function ymdDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A fresh slot (never shared between tests) with the given capacity. */
export async function createSlot(opts: {
  date?: string;
  startTime?: string;
  endTime?: string;
  capacity?: number;
  status?: BookingSlotStatus;
  onlineBookable?: boolean;
}) {
  const date = opts.date ?? ymdDaysFromNow(5);
  const start =
    opts.startTime ?? `${String(9 + (counter++ % 10)).padStart(2, '0')}:00:00`;
  const end =
    opts.endTime ??
    `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00:00`;
  return prisma.bookingSlot.create({
    data: {
      branchId: BRANCH_ID,
      date: new Date(`${date}T00:00:00.000Z`),
      startTime: new Date(`1970-01-01T${start}.000Z`),
      endTime: new Date(`1970-01-01T${end}.000Z`),
      capacity: opts.capacity ?? 1,
      bookedCount: 0,
      status: opts.status ?? BookingSlotStatus.AVAILABLE,
      isOnlineBookable: opts.onlineBookable ?? true,
      notes: 'integration-test',
    },
  });
}

export async function createClient(name = 'Test Client') {
  return prisma.client.create({
    data: {
      fullName: name,
      phone: uniquePhone(),
      preferredBranchId: BRANCH_ID,
    },
  });
}

export async function staffProfileFor(email: string) {
  const row = await prisma.staffProfile.findFirstOrThrow({
    where: { user: { email }, branchId: BRANCH_ID },
    select: { id: true, displayName: true },
  });
  return row;
}

export async function ensureStaffCanDo(
  staffProfileId: string,
  serviceId: string,
) {
  await prisma.staffProfileService.upsert({
    where: { staffProfileId_serviceId: { staffProfileId, serviceId } },
    create: { staffProfileId, serviceId },
    update: {},
  });
}
