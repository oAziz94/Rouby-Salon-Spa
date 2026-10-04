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
  USERS,
} from './harness';

type Loyalty = {
  enabled: boolean;
  points: number;
  earnedPoints: number;
  redeemableBlocks: number;
  visits: number;
  rewardsAvailable: number;
  invoiceRemaining?: number | null;
  rewardLineOnVisit?: boolean;
};

// Three full visits against a remote test database take close to the 60 s default.
jest.setTimeout(120_000);

describe('loyalty program', () => {
  let app: INestApplication;
  let api: Api;
  let monaId: string;

  beforeAll(async () => {
    app = await createApp();
    api = new Api(app);
    monaId = (await staffProfileFor(USERS.staff.email)).id;
    await ensureStaffCanDo(monaId, SVC_CUT);
    const owner = await api.as('owner');
    const res = await owner.patch('/api/v1/dashboard/loyalty/settings', {
      enabled: true,
      pointsPerEgp: 1,
      redeemPoints: 1000,
      redeemValue: 50,
      visitsForReward: 2,
      rewardServiceId: SVC_CUT,
    });
    expect(res.status).toBe(200);
    expect(res.body.startedAt).toBeTruthy();
  });
  afterAll(async () => {
    const owner = await api.as('owner');
    await owner.patch('/api/v1/dashboard/loyalty/settings', { enabled: false });
    await app.close();
    await prisma.$disconnect();
  });

  /** A visit with one haircut, taken to a finalized invoice. Returns ids and the total. */
  async function visitToInvoice(clientId: string) {
    const rec = await api.as('receptionist');
    const slot = await createSlot({ capacity: 1 });
    const created = await rec.post('/api/v1/dashboard/bookings', {
      clientId,
      branchId: BRANCH_ID,
      slotId: slot.id,
      source: 'PHONE',
      initialStatus: 'CONFIRMED',
      items: [{ itemType: 'SERVICE', serviceId: SVC_CUT, quantity: 1 }],
    });
    expect(created.status).toBe(201);
    const bookingId = created.body.id as string;
    const itemId = created.body.items[0].id as string;
    const q = await rec.post(
      `/api/v1/dashboard/bookings/${bookingId}/check-in`,
    );
    const queueEntryId = q.body.id as string;
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
    const inv = await prisma.invoice.findFirstOrThrow({ where: { bookingId } });
    return { bookingId, queueEntryId, total: Number(inv.totalAmount) };
  }

  async function payAndClose(queueEntryId: string, amount: number) {
    const rec = await api.as('receptionist');
    if (amount > 0) {
      const paid = await rec.post(
        `/api/v1/dashboard/queue/${queueEntryId}/payments`,
        { amount, method: 'CASH' },
      );
      expect(paid.status).toBe(201);
    }
    const closed = await rec.post(
      `/api/v1/dashboard/queue/${queueEntryId}/complete`,
    );
    expect(closed.status).toBe(201);
  }

  it('earns points on money paid, redeems blocks as a loyalty payment, and gives the visit reward', async () => {
    const rec = await api.as('receptionist');
    const owner = await api.as('owner');
    const client = await createClient('Loyal Client');

    // Visit 1: pay in full → points = amount paid; one completed visit.
    const v1 = await visitToInvoice(client.id);
    const before = await rec.get(
      `/api/v1/dashboard/queue/${v1.queueEntryId}/loyalty`,
    );
    expect(before.status).toBe(200);
    expect((before.body as Loyalty).points).toBe(0);
    const early = await rec.post(
      `/api/v1/dashboard/queue/${v1.queueEntryId}/loyalty/redeem-points`,
      { blocks: 1 },
    );
    expect(early.status).toBe(400);
    expect(early.body.code).toBe('LOYALTY_NOT_ENOUGH_POINTS');
    await payAndClose(v1.queueEntryId, v1.total);
    const after1 = await rec.get(
      `/api/v1/dashboard/loyalty/clients/${client.id}`,
    );
    expect((after1.body as Loyalty).points).toBe(Math.floor(v1.total));
    expect((after1.body as Loyalty).visits).toBe(1);
    expect((after1.body as Loyalty).rewardsAvailable).toBe(0);

    // The receipt prints the balance and what this visit earned.
    const inv1 = await prisma.invoice.findFirstOrThrow({
      where: { bookingId: v1.bookingId },
    });
    const receipt = await rec.get(
      `/api/v1/dashboard/invoices/${inv1.id}/receipt`,
    );
    expect(receipt.status).toBe(200);
    expect(receipt.body.loyalty.pointsBalance).toBe(Math.floor(v1.total));
    expect(receipt.body.loyalty.pointsEarnedThisVisit).toBe(
      Math.floor(v1.total),
    );
    expect(receipt.body.loyalty.visits).toBe(1);

    // Reception cannot adjust balances; the owner can, with a reason.
    expect(
      (
        await rec.post(
          `/api/v1/dashboard/loyalty/clients/${client.id}/adjust`,
          {
            points: 1000,
            note: 'nope',
          },
        )
      ).status,
    ).toBe(403);
    const adj = await owner.post(
      `/api/v1/dashboard/loyalty/clients/${client.id}/adjust`,
      { points: 1000, note: 'Opening balance from paper card' },
    );
    expect(adj.status).toBe(200);
    expect((adj.body as Loyalty).points).toBe(Math.floor(v1.total) + 1000);

    // Visit 2: redeem one block → 50 EGP loyalty payment; then pay the rest and close.
    const v2 = await visitToInvoice(client.id);
    const red = await rec.post(
      `/api/v1/dashboard/queue/${v2.queueEntryId}/loyalty/redeem-points`,
      { blocks: 5 },
    );
    expect(red.status).toBe(200);
    // Asked for 5 blocks; only one is covered by the balance.
    expect(red.body.redeemedPoints).toBe(1000);
    expect(red.body.amount).toBe(50);
    const inv2 = await prisma.invoice.findFirstOrThrow({
      where: { bookingId: v2.bookingId },
    });
    expect(Number(inv2.remainingAmount)).toBeCloseTo(v2.total - 50, 2);
    const loyaltyPayment = await prisma.payment.findFirstOrThrow({
      where: { bookingId: v2.bookingId, method: 'LOYALTY' },
    });
    expect(Number(loyaltyPayment.amount)).toBe(50);
    await payAndClose(v2.queueEntryId, v2.total - 50);

    // Points: earned on cash only (not on the loyalty tender), minus the redemption.
    const after2 = await rec.get(
      `/api/v1/dashboard/loyalty/clients/${client.id}`,
    );
    const s2 = after2.body as Loyalty;
    expect(s2.earnedPoints).toBe(Math.floor(v1.total + v2.total - 50));
    expect(s2.points).toBe(Math.floor(v1.total + v2.total - 50));
    expect(s2.visits).toBe(2);
    expect(s2.rewardsAvailable).toBe(1);

    // Visit 3: the free haircut pays the haircut line; nothing left to collect.
    const v3 = await visitToInvoice(client.id);
    const state = await rec.get(
      `/api/v1/dashboard/queue/${v3.queueEntryId}/loyalty`,
    );
    expect((state.body as Loyalty).rewardLineOnVisit).toBe(true);
    const reward = await rec.post(
      `/api/v1/dashboard/queue/${v3.queueEntryId}/loyalty/redeem-reward`,
    );
    expect(reward.status).toBe(200);
    expect(reward.body.amount).toBeCloseTo(v3.total, 2);
    const again = await rec.post(
      `/api/v1/dashboard/queue/${v3.queueEntryId}/loyalty/redeem-reward`,
    );
    expect(again.status).toBe(400);
    await payAndClose(v3.queueEntryId, 0);
    const after3 = await rec.get(
      `/api/v1/dashboard/loyalty/clients/${client.id}`,
    );
    expect((after3.body as Loyalty).rewardsAvailable).toBe(0);
    // A free visit earns no points.
    expect((after3.body as Loyalty).earnedPoints).toBe(s2.earnedPoints);

    // Cancelling the loyalty payment gives the points back.
    await prisma.payment.update({
      where: { id: loyaltyPayment.id },
      data: { status: 'CANCELLED' },
    });
    const restored = await rec.get(
      `/api/v1/dashboard/loyalty/clients/${client.id}`,
    );
    expect((restored.body as Loyalty).points).toBe(s2.points + 1000);
  });

  it('counts a completed visit toward the reward only once its invoice is fully settled', async () => {
    const rec = await api.as('receptionist');
    const client = await createClient('Unsettled Visit');
    const v = await visitToInvoice(client.id);
    const closed = await rec.post(
      `/api/v1/dashboard/queue/${v.queueEntryId}/complete`,
      { closeWithBalanceReason: 'client will pay tomorrow' },
    );
    expect(closed.status).toBe(201);
    const summary = () =>
      rec.get(`/api/v1/dashboard/loyalty/clients/${client.id}`);
    expect(((await summary()).body as Loyalty).visits).toBe(0);

    const inv = await prisma.invoice.findFirstOrThrow({
      where: { bookingId: v.bookingId },
    });
    const paid = await rec.post(
      `/api/v1/dashboard/invoices/${inv.id}/payments`,
      {
        amount: v.total,
        method: 'CASH',
      },
    );
    expect(paid.status).toBe(201);
    expect(((await summary()).body as Loyalty).visits).toBe(1);
  });

  it('refuses redemptions while the program is off, and rejects a manual LOYALTY payment', async () => {
    const rec = await api.as('receptionist');
    const owner = await api.as('owner');
    const client = await createClient('Loyalty Off');
    const v = await visitToInvoice(client.id);
    const manual = await rec.post(
      `/api/v1/dashboard/queue/${v.queueEntryId}/payments`,
      { amount: 10, method: 'LOYALTY' },
    );
    expect(manual.status).toBe(400);
    await owner.patch('/api/v1/dashboard/loyalty/settings', { enabled: false });
    const off = await rec.post(
      `/api/v1/dashboard/queue/${v.queueEntryId}/loyalty/redeem-points`,
      { blocks: 1 },
    );
    expect(off.status).toBe(400);
    expect(off.body.code).toBe('LOYALTY_DISABLED');
    await owner.patch('/api/v1/dashboard/loyalty/settings', { enabled: true });
    await payAndClose(v.queueEntryId, v.total);
  });
});
