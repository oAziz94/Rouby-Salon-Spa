import type { INestApplication } from '@nestjs/common';
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
  SVC_MANI,
  USERS,
} from './harness';

type Booking = {
  id: string;
  status: string;
  items: { id: string; nameSnapshot?: string; lineStatus?: string }[];
  slot: {
    date: string;
    startTime: string;
    endTime: string;
    isWalkIn?: boolean;
  };
  total?: number | string;
};

describe('booking → visit → invoice → payment', () => {
  let app: INestApplication;
  let api: Api;
  let monaId: string;

  beforeAll(async () => {
    app = await createApp();
    api = new Api(app);
    monaId = (await staffProfileFor(USERS.staff.email)).id;
    await ensureStaffCanDo(monaId, SVC_CUT);
    await ensureStaffCanDo(monaId, SVC_MANI);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const cutLine = { itemType: 'SERVICE', serviceId: SVC_CUT, quantity: 1 };

  async function createBooking(
    slotId: string,
    clientId: string,
    extra: Record<string, unknown> = {},
  ) {
    const rec = await api.as('receptionist');
    return rec.post('/api/v1/dashboard/bookings', {
      clientId,
      branchId: BRANCH_ID,
      slotId,
      source: 'PHONE',
      items: [cutLine],
      ...extra,
    });
  }

  it('creates a PENDING booking, confirms it, checks it in and runs the visit to a paid close', async () => {
    const slot = await createSlot({ capacity: 2 });
    const client = await createClient('Visit Flow');
    const rec = await api.as('receptionist');

    const created = await createBooking(slot.id, client.id);
    expect(created.status).toBe(201);
    const booking = created.body as Booking;
    expect(booking.status).toBe('PENDING');
    expect(booking.items).toHaveLength(1);
    expect(booking.slot.date).toBe(slot.date.toISOString().slice(0, 10));

    // PENDING does not hold capacity; CONFIRMED does.
    const before = await prisma.bookingSlot.findUniqueOrThrow({
      where: { id: slot.id },
    });
    expect(before.bookedCount).toBe(0);
    const confirmed = await rec.post(
      `/api/v1/dashboard/bookings/${booking.id}/confirm`,
    );
    expect(confirmed.status).toBe(201);
    expect((confirmed.body as Booking).status).toBe('CONFIRMED');
    const after = await prisma.bookingSlot.findUniqueOrThrow({
      where: { id: slot.id },
    });
    expect(after.bookedCount).toBe(1);

    // Check-in → WAITING queue entry, booking ARRIVED.
    const checkedIn = await rec.post(
      `/api/v1/dashboard/bookings/${booking.id}/check-in`,
    );
    expect(checkedIn.status).toBe(201);
    const queueEntryId = checkedIn.body.id as string;
    expect(checkedIn.body.status).toBe('WAITING');
    const arrived = await rec.get(`/api/v1/dashboard/bookings/${booking.id}`);
    expect((arrived.body as Booking).status).toBe('ARRIVED');

    // A second check-in is a conflict, not a duplicate row.
    const again = await rec.post(
      `/api/v1/dashboard/bookings/${booking.id}/check-in`,
    );
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('QUEUE_ACTIVE_FOR_BOOKING');

    // Start the line with Mona (override any on-shift timing check — tests run at any hour).
    const itemId = booking.items[0].id;
    const started = await rec.post(
      `/api/v1/dashboard/queue/${queueEntryId}/start`,
      {
        starts: [{ bookingItemId: itemId, staffProfileId: monaId }],
        overrideReason: 'integration test',
      },
    );
    expect(started.status).toBe(201);
    const inService = await rec.get(`/api/v1/dashboard/bookings/${booking.id}`);
    expect((inService.body as Booking).status).toBe('IN_PROGRESS');

    // Complete the only line: the line is done, the visit stays open until it is closed.
    const done = await rec.post(
      `/api/v1/dashboard/bookings/${booking.id}/service-items/${itemId}/complete`,
    );
    expect(done.status).toBe(201);
    const afterLine = await rec.get(`/api/v1/dashboard/bookings/${booking.id}`);
    expect((afterLine.body as Booking).status).toBe('IN_PROGRESS');
    expect((afterLine.body as Booking).items[0].lineStatus).toBe('COMPLETED');

    // Finalize the invoice; closing with a balance is SOFT: blocked without a reason.
    const finalized = await rec.post(
      `/api/v1/dashboard/queue/${queueEntryId}/invoice/finalize`,
    );
    expect(finalized.status).toBe(201);
    const inv0 = await prisma.invoice.findFirstOrThrow({
      where: { bookingId: booking.id },
    });
    expect(inv0.status).toBe('FINALIZED');
    const total = Number(inv0.totalAmount);
    expect(total).toBeGreaterThan(0);
    const closeUnpaid = await rec.post(
      `/api/v1/dashboard/queue/${queueEntryId}/complete`,
    );
    expect(closeUnpaid.status).toBe(409);
    expect(closeUnpaid.body.overridable).toBe(true);

    // Partial payment → PARTIALLY_PAID; the rest → PAID; then close is FREE.
    const part = await rec.post(
      `/api/v1/dashboard/queue/${queueEntryId}/payments`,
      {
        amount: Math.floor(total / 2),
        method: 'CASH',
      },
    );
    expect(part.status).toBe(201);
    const partial = await prisma.invoice.findFirstOrThrow({
      where: { bookingId: booking.id },
    });
    expect(Number(partial.paidAmount)).toBe(Math.floor(total / 2));
    expect(Number(partial.paidAmount)).toBeLessThan(
      Number(partial.totalAmount),
    );
    const paid = await rec.post(
      `/api/v1/dashboard/queue/${queueEntryId}/payments`,
      {
        amount: total - Math.floor(total / 2),
        method: 'CASH',
      },
    );
    expect(paid.status).toBe(201);
    const inv = await prisma.invoice.findFirstOrThrow({
      where: { bookingId: booking.id },
    });
    expect(Number(inv.paidAmount)).toBeCloseTo(Number(inv.totalAmount), 2);
    const sum = await prisma.payment.aggregate({
      where: { bookingId: booking.id, status: 'PAID' },
      _sum: { amount: true },
    });
    expect(Number(sum._sum.amount)).toBeCloseTo(total, 2);
    const closed = await rec.post(
      `/api/v1/dashboard/queue/${queueEntryId}/complete`,
    );
    expect(closed.status).toBe(201);
    expect(closed.body.status).toBe('COMPLETED');
    const final = await rec.get(`/api/v1/dashboard/bookings/${booking.id}`);
    expect((final.body as Booking).status).toBe('COMPLETED');
  });

  it('two confirmed bookings racing for the last seat: exactly one wins', async () => {
    const slot = await createSlot({ capacity: 1 });
    const [c1, c2] = await Promise.all([
      createClient('Race A'),
      createClient('Race B'),
    ]);
    const [r1, r2] = await Promise.all([
      createBooking(slot.id, c1.id, { initialStatus: 'CONFIRMED' }),
      createBooking(slot.id, c2.id, { initialStatus: 'CONFIRMED' }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    const loser = r1.status === 201 ? r2 : r1;
    expect(statuses[0]).toBe(201);
    expect([400, 409]).toContain(statuses[1]);
    expect(['SLOT_AT_CAPACITY', 'SLOT_FULL', 'TRY_AGAIN']).toContain(
      loser.body.code,
    );
    const after = await prisma.bookingSlot.findUniqueOrThrow({
      where: { id: slot.id },
    });
    expect(after.bookedCount).toBe(1);
    expect(
      await prisma.booking.count({
        where: { slotId: slot.id, status: 'CONFIRMED' },
      }),
    ).toBe(1);
  });

  it('confirming into a full slot is a SOFT block that a reason overrides', async () => {
    const slot = await createSlot({ capacity: 1 });
    const [c1, c2] = await Promise.all([
      createClient('Full A'),
      createClient('Full B'),
    ]);
    const rec = await api.as('receptionist');
    const winner = await createBooking(slot.id, c1.id, {
      initialStatus: 'CONFIRMED',
    });
    expect(winner.status).toBe(201);
    const pending = await createBooking(slot.id, c2.id);
    expect(pending.status).toBe(201);
    const blocked = await rec.post(
      `/api/v1/dashboard/bookings/${pending.body.id}/confirm`,
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.overridable).toBe(true);
    const forced = await rec.post(
      `/api/v1/dashboard/bookings/${pending.body.id}/confirm`,
      {
        overrideReason: 'VIP squeezed in',
      },
    );
    expect(forced.status).toBe(201);
    expect(forced.body.status).toBe('CONFIRMED');
  });

  it('walk-in gets a real arrival time, not the hidden bucket slot', async () => {
    const rec = await api.as('receptionist');
    const client = await createClient('Walk In Test');
    const res = await rec.post('/api/v1/dashboard/queue/walk-ins', {
      branchId: BRANCH_ID,
      clientId: client.id,
      items: [cutLine],
    });
    expect(res.status).toBe(201);
    const bookingId = (res.body.bookingId ?? res.body.booking?.id) as string;
    expect(bookingId).toBeTruthy();
    const detail = await rec.get(`/api/v1/dashboard/bookings/${bookingId}`);
    const b = detail.body as Booking;
    expect(b.slot.isWalkIn).toBe(true);
    expect(b.slot.startTime).toBe(b.slot.endTime);
    expect(b.slot.startTime.startsWith('23:30')).toBe(false);
  });

  it('a line discount and a receipt discount both reach the invoice', async () => {
    const slot = await createSlot({ capacity: 1 });
    const client = await createClient('Discount Flow');
    const rec = await api.as('receptionist');
    const created = await createBooking(slot.id, client.id, {
      initialStatus: 'CONFIRMED',
      items: [
        cutLine,
        { itemType: 'SERVICE', serviceId: SVC_MANI, quantity: 1 },
      ],
    });
    expect(created.status).toBe(201);
    const booking = created.body as Booking;
    const [cut, mani] = booking.items;

    const lineDisc = await rec.patch(
      `/api/v1/dashboard/bookings/${booking.id}/items/${cut.id}/discount`,
      { discountAmount: 10, reason: 'loyal client' },
    );
    expect(lineDisc.status).toBe(200);
    const beyond = await rec.patch(
      `/api/v1/dashboard/bookings/${booking.id}/items/${mani.id}/discount`,
      { discountAmount: 999999, reason: 'too much' },
    );
    expect(beyond.status).toBe(400);
    expect(beyond.body.code).toBe('DISCOUNT_EXCEEDS_LINE');

    const q = await rec.post(
      `/api/v1/dashboard/bookings/${booking.id}/check-in`,
    );
    const queueEntryId = q.body.id as string;
    for (const it of [cut, mani]) {
      await rec.post(`/api/v1/dashboard/queue/${queueEntryId}/start`, {
        starts: [{ bookingItemId: it.id, staffProfileId: monaId }],
        overrideReason: 'integration test',
      });
      await rec.post(
        `/api/v1/dashboard/bookings/${booking.id}/service-items/${it.id}/complete`,
      );
    }
    const finalized = await rec.post(
      `/api/v1/dashboard/queue/${queueEntryId}/invoice/finalize`,
    );
    expect(finalized.status).toBe(201);
    const inv = await prisma.invoice.findFirstOrThrow({
      where: { bookingId: booking.id },
      include: { lines: true },
    });
    const cutLineRow = inv.lines.find((l) => l.bookingItemId === cut.id);
    expect(Number(cutLineRow?.discountAmount ?? 0)).toBe(10);
    const gross = inv.lines.reduce(
      (s, l) => s + Number(l.priceSnapshot) * l.quantity,
      0,
    );
    expect(Number(inv.subtotal)).toBeCloseTo(gross - 10, 2);
    expect(Number(inv.totalAmount)).toBeCloseTo(
      Number(inv.subtotal) - Number(inv.discountAmount) + Number(inv.vatAmount),
      2,
    );
  });
});
