import type { INestApplication } from '@nestjs/common';
import {
  Api,
  BRANCH_ID,
  createApp,
  createSlot,
  ensureStaffCanDo,
  prisma,
  staffProfileFor,
  SVC_CUT,
  uniquePhone,
  USERS,
  ymdDaysFromNow,
} from './harness';

type Item = {
  id: string;
  action: string;
  title: string;
  summary: string;
  category: string;
  isOverride: boolean;
  reason: string | null;
  severity: string;
  links: {
    bookingId: string | null;
    clientId: string | null;
    invoiceId: string | null;
  };
};

/** The audit log reads like sentences, can be filtered by category and finds things by name. */
describe('audit log', () => {
  let app: INestApplication;
  let api: Api;
  const stamp = Date.now().toString(36);
  const nameA = `Auditzed Alpha ${stamp}`;
  const nameB = `Auditzed Beta ${stamp}`;
  const cutLine = { itemType: 'SERVICE', serviceId: SVC_CUT, quantity: 1 };
  let clientA = '';
  let clientAPhone = '';
  let bookingA = '';
  let bookingB = '';
  let invoiceNumberA = '';
  let paymentId = '';
  const overrideReason = 'client phoned from the car park';

  async function list(query: string) {
    const owner = await api.as('owner');
    const res = await owner.get(`/api/v1/dashboard/audit-logs?${query}`);
    expect(res.status).toBe(200);
    return {
      items: res.body.data as Item[],
      total: res.body.meta.totalItems as number,
    };
  }

  beforeAll(async () => {
    app = await createApp();
    api = new Api(app);
    const monaId = (await staffProfileFor(USERS.staff.email)).id;
    await ensureStaffCanDo(monaId, SVC_CUT);
    const rec = await api.as('receptionist');
    const owner = await api.as('owner');

    // Client A: a finished, invoiced visit with a payment that is later edited.
    clientAPhone = uniquePhone();
    const a = await prisma.client.create({
      data: {
        fullName: nameA,
        phone: clientAPhone,
        preferredBranchId: BRANCH_ID,
      },
    });
    clientA = a.id;
    const slotA = await createSlot({ capacity: 1 });
    const createdA = await rec.post('/api/v1/dashboard/bookings', {
      clientId: a.id,
      branchId: BRANCH_ID,
      slotId: slotA.id,
      source: 'PHONE',
      initialStatus: 'CONFIRMED',
      items: [cutLine],
    });
    expect(createdA.status).toBe(201);
    bookingA = createdA.body.id as string;
    const itemId = createdA.body.items[0].id as string;
    const q = await rec.post(`/api/v1/dashboard/bookings/${bookingA}/check-in`);
    expect(q.status).toBe(201);
    const queueEntryId = q.body.id as string;
    await rec.post(`/api/v1/dashboard/queue/${queueEntryId}/start`, {
      starts: [{ bookingItemId: itemId, staffProfileId: monaId }],
      overrideReason: 'integration test',
    });
    await rec.post(
      `/api/v1/dashboard/bookings/${bookingA}/service-items/${itemId}/complete`,
    );
    const fin = await rec.post(
      `/api/v1/dashboard/queue/${queueEntryId}/invoice/finalize`,
    );
    expect(fin.status).toBe(201);
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { bookingId: bookingA },
    });
    invoiceNumberA = invoice.invoiceNumber;
    const half = Math.floor(Number(invoice.totalAmount) / 2);
    const paid = await rec.post(
      `/api/v1/dashboard/queue/${queueEntryId}/payments`,
      { amount: half, method: 'CASH' },
    );
    expect(paid.status).toBe(201);
    paymentId = paid.body.payment.id as string;
    const edited = await owner.patch(
      `/api/v1/dashboard/payments/${paymentId}`,
      {
        amount: half + 1,
      },
    );
    expect(edited.status).toBe(200);

    // Client B: booked into a slot whose start has passed, with a reason (an override).
    const b = await prisma.client.create({
      data: {
        fullName: nameB,
        phone: uniquePhone(),
        preferredBranchId: BRANCH_ID,
      },
    });
    const slotB = await createSlot({ capacity: 2, date: ymdDaysFromNow(6) });
    const payloadB = {
      clientId: b.id,
      branchId: BRANCH_ID,
      slotId: slotB.id,
      source: 'PHONE',
      initialStatus: 'CONFIRMED',
      items: [cutLine],
    };
    expect(
      (await rec.post('/api/v1/dashboard/bookings', payloadB)).status,
    ).toBe(201);
    // The same client again in the same slot is refused unless a reason is given.
    const createdB = await rec.post('/api/v1/dashboard/bookings', {
      ...payloadB,
      overrideReason,
    });
    expect(createdB.status).toBe(201);
    bookingB = createdB.body.id as string;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('shows an override as a sentence with the reason', async () => {
    const { items } = await list(`bookingId=${bookingB}&limit=50`);
    const override = items.find(
      (i) => i.action === 'override.client_already_in_slot',
    );
    expect(override).toBeDefined();
    expect(override?.title).toBe('Double booking allowed');
    expect(override?.isOverride).toBe(true);
    expect(override?.category).toBe('overrides');
    expect(override?.reason).toBe(overrideReason);
    expect(override?.severity).toBe('WARNING');
    expect(override?.summary).toContain(nameB);
    expect(override?.summary).toContain(`Reason: ${overrideReason}.`);
    expect(override?.summary).not.toContain('override.');
    expect(override?.links.bookingId).toBe(bookingB);

    const only = await list(`overridesOnly=true&bookingId=${bookingB}`);
    expect(only.items.every((i) => i.isOverride)).toBe(true);
    expect(only.items.map((i) => i.action)).toContain(
      'override.client_already_in_slot',
    );
  });

  it('category=money returns the payment and not the booking entry', async () => {
    const { items } = await list(
      `category=money&clientId=${clientA}&limit=100`,
    );
    const actions = items.map((i) => i.action);
    expect(actions).toContain('payment.recorded_from_queue');
    expect(actions).toContain('payment.updated');
    expect(actions).not.toContain('booking.created');
    expect(items.every((i) => i.category === 'money')).toBe(true);

    const bookings = await list(
      `category=bookings&clientId=${clientA}&limit=100`,
    );
    expect(bookings.items.map((i) => i.action)).toContain('booking.created');
    expect(bookings.items.every((i) => i.category === 'bookings')).toBe(true);
    expect(bookings.items.map((i) => i.action)).not.toContain(
      'payment.recorded_from_queue',
    );
  });

  it('describes a payment edit with amounts and the invoice number', async () => {
    const { items } = await list(`clientId=${clientA}&limit=100`);
    const edit = items.find((i) => i.action === 'payment.updated');
    expect(edit?.title).toBe('Payment changed');
    expect(edit?.summary).toMatch(/changed a payment on invoice /);
    expect(edit?.summary).toContain(invoiceNumberA);
    expect(edit?.summary).toMatch(/from EGP [\d,.]+ to EGP [\d,.]+/);
    expect(edit?.links.invoiceId).toBeTruthy();
    expect(edit?.links.bookingId).toBe(bookingA);
    expect(edit?.links.clientId).toBe(clientA);
  });

  it('search finds a client by name, phone, invoice number and booking reference', async () => {
    const byName = await list(`search=${encodeURIComponent(nameA)}&limit=100`);
    const created = byName.items.find((i) => i.action === 'booking.created');
    expect(created?.links.bookingId).toBe(bookingA);
    expect(created?.summary).toContain(nameA);
    expect(byName.items.map((i) => i.action)).toContain('payment.updated');
    expect(byName.items.every((i) => i.links.bookingId !== bookingB)).toBe(
      true,
    );

    const byPhone = await list(
      `search=${encodeURIComponent(clientAPhone.slice(-9))}&limit=100`,
    );
    expect(byPhone.items.map((i) => i.links.bookingId)).toContain(bookingA);

    const byInvoice = await list(
      `search=${encodeURIComponent(invoiceNumberA)}&limit=100`,
    );
    expect(byInvoice.items.map((i) => i.action)).toContain('payment.updated');

    const ref = `RB-${bookingB.replace(/-/g, '').slice(-8).toUpperCase()}`;
    const byRef = await list(`search=${encodeURIComponent(ref)}&limit=100`);
    expect(byRef.items.map((i) => i.links.bookingId)).toContain(bookingB);

    const byActor = await list(`search=${encodeURIComponent('Reception')}`);
    expect(byActor.total).toBeGreaterThan(0);
  });

  it('the bookingId filter returns only that booking, with its invoice and payments', async () => {
    const a = await list(`bookingId=${bookingA}&limit=200`);
    expect(a.items.length).toBeGreaterThan(3);
    expect(a.items.every((i) => i.links.bookingId === bookingA)).toBe(true);
    expect(a.items.map((i) => i.action)).toEqual(
      expect.arrayContaining([
        'booking.created',
        'invoice.finalized_from_queue',
        'payment.updated',
      ]),
    );
    const b = await list(`bookingId=${bookingB}&limit=200`);
    expect(b.items.every((i) => i.links.bookingId === bookingB)).toBe(true);
    expect(b.items.some((i) => i.links.bookingId === bookingA)).toBe(false);
  });

  it('detail lists what changed in plain words', async () => {
    const owner = await api.as('owner');
    const { items } = await list(`clientId=${clientA}&limit=100`);
    const edit = items.find((i) => i.action === 'payment.updated');
    const res = await owner.get(`/api/v1/dashboard/audit-logs/${edit?.id}`);
    expect(res.status).toBe(200);
    const changes = res.body.changes as Array<{
      field: string;
      before: string;
      after: string;
    }>;
    const amount = changes.find((c) => c.field === 'Amount');
    expect(amount?.before).toMatch(/^EGP [\d,]+\.00$/);
    expect(amount?.after).toMatch(/^EGP [\d,]+\.00$/);
    const fields = changes.map((c) => c.field);
    expect(fields).not.toContain('Entity type');
    expect(fields).not.toContain('Severity');
    expect(res.body.links.invoiceId).toBeTruthy();
    expect(paymentId).toBeTruthy();
  });

  it('refuses a receptionist', async () => {
    const rec = await api.as('receptionist');
    expect((await rec.get('/api/v1/dashboard/audit-logs')).status).toBe(403);
    expect(
      (await rec.get(`/api/v1/dashboard/audit-logs?bookingId=${bookingA}`))
        .status,
    ).toBe(403);
  });
});
