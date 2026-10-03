import type { INestApplication } from '@nestjs/common';
import {
  Api,
  BRANCH_ID,
  createApp,
  createClient,
  createSlot,
  prisma,
  staffProfileFor,
  SVC_MANI,
  uniquePhone,
  USERS,
} from './harness';

/**
 * How staff affect booking and service start:
 *  - booking (website or dashboard) is checked against slot capacity only, never against
 *    who can do the service or who is on shift that day;
 *  - starting a service with someone not linked to it is refused unless a reason is given.
 */
describe('staff rules on booking and service start', () => {
  let app: INestApplication;
  let api: Api;
  let monaId: string;
  let removedLinks: Array<{ staffProfileId: string; serviceId: string }> = [];

  beforeAll(async () => {
    app = await createApp();
    api = new Api(app);
    monaId = (await staffProfileFor(USERS.staff.email)).id;
    // Nobody can do a manicure: the strongest form of "no staff for this service that day".
    removedLinks = await prisma.staffProfileService.findMany({
      where: { serviceId: SVC_MANI },
      select: { staffProfileId: true, serviceId: true },
    });
    await prisma.staffProfileService.deleteMany({
      where: { serviceId: SVC_MANI },
    });
  });
  afterAll(async () => {
    await prisma.staffProfileService.deleteMany({
      where: { serviceId: SVC_MANI },
    });
    if (removedLinks.length) {
      await prisma.staffProfileService.createMany({ data: removedLinks });
    }
    await app.close();
    await prisma.$disconnect();
  });

  it('accepts a website booking for a service nobody is available to do', async () => {
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
        fullName: 'Website Guest',
      });
    expect(verified.status).toBeLessThan(300);
    const clientToken = verified.body.accessToken as string;
    expect(clientToken).toBeTruthy();

    const slot = await createSlot({ capacity: 1 });
    const res = await api.http
      .post('/api/v1/public/bookings')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        branchId: BRANCH_ID,
        slotId: slot.id,
        items: [{ itemType: 'SERVICE', serviceId: SVC_MANI, quantity: 1 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
  });

  it('accepts a dashboard booking the same way, then refuses an unqualified start without a reason', async () => {
    const rec = await api.as('receptionist');
    const client = await createClient('Staff Rules');
    const slot = await createSlot({ capacity: 1 });
    const created = await rec.post('/api/v1/dashboard/bookings', {
      clientId: client.id,
      branchId: BRANCH_ID,
      slotId: slot.id,
      source: 'PHONE',
      initialStatus: 'CONFIRMED',
      items: [{ itemType: 'SERVICE', serviceId: SVC_MANI, quantity: 1 }],
    });
    expect(created.status).toBe(201);
    const bookingId = created.body.id as string;
    const itemId = created.body.items[0].id as string;

    // The operator is warned on the booking and in the list, but nothing is blocked.
    const detail = await rec.get(`/api/v1/dashboard/bookings/${bookingId}`);
    expect(detail.status).toBe(200);
    const warnings = detail.body.staffWarnings as string[];
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('no bookable staff does this service');
    const list = await rec.get(
      `/api/v1/dashboard/bookings?slotId=${slot.id}&branchId=${BRANCH_ID}`,
    );
    expect(
      (list.body.data as Array<{ id: string; staffWarnings: string[] }>).find(
        (b) => b.id === bookingId,
      )?.staffWarnings,
    ).toHaveLength(1);

    // The staff picker offers unlinked staff as an exception.
    const avail = await rec.get(
      `/api/v1/dashboard/staff/availability?branchId=${BRANCH_ID}&serviceId=${SVC_MANI}`,
    );
    expect(avail.status).toBe(200);
    expect(
      (
        avail.body.staff as Array<{ staffProfileId: string; status: string }>
      ).find((s) => s.staffProfileId === monaId)?.status,
    ).toBe('NOT_LINKED');

    const q = await rec.post(
      `/api/v1/dashboard/bookings/${bookingId}/check-in`,
    );
    const queueEntryId = q.body.id as string;

    const refused = await rec.post(
      `/api/v1/dashboard/queue/${queueEntryId}/start`,
      { starts: [{ bookingItemId: itemId, staffProfileId: monaId }] },
    );
    expect(refused.status).toBe(409);
    expect(refused.body.overridable).toBe(true);
    expect(
      (refused.body.issues as Array<{ code: string }>).map((i) => i.code),
    ).toContain('STAFF_NOT_QUALIFIED');
    const untouched = await prisma.bookingItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    expect(untouched.lineStatus).toBe('PENDING');
    expect(untouched.staffProfileId).toBeNull();

    const forced = await rec.post(
      `/api/v1/dashboard/queue/${queueEntryId}/start`,
      {
        starts: [{ bookingItemId: itemId, staffProfileId: monaId }],
        overrideReason: 'Covering for a colleague',
      },
    );
    expect(forced.status).toBeLessThan(300);
    const started = await prisma.bookingItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    expect(started.lineStatus).toBe('IN_PROGRESS');
    expect(started.staffProfileId).toBe(monaId);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'override.staff_start', entityId: bookingId },
    });
    expect(audit).toBeTruthy();
  });
});
