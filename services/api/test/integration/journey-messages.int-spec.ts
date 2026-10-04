import type { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { BookingReminderScheduler } from '../../src/notifications/booking-reminder.scheduler';
import { Api, createApp, prisma, SVC_CUT, uniquePhone } from './harness';
import {
  cairoPlus,
  createBranchSlot,
  createJourneyBranch,
  FakeWhatsApp,
  type JourneyBranch,
  releaseJourneyBranch,
  notificationTypes,
  waitForNotification,
} from './journey-helpers';

/**
 * Every WhatsApp message a client can receive, and the reminder timer, end to end.
 * The real code builds and logs each message; only the final HTTP call to Wapilot is
 * replaced by FakeWhatsApp, so nothing leaves the machine.
 */
jest.setTimeout(120_000);

const ENV_KEYS = [
  'NOTIFICATIONS_ENABLED',
  'WHATSAPP_PROVIDER',
  'WAPILOT_API_TOKEN',
  'WAPILOT_INSTANCE_ID',
] as const;

describe('journey: client messages and appointment reminders', () => {
  let app: INestApplication;
  let api: Api;
  let J: JourneyBranch;
  const wa = new FakeWhatsApp();
  const envBefore: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
  let scheduler: BookingReminderScheduler;
  const url = (p: string) => `/api/v1/dashboard${p}`;
  const line = [{ itemType: 'SERVICE', serviceId: SVC_CUT, quantity: 1 }];

  beforeAll(async () => {
    for (const k of ENV_KEYS) envBefore[k] = process.env[k];
    process.env.NOTIFICATIONS_ENABLED = 'true';
    process.env.WHATSAPP_PROVIDER = 'wapilot';
    // Never a real token: even without the fake, Wapilot would refuse the call.
    process.env.WAPILOT_API_TOKEN = 'journey-test-not-a-token';
    process.env.WAPILOT_INSTANCE_ID = 'journey-test';
    app = await createApp({ whatsapp: wa });
    api = new Api(app);
    scheduler = app.get(BookingReminderScheduler);
    // The real 15-minute timer would race the test's own runs (a run in progress makes the
    // next call return at once); the test drives the timer itself.
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) {
      void job.stop();
    }
    J = await createJourneyBranch('Journey Messages');
  });

  afterAll(async () => {
    for (const k of ENV_KEYS) {
      if (envBefore[k] === undefined) delete process.env[k];
      else process.env[k] = envBefore[k];
    }
    await releaseJourneyBranch(J);
    await app.close();
    await prisma.$disconnect();
  });

  async function slotAt(minutesFromNow: number) {
    const at = cairoPlus(minutesFromNow);
    return createBranchSlot(J.id, { date: at.date, start: at.time });
  }

  async function client(name: string) {
    return prisma.client.create({
      data: { fullName: name, phone: uniquePhone(), preferredBranchId: J.id },
    });
  }

  async function dashboardBooking(
    clientId: string,
    slotId: string,
    status: 'PENDING' | 'CONFIRMED',
  ) {
    const rec = await api.as('receptionist');
    const r = await rec.post(url('/bookings'), {
      clientId,
      branchId: J.id,
      slotId,
      source: 'PHONE',
      initialStatus: status,
      items: line,
    });
    expect(r.status).toBe(201);
    return r.body.id as string;
  }

  /** Book without any message going out (as if confirmed days ago, before the window). */
  async function quietBooking(name: string, minutesFromNow: number) {
    const c = await client(name);
    const slot = await slotAt(minutesFromNow);
    process.env.NOTIFICATIONS_ENABLED = 'false';
    try {
      const id = await dashboardBooking(c.id, slot.id, 'CONFIRMED');
      return { id, phone: c.phone };
    } finally {
      process.env.NOTIFICATIONS_ENABLED = 'true';
    }
  }

  it('M01 website client: register by OTP, request a booking → "request received" message', async () => {
    const phone = uniquePhone();
    const otp = await api.http
      .post('/api/v1/client/auth/otp/request')
      .send({ phone, intent: 'REGISTER' });
    expect(otp.status).toBeLessThan(300);
    const verified = await api.http
      .post('/api/v1/client/auth/otp/verify')
      .send({
        phone,
        code: (otp.body as { devCode: string }).devCode,
        fullName: 'Website Journey',
      });
    expect(verified.status).toBeLessThan(300);
    const token = verified.body.accessToken as string;
    const slot = await slotAt(3 * 24 * 60);
    const booked = await api.http
      .post('/api/v1/public/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId: J.id, slotId: slot.id, items: line });
    expect(booked.status).toBe(201);
    const bookingId = booked.body.id as string;
    await waitForNotification(bookingId, 'BOOKING_REQUEST_RECEIVED');
    const msgs = wa.to(phone);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('Website Journey');
    expect(msgs[0]).toMatch(/request .*has been received/i);

    // The client sees the booking in their account.
    const mine = await api.http
      .get('/api/v1/client/bookings')
      .set('Authorization', `Bearer ${token}`);
    expect(mine.status).toBe(200);
    const list = (mine.body.data ?? mine.body) as Array<{ id: string }>;
    expect(list.some((b) => b.id === bookingId)).toBe(true);

    // M02 reception confirms → confirmation; 3 days away → no reminder yet.
    const rec = await api.as('receptionist');
    expect((await rec.post(url(`/bookings/${bookingId}/confirm`))).status).toBe(
      201,
    );
    await waitForNotification(bookingId, 'BOOKING_CONFIRMATION');
    expect(await notificationTypes(bookingId)).toEqual([
      'BOOKING_REQUEST_RECEIVED:SENT',
      'BOOKING_CONFIRMATION:SENT',
    ]);
    expect(wa.to(phone)[1]).toMatch(/is confirmed/i);

    // M03 the client asks to move it from the website; reception approves → message.
    const newSlot = await slotAt(4 * 24 * 60);
    const ask = await api.http
      .post(`/api/v1/client/bookings/${bookingId}/reschedule-requests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ requestedSlotId: newSlot.id, reason: 'Work meeting' });
    expect(ask.status).toBe(201);
    const approve = await rec.post(
      url(`/booking-change-requests/${ask.body.id}/approve`),
    );
    expect(approve.status).toBe(201);
    const moved = await rec.get(url(`/bookings/${bookingId}`));
    expect(moved.body.slotId).toBe(newSlot.id);
    await new Promise((r) => setTimeout(r, 1500));
    expect(wa.to(phone).some((t) => /rescheduled/i.test(t))).toBe(true);

    // M04 a second request is turned down → "could not approve" message.
    const third = await slotAt(5 * 24 * 60);
    const ask2 = await api.http
      .post(`/api/v1/client/bookings/${bookingId}/reschedule-requests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ requestedSlotId: third.id });
    expect(ask2.status).toBe(201);
    expect(
      (await rec.post(url(`/booking-change-requests/${ask2.body.id}/reject`)))
        .status,
    ).toBe(201);
    await new Promise((r) => setTimeout(r, 1500));
    expect(wa.to(phone).some((t) => /could not approve/i.test(t))).toBe(true);

    // M05 the client asks to cancel; reception approves → cancellation message.
    const cancelAsk = await api.http
      .post(`/api/v1/client/bookings/${bookingId}/cancellation-requests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Travelling' });
    expect(cancelAsk.status).toBe(201);
    expect(
      (
        await rec.post(
          url(`/booking-change-requests/${cancelAsk.body.id}/approve`),
        )
      ).status,
    ).toBe(201);
    await waitForNotification(bookingId, 'BOOKING_CANCELLATION');
    expect((await rec.get(url(`/bookings/${bookingId}`))).body.status).toBe(
      'CANCELLED',
    );
  });

  it('M06 reception reschedules and cancels directly; a rejected request gets its own message', async () => {
    const rec = await api.as('receptionist');
    const c = await client('Direct Changes');
    const id = await dashboardBooking(
      c.id,
      (await slotAt(3 * 24 * 60)).id,
      'CONFIRMED',
    );
    await waitForNotification(id, 'BOOKING_CONFIRMATION');
    const to = await slotAt(3 * 24 * 60 + 120);
    expect(
      (await rec.post(url(`/bookings/${id}/reschedule`), { slotId: to.id }))
        .status,
    ).toBe(201);
    await waitForNotification(id, 'BOOKING_RESCHEDULED');
    expect((await rec.post(url(`/bookings/${id}/cancel`))).status).toBe(201);
    await waitForNotification(id, 'BOOKING_CANCELLATION');

    const c2 = await client('Rejected Request');
    const pending = await dashboardBooking(
      c2.id,
      (await slotAt(3 * 24 * 60)).id,
      'PENDING',
    );
    expect((await rec.post(url(`/bookings/${pending}/reject`))).status).toBe(
      201,
    );
    await waitForNotification(pending, 'BOOKING_REJECTED');
    expect(wa.to(c2.phone).some((t) => /could not confirm/i.test(t))).toBe(
      true,
    );
  });

  it('M07 confirming inside the 24-hour window sends the confirmation and the day-before reminder at once', async () => {
    const c = await client('Tomorrow Client');
    const id = await dashboardBooking(
      c.id,
      (await slotAt(20 * 60)).id,
      'CONFIRMED',
    );
    await waitForNotification(id, 'APPOINTMENT_REMINDER');
    expect(await notificationTypes(id)).toEqual([
      'BOOKING_CONFIRMATION:SENT',
      'APPOINTMENT_REMINDER:SENT',
    ]);
    expect(wa.to(c.phone)[1]).toMatch(/friendly reminder/i);
  });

  it('M08 confirming 60 minutes ahead sends the confirmation and the final reminder only', async () => {
    const c = await client('Soon Client');
    const id = await dashboardBooking(c.id, (await slotAt(60)).id, 'CONFIRMED');
    await waitForNotification(id, 'APPOINTMENT_REMINDER_90M');
    expect(await notificationTypes(id)).toEqual([
      'BOOKING_CONFIRMATION:SENT',
      'APPOINTMENT_REMINDER_90M:SENT',
    ]);
    expect(wa.to(c.phone)[1]).toMatch(/starts in/i);
  });

  it('M09 the reminder timer reminds exactly the right bookings, once', async () => {
    const dayBefore = await quietBooking('Timer 20h', 20 * 60);
    const final = await quietBooking('Timer 60m', 60);
    const farAway = await quietBooking('Timer 3 days', 3 * 24 * 60);
    const cancelled = await quietBooking('Timer cancelled', 20 * 60);
    process.env.NOTIFICATIONS_ENABLED = 'false';
    const rec = await api.as('receptionist');
    expect(
      (await rec.post(url(`/bookings/${cancelled.id}/cancel`))).status,
    ).toBe(201);
    const cPending = await client('Timer pending');
    const pending = await dashboardBooking(
      cPending.id,
      (await slotAt(20 * 60)).id,
      'PENDING',
    );
    process.env.NOTIFICATIONS_ENABLED = 'true';
    for (const b of [dayBefore, final, farAway, cancelled]) {
      expect(await notificationTypes(b.id, 0)).toEqual([]);
    }

    await scheduler.dispatchDueReminders();
    expect(await notificationTypes(dayBefore.id, 0)).toEqual([
      'APPOINTMENT_REMINDER:SENT',
    ]);
    expect(await notificationTypes(final.id, 0)).toEqual([
      'APPOINTMENT_REMINDER_90M:SENT',
    ]);
    expect(await notificationTypes(farAway.id, 0)).toEqual([]);
    expect(await notificationTypes(cancelled.id, 0)).toEqual([]);
    expect(await notificationTypes(pending, 0)).toEqual([]);

    // A second run (the timer fires every 15 minutes) sends nothing again.
    await scheduler.dispatchDueReminders();
    expect(await notificationTypes(dayBefore.id, 0)).toEqual([
      'APPOINTMENT_REMINDER:SENT',
    ]);
    expect(await notificationTypes(final.id, 0)).toEqual([
      'APPOINTMENT_REMINDER_90M:SENT',
    ]);
    expect(wa.to(dayBefore.phone)).toHaveLength(1);
  });

  it('M10 a number that keeps failing is tried 3 times, then stops; a manual retry still works', async () => {
    const b = await quietBooking('Failing Number', 20 * 60);
    wa.failFor.add(b.phone.replace(/\D/g, ''));
    for (let i = 0; i < 5; i += 1) {
      await scheduler.dispatchDueReminders();
    }
    const failed = await prisma.notificationLog.findMany({
      where: { bookingId: b.id, type: 'APPOINTMENT_REMINDER' },
      orderBy: { createdAt: 'asc' },
    });
    expect(failed.map((f) => f.status)).toEqual(['FAILED', 'FAILED', 'FAILED']);

    wa.failFor.clear();
    const owner = await api.as('owner');
    const retry = await owner.post(url(`/notifications/${failed[2].id}/retry`));
    expect(retry.status).toBeLessThan(300);
    await waitForNotification(b.id, 'APPOINTMENT_REMINDER');
    expect(wa.to(b.phone)).toHaveLength(1);
  });

  it('M11 messages go only to the booking’s own client', async () => {
    const all = await prisma.notificationLog.findMany({
      where: { booking: { branchId: J.id } },
      include: {
        booking: { include: { client: { select: { phone: true } } } },
      },
    });
    expect(all.length).toBeGreaterThan(10);
    for (const row of all) {
      expect(row.recipientPhone.replace(/\D/g, '')).toBe(
        row.booking!.client.phone.replace(/\D/g, ''),
      );
    }
  });
});
