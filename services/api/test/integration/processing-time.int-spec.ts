import type { INestApplication } from '@nestjs/common';
import { PriceDisplayType, Prisma } from '@prisma/client';
import {
  Api,
  BRANCH_ID,
  createApp,
  createClient,
  createSlot,
  ensureStaffCanDo,
  prisma,
  staffProfileFor,
  SVC_CUT,
  USERS,
} from './harness';

const CAT_HAIR = '30000000-0000-4000-8000-000000000001';

type StartResponse = {
  code?: string;
  overridable?: boolean;
  issues?: { code: string }[];
};

describe('processing time: stylist is free while colour develops', () => {
  let app: INestApplication;
  let api: Api;
  let monaId: string;
  let colourId: string;

  beforeAll(async () => {
    app = await createApp();
    api = new Api(app);
    monaId = (await staffProfileFor(USERS.staff.email)).id;
    // Earlier (failed) local runs may have left Mona mid-service; a fresh CI database has none.
    await prisma.bookingItem.updateMany({
      where: { staffProfileId: monaId, lineStatus: 'IN_PROGRESS' },
      data: { lineStatus: 'COMPLETED', completedAt: new Date() },
    });
    const colour = await prisma.service.create({
      data: {
        categoryId: CAT_HAIR,
        name: `Colour (processing) ${Date.now()}`,
        priceDisplayType: PriceDisplayType.FIXED,
        basePrice: new Prisma.Decimal('900'),
        durationMinutes: 90,
        processingMinutes: 45,
        processingStartsAfterMinutes: 0,
        branches: { create: { branchId: BRANCH_ID } },
      },
    });
    colourId = colour.id;
    await ensureStaffCanDo(monaId, colourId);
    await ensureStaffCanDo(monaId, SVC_CUT);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Confirm + check in a one-line booking and start the line with Mona; returns ids. */
  async function startVisit(serviceId: string, override = true) {
    const rec = await api.as('receptionist');
    const slot = await createSlot({ capacity: 1 });
    const client = await createClient('Processing');
    const created = await rec.post('/api/v1/dashboard/bookings', {
      clientId: client.id,
      branchId: BRANCH_ID,
      slotId: slot.id,
      source: 'PHONE',
      initialStatus: 'CONFIRMED',
      items: [{ itemType: 'SERVICE', serviceId, quantity: 1 }],
    });
    expect(created.status).toBe(201);
    const bookingId = created.body.id as string;
    const itemId = created.body.items[0].id as string;
    const q = await rec.post(
      `/api/v1/dashboard/bookings/${bookingId}/check-in`,
    );
    expect(q.status).toBe(201);
    const queueEntryId = q.body.id as string;
    const start = await rec.post(
      `/api/v1/dashboard/queue/${queueEntryId}/start`,
      {
        starts: [{ bookingItemId: itemId, staffProfileId: monaId }],
        ...(override ? { overrideReason: 'integration test' } : {}),
      },
    );
    return { bookingId, itemId, queueEntryId, start };
  }

  async function finish(bookingId: string, itemId: string) {
    const rec = await api.as('receptionist');
    await rec.post(
      `/api/v1/dashboard/bookings/${bookingId}/service-items/${itemId}/complete`,
    );
  }

  it('a hands-on service in progress makes the stylist busy for the next client', async () => {
    const a = await startVisit(SVC_CUT);
    expect(a.start.status).toBe(201);
    const b = await startVisit(SVC_CUT, false);
    expect(b.start.status).toBe(409);
    const body = b.start.body as StartResponse;
    expect(body.overridable).toBe(true);
    const codes = [body.code, ...(body.issues ?? []).map((i) => i.code)];
    expect(codes).toContain('STAFF_BUSY');
    await finish(a.bookingId, a.itemId);
    await finish(b.bookingId, b.itemId).catch(() => undefined);
  });

  it('a service in its processing window leaves the stylist free', async () => {
    const a = await startVisit(colourId);
    expect(a.start.status).toBe(201);
    const b = await startVisit(SVC_CUT, false);
    // Shift/qualification may still object depending on the hour the suite runs; what must
    // never appear is STAFF_BUSY, because the colour is developing.
    if (b.start.status === 409) {
      const body = b.start.body as StartResponse;
      const codes = [body.code, ...(body.issues ?? []).map((i) => i.code)];
      expect(codes).not.toContain('STAFF_BUSY');
    } else {
      expect(b.start.status).toBe(201);
    }
    await finish(a.bookingId, a.itemId);
    if (b.start.status === 201) await finish(b.bookingId, b.itemId);
  });

  it('the overview counts a processing stylist as available', async () => {
    const a = await startVisit(colourId);
    expect(a.start.status).toBe(201);
    const owner = await api.as('owner');
    const res = await owner.get(
      `/api/v1/dashboard/reports/overview?branchId=${BRANCH_ID}`,
    );
    expect(res.status).toBe(200);
    const rows = (res.body.staffToday?.staffToday ?? []) as {
      staffProfileId: string;
      status: string;
      processingNow?: number;
    }[];
    const mona = rows.find((r) => r.staffProfileId === monaId);
    expect(mona).toBeDefined();
    expect(mona?.status).not.toBe('busy');
    expect(mona?.processingNow).toBeGreaterThanOrEqual(1);
    await finish(a.bookingId, a.itemId);
  });
});
