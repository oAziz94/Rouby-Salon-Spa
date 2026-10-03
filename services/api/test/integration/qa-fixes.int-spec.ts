/* eslint-disable @typescript-eslint/no-unsafe-assignment -- supertest bodies are untyped */
import type { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
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
  uniquePhone,
  USERS,
  ymdDaysFromNow,
} from './harness';

/** Fixes from the QA run: permissions, payment safety, booking and slot rules. */
describe('QA fixes', () => {
  let app: INestApplication;
  let api: Api;
  let monaId: string;

  beforeAll(async () => {
    app = await createApp();
    api = new Api(app);
    monaId = (await staffProfileFor(USERS.staff.email)).id;
    await ensureStaffCanDo(monaId, SVC_CUT);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const cutLine = { itemType: 'SERVICE', serviceId: SVC_CUT, quantity: 1 };

  function cairoToday(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
    }).format(new Date());
  }

  async function book(
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
      initialStatus: 'CONFIRMED',
      items: [cutLine],
      ...extra,
    });
  }

  /** Booking checked in and (optionally) finished and invoiced. */
  async function visit(opts: { finish: boolean }) {
    const rec = await api.as('receptionist');
    const client = await createClient('QA Visit');
    const slot = await createSlot({ capacity: 1 });
    const created = await book(slot.id, client.id);
    expect(created.status).toBe(201);
    const bookingId = created.body.id as string;
    const itemId = created.body.items[0].id as string;
    const q = await rec.post(
      `/api/v1/dashboard/bookings/${bookingId}/check-in`,
    );
    expect(q.status).toBe(201);
    const queueEntryId = q.body.id as string;
    if (opts.finish) {
      await rec.post(`/api/v1/dashboard/queue/${queueEntryId}/start`, {
        starts: [{ bookingItemId: itemId, staffProfileId: monaId }],
        overrideReason: 'integration test',
      });
      await rec.post(
        `/api/v1/dashboard/bookings/${bookingId}/service-items/${itemId}/complete`,
      );
      const fin = await rec.post(
        `/api/v1/dashboard/queue/${queueEntryId}/invoice/finalize`,
      );
      expect(fin.status).toBe(201);
    }
    const invoice = opts.finish
      ? await prisma.invoice.findFirstOrThrow({ where: { bookingId } })
      : null;
    return {
      rec,
      client,
      slot,
      bookingId,
      itemId,
      queueEntryId,
      total: invoice ? Number(invoice.totalAmount) : 0,
    };
  }

  async function paidTotal(bookingId: string) {
    const sum = await prisma.payment.aggregate({
      where: { bookingId, status: 'PAID' },
      _sum: { amount: true },
    });
    return Number(sum._sum.amount ?? 0);
  }

  describe('1. receptionist can register clients', () => {
    it('creates a client and a walk-in for a new phone number', async () => {
      const rec = await api.as('receptionist');
      const created = await rec.post('/api/v1/dashboard/clients', {
        fullName: 'Registered By Reception',
        phone: uniquePhone(),
        preferredBranchId: BRANCH_ID,
      });
      expect(created.status).toBe(201);

      const walkIn = await rec.post('/api/v1/dashboard/queue/walk-ins', {
        branchId: BRANCH_ID,
        clientName: 'Brand New Walk-in',
        phone: uniquePhone(),
        items: [cutLine],
      });
      expect(walkIn.status).toBe(201);
    });

    it('walk-in errors say what is wrong: missing phone vs missing permission', async () => {
      const rec = await api.as('receptionist');
      const noPhone = await rec.post('/api/v1/dashboard/queue/walk-ins', {
        branchId: BRANCH_ID,
        clientName: 'No Phone',
        items: [cutLine],
      });
      expect(noPhone.status).toBe(400);
      expect(noPhone.body.code).toBe('WALK_IN_CLIENT_UNRESOLVED');
      expect(noPhone.body.message).toContain('phone number');

      // A role like Receptionist but without clients.create.
      const base = await prisma.role.findFirstOrThrow({
        where: { name: 'Receptionist' },
        include: { rolePermissions: { include: { permission: true } } },
      });
      const name = `NoClientCreate ${Date.now()}`;
      const role = await prisma.role.create({
        data: {
          name,
          level: base.level,
          rolePermissions: {
            create: base.rolePermissions
              .filter((rp) => rp.permission.key !== 'clients.create')
              .map((rp) => ({ permissionId: rp.permissionId })),
          },
        },
      });
      const email = `nocreate.${Date.now()}@alrouby.local`;
      await prisma.user.create({
        data: {
          name: 'No Create',
          email,
          passwordHash: await argon2.hash('NoCreate#2026x', {
            type: argon2.argon2id,
          }),
          roleId: role.id,
          branchId: BRANCH_ID,
          isActive: true,
        },
      });
      const login = await api.http
        .post('/api/v1/dashboard/auth/login')
        .send({ email, password: 'NoCreate#2026x' });
      expect(login.status).toBe(200);
      const res = await api.http
        .post('/api/v1/dashboard/queue/walk-ins')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({
          branchId: BRANCH_ID,
          clientName: 'Unregistered',
          phone: uniquePhone(),
          items: [cutLine],
        });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('WALK_IN_CLIENT_CREATE_FORBIDDEN');
      expect(res.body.message).toContain('cannot register new clients');
    });
  });

  describe('2. concurrent payments', () => {
    it('three parallel full payments: one succeeds, paid never exceeds total', async () => {
      const v = await visit({ finish: true });
      const results = await Promise.all(
        [1, 2, 3].map(() =>
          v.rec.post(`/api/v1/dashboard/queue/${v.queueEntryId}/payments`, {
            amount: v.total,
            method: 'CASH',
          }),
        ),
      );
      const ok = results.filter((r) => r.status === 201);
      const refused = results.filter((r) => r.status !== 201);
      expect(ok).toHaveLength(1);
      expect(refused).toHaveLength(2);
      for (const r of refused) {
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('PAYMENT_EXCEEDS_REMAINING');
      }
      expect(await paidTotal(v.bookingId)).toBeCloseTo(v.total, 2);
      const inv = await prisma.invoice.findFirstOrThrow({
        where: { bookingId: v.bookingId },
      });
      expect(Number(inv.remainingAmount)).toBe(0);
    });
  });

  describe('3. editing a payment', () => {
    it('needs payments.refund, keeps the total, protects loyalty payments and is audited', async () => {
      const v = await visit({ finish: true });
      const half = Math.floor(v.total / 2);
      const paid = await v.rec.post(
        `/api/v1/dashboard/queue/${v.queueEntryId}/payments`,
        { amount: half, method: 'CASH' },
      );
      expect(paid.status).toBe(201);
      const paymentId = paid.body.payment.id as string;
      const url = `/api/v1/dashboard/payments/${paymentId}`;

      // Reception only has payments.record.
      const asRec = await v.rec.patch(url, { amount: 1 });
      expect(asRec.status).toBe(403);

      const owner = await api.as('owner');
      expect((await owner.patch(url, { amount: 0 })).status).toBe(400);
      expect((await owner.patch(url, { amount: -5 })).status).toBe(400);

      const tooHigh = await owner.patch(url, { amount: v.total + 10 });
      expect(tooHigh.status).toBe(400);
      expect(tooHigh.body.code).toBe('PAYMENT_EXCEEDS_INVOICE_TOTAL');
      expect(await paidTotal(v.bookingId)).toBe(half);

      const fine = await owner.patch(url, { amount: half + 1 });
      expect(fine.status).toBe(200);
      const updatedAudit = await prisma.auditLog.findFirst({
        where: { action: 'payment.updated', entityId: paymentId },
      });
      expect(updatedAudit?.newValue).toMatchObject({ severity: 'WARNING' });
      expect(updatedAudit?.oldValue).toMatchObject({ amount: half });
      expect(updatedAudit?.newValue).toMatchObject({ amount: half + 1 });

      const loyalty = await prisma.payment.create({
        data: {
          bookingId: v.bookingId,
          clientId: v.client.id,
          amount: 5,
          method: 'LOYALTY',
          status: 'PAID',
          reference: 'LOYALTY-REWARD',
          paidAt: new Date(),
        },
      });
      const loyaltyUrl = `/api/v1/dashboard/payments/${loyalty.id}`;
      const editLoyalty = await owner.patch(loyaltyUrl, { amount: 4 });
      expect(editLoyalty.status).toBe(400);
      expect(editLoyalty.body.code).toBe('LOYALTY_PAYMENT_NOT_EDITABLE');
      expect((await owner.patch(loyaltyUrl, { method: 'CASH' })).status).toBe(
        400,
      );
      const cancelLoyalty = await owner.patch(loyaltyUrl, {
        status: 'CANCELLED',
      });
      expect(cancelLoyalty.status).toBe(200);

      const voided = await owner.patch(url, { status: 'CANCELLED' });
      expect(voided.status).toBe(200);
      const voidAudit = await prisma.auditLog.findFirst({
        where: { action: 'payment.voided', entityId: paymentId },
      });
      expect(voidAudit?.newValue).toMatchObject({ severity: 'WARNING' });
      expect(await paidTotal(v.bookingId)).toBe(0);
    });
  });

  describe('4 and 5. cancelling a booking', () => {
    it('is refused while payments are recorded, then closes the queue entry once they are voided', async () => {
      const v = await visit({ finish: true });
      const paid = await v.rec.post(
        `/api/v1/dashboard/queue/${v.queueEntryId}/payments`,
        { amount: 10, method: 'CASH' },
      );
      expect(paid.status).toBe(201);

      const refused = await v.rec.post(
        `/api/v1/dashboard/bookings/${v.bookingId}/cancel`,
      );
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('BOOKING_HAS_PAYMENTS');
      expect(refused.body.overridable).toBeUndefined();

      const owner = await api.as('owner');
      await owner.patch(`/api/v1/dashboard/payments/${paid.body.payment.id}`, {
        status: 'CANCELLED',
      });
      const ok = await v.rec.post(
        `/api/v1/dashboard/bookings/${v.bookingId}/cancel`,
      );
      expect(ok.status).toBe(201);
      const entry = await prisma.queueEntry.findUniqueOrThrow({
        where: { id: v.queueEntryId },
      });
      expect(entry.status).toBe('CANCELLED');
      expect(entry.cancelledAt).not.toBeNull();
    });

    it('stops an in-progress line and the queue entry', async () => {
      const v = await visit({ finish: false });
      const started = await v.rec.post(
        `/api/v1/dashboard/queue/${v.queueEntryId}/start`,
        {
          starts: [{ bookingItemId: v.itemId, staffProfileId: monaId }],
          overrideReason: 'integration test',
        },
      );
      expect(started.status).toBe(201);
      const cancelled = await v.rec.post(
        `/api/v1/dashboard/bookings/${v.bookingId}/cancel`,
      );
      expect(cancelled.status).toBe(201);
      const entry = await prisma.queueEntry.findUniqueOrThrow({
        where: { id: v.queueEntryId },
      });
      expect(entry.status).toBe('CANCELLED');
      const item = await prisma.bookingItem.findUniqueOrThrow({
        where: { id: v.itemId },
      });
      expect(item.lineStatus).toBe('CANCELLED');
    });
  });

  describe('6. slots', () => {
    const slotsUrl = `/api/v1/dashboard/branches/${BRANCH_ID}/slots`;

    it('refuses duplicates, deleting a slot with bookings and lowering capacity below bookings', async () => {
      const rec = await api.as('receptionist');
      const minute = String(Math.floor(Math.random() * 50) + 5).padStart(
        2,
        '0',
      );
      const body = {
        date: ymdDaysFromNow(40 + Math.floor(Math.random() * 100)),
        startTime: `07:${minute}`,
        endTime: `08:${minute}`,
        capacity: 3,
      };
      const created = await rec.post(slotsUrl, body);
      expect(created.status).toBe(201);
      const slotId = created.body.id as string;

      const dup = await rec.post(slotsUrl, body);
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('SLOT_DUPLICATE');
      // Overlapping but different is allowed.
      const overlap = await rec.post(slotsUrl, {
        ...body,
        endTime: `09:${minute}`,
      });
      expect(overlap.status).toBe(201);

      const [c1, c2] = await Promise.all([
        createClient('Slot A'),
        createClient('Slot B'),
      ]);
      expect((await book(slotId, c1.id)).status).toBe(201);
      expect((await book(slotId, c2.id)).status).toBe(201);

      const lower = await rec.patch(`${slotsUrl}/${slotId}/capacity`, {
        capacity: 1,
      });
      expect(lower.status).toBe(409);
      expect(lower.body.code).toBe('SLOT_CAPACITY_BELOW_BOOKINGS');
      expect(
        (await rec.patch(`${slotsUrl}/${slotId}/capacity`, { capacity: 2 }))
          .status,
      ).toBe(200);

      const del = await rec.delete(`${slotsUrl}/${slotId}`);
      expect(del.status).toBe(409);
      expect(del.body.code).toBe('SLOT_HAS_BOOKINGS');

      const emptyId = overlap.body.id as string;
      const gone = await rec.delete(`${slotsUrl}/${emptyId}`);
      expect(gone.status).toBe(200);
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'slot.deleted', entityId: emptyId },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('7. past slots', () => {
    it('refuses a past date, makes an already-started slot today a soft rule, keeps the website strict', async () => {
      const client = await createClient('Past Slot');
      const past = await createSlot({
        date: ymdDaysFromNow(-2),
        startTime: '10:00:00',
        endTime: '11:00:00',
        capacity: 2,
      });
      const refused = await book(past.id, client.id);
      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe('SLOT_IN_PAST');
      // A reason does not unlock a past date.
      const stillRefused = await book(past.id, client.id, {
        overrideReason: 'please',
      });
      expect(stillRefused.status).toBe(400);

      const today = await createSlot({
        date: cairoToday(),
        startTime: '00:00:00',
        endTime: '00:30:00',
        capacity: 3,
      });
      const soft = await book(today.id, client.id);
      expect(soft.status).toBe(409);
      expect(soft.body.overridable).toBe(true);
      expect(soft.body.code).toBe('SLOT_START_PASSED');
      const ok = await book(today.id, client.id, {
        overrideReason: 'client is already at the desk',
      });
      expect(ok.status).toBe(201);
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'override.slot_start_passed', entityId: ok.body.id },
      });
      expect(audit).not.toBeNull();

      // Reschedule has the same two rules.
      const future = await createSlot({ capacity: 2 });
      const other = await createClient('Past Reschedule');
      const booking = await book(future.id, other.id);
      const rec = await api.as('receptionist');
      const rs = await rec.post(
        `/api/v1/dashboard/bookings/${booking.body.id}/reschedule`,
        { slotId: past.id },
      );
      expect(rs.status).toBe(400);
      expect(rs.body.code).toBe('SLOT_IN_PAST');
      const rsSoft = await rec.post(
        `/api/v1/dashboard/bookings/${booking.body.id}/reschedule`,
        { slotId: today.id },
      );
      expect(rsSoft.status).toBe(409);
      expect(rsSoft.body.overridable).toBe(true);
      const rsOk = await rec.post(
        `/api/v1/dashboard/bookings/${booking.body.id}/reschedule`,
        { slotId: today.id, overrideReason: 'client walked in' },
      );
      expect(rsOk.status).toBe(201);

      // The website still refuses a slot that already started.
      const phone = uniquePhone();
      const otp = await api.http
        .post('/api/v1/client/auth/otp/request')
        .send({ phone, intent: 'REGISTER' });
      const verified = await api.http
        .post('/api/v1/client/auth/otp/verify')
        .send({
          phone,
          code: (otp.body as { devCode: string }).devCode,
          fullName: 'Website Past',
        });
      const web = await api.http
        .post('/api/v1/public/bookings')
        .set('Authorization', `Bearer ${verified.body.accessToken}`)
        .send({ branchId: BRANCH_ID, slotId: today.id, items: [cutLine] });
      expect(web.status).toBe(400);
    });
  });

  describe('8 and 9. input validation', () => {
    it('limits quantity to 20 and answers 404/400 instead of 500', async () => {
      const rec = await api.as('receptionist');
      const client = await createClient('Validation');
      const slot = await createSlot({ capacity: 2 });
      const tooMany = await book(slot.id, client.id, {
        items: [{ ...cutLine, quantity: 21 }],
      });
      expect(tooMany.status).toBe(400);
      const twenty = await book(slot.id, client.id, {
        items: [{ ...cutLine, quantity: 20 }],
      });
      expect(twenty.status).toBe(201);
      const estimate = await api.http
        .post('/api/v1/public/bookings/estimate')
        .send({
          branchId: BRANCH_ID,
          items: [{ ...cutLine, quantity: 21 }],
        });
      expect(estimate.status).toBe(400);

      const ghost = await book(slot.id, '11111111-1111-4111-8111-111111111111');
      expect(ghost.status).toBe(404);

      const bad = await rec.get('/api/v1/dashboard/bookings/not-a-uuid');
      expect(bad.status).toBe(400);
      expect(
        (await rec.post('/api/v1/dashboard/bookings/not-a-uuid/cancel')).status,
      ).toBe(400);
      expect(
        (await rec.get('/api/v1/dashboard/payments/not-a-uuid')).status,
      ).toBe(400);
      expect(
        (await rec.get('/api/v1/dashboard/invoices/not-a-uuid')).status,
      ).toBe(400);
    });
  });

  describe('10. same client twice in one slot', () => {
    it('is a soft rule on the dashboard and a refusal on the website', async () => {
      const client = await createClient('Twice');
      const slot = await createSlot({ capacity: 5 });
      const first = await book(slot.id, client.id);
      expect(first.status).toBe(201);
      const second = await book(slot.id, client.id);
      expect(second.status).toBe(409);
      expect(second.body.overridable).toBe(true);
      expect(second.body.code).toBe('CLIENT_ALREADY_IN_SLOT');
      const forced = await book(slot.id, client.id, {
        overrideReason: 'two people share the number',
      });
      expect(forced.status).toBe(201);
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'override.client_already_in_slot',
          entityId: forced.body.id,
        },
      });
      expect(audit).not.toBeNull();

      // Cancelled bookings do not count.
      const rec = await api.as('receptionist');
      const other = await createClient('Twice Cancelled');
      const a = await book(slot.id, other.id);
      await rec.post(`/api/v1/dashboard/bookings/${a.body.id}/cancel`);
      expect((await book(slot.id, other.id)).status).toBe(201);

      const phone = uniquePhone();
      const otp = await api.http
        .post('/api/v1/client/auth/otp/request')
        .send({ phone, intent: 'REGISTER' });
      const verified = await api.http
        .post('/api/v1/client/auth/otp/verify')
        .send({
          phone,
          code: (otp.body as { devCode: string }).devCode,
          fullName: 'Website Twice',
        });
      const token = verified.body.accessToken as string;
      const webSlot = await createSlot({ capacity: 3 });
      const send = () =>
        api.http
          .post('/api/v1/public/bookings')
          .set('Authorization', `Bearer ${token}`)
          .send({
            branchId: BRANCH_ID,
            slotId: webSlot.id,
            items: [cutLine],
          });
      expect((await send()).status).toBe(201);
      const again = await send();
      expect(again.status).toBe(400);
      expect(again.body.code).toBe('CLIENT_ALREADY_IN_SLOT');
    });
  });

  describe('11. finalizing with a line that was never started', () => {
    it('is a soft rule on every finalize path, audited with the reason', async () => {
      const v = await visit({ finish: false });
      const viaQueue = await v.rec.post(
        `/api/v1/dashboard/queue/${v.queueEntryId}/invoice/finalize`,
      );
      expect(viaQueue.status).toBe(409);
      expect(viaQueue.body.overridable).toBe(true);
      expect(viaQueue.body.code).toBe('SERVICE_LINES_NOT_FINISHED');
      const viaBooking = await v.rec.post(
        `/api/v1/dashboard/bookings/${v.bookingId}/invoice/finalize`,
      );
      expect(viaBooking.status).toBe(409);
      const viaBookingCreate = await v.rec.post(
        `/api/v1/dashboard/bookings/${v.bookingId}/invoices`,
      );
      expect(viaBookingCreate.status).toBe(409);
      expect(
        await prisma.invoice.count({ where: { bookingId: v.bookingId } }),
      ).toBe(0);

      const ok = await v.rec.post(
        `/api/v1/dashboard/queue/${v.queueEntryId}/invoice/finalize`,
        { overrideReason: 'client left before the service' },
      );
      expect(ok.status).toBe(201);
      const inv = await prisma.invoice.findFirstOrThrow({
        where: { bookingId: v.bookingId },
      });
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'override.invoice_unfinished_lines',
          entityId: inv.id,
        },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('13. deactivating a user through the profile update', () => {
    it('ends the access token at once', async () => {
      const role = await prisma.role.findFirstOrThrow({
        where: { name: 'Receptionist' },
      });
      const email = `patched.${Date.now()}@alrouby.local`;
      const user = await prisma.user.create({
        data: {
          name: 'Patched',
          email,
          passwordHash: await argon2.hash('Patched#2026x', {
            type: argon2.argon2id,
          }),
          roleId: role.id,
          branchId: BRANCH_ID,
          isActive: true,
        },
      });
      const login = await api.http
        .post('/api/v1/dashboard/auth/login')
        .send({ email, password: 'Patched#2026x' });
      expect(login.status).toBe(200);
      const auth = { Authorization: `Bearer ${login.body.accessToken}` };
      // Warm the per-user cache.
      expect(
        (await api.http.get('/api/v1/dashboard/auth/me').set(auth)).status,
      ).toBe(200);
      const owner = await api.as('owner');
      const off = await owner.patch(`/api/v1/dashboard/users/${user.id}`, {
        isActive: false,
      });
      expect(off.status).toBe(200);
      expect(
        (await api.http.get('/api/v1/dashboard/auth/me').set(auth)).status,
      ).toBe(401);
    });
  });
});
