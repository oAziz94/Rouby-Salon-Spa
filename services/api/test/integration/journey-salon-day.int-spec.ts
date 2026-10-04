import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Api,
  createApp,
  prisma,
  SVC_CUT,
  SVC_MANI,
  uniquePhone,
} from './harness';
import {
  cairoToday,
  createBranchSlot,
  createJourneyBranch,
  type JourneyBranch,
  releaseJourneyBranch,
  utcToday,
} from './journey-helpers';

/**
 * One full working day at a fresh branch, end to end through the API:
 * open the drawer → five visits paid every way the salon takes money (cash, card, split,
 * InstaPay, wallet, loyalty, a voided payment, a balance left open) with discounts and VAT
 * → a cancellation and a no-show → cash in/out → close the drawer with a shortfall →
 * close the day carrying the open balance over. Then nothing may change the closed day.
 */
jest.setTimeout(120_000);

type Money = { total: number; subtotal: number; discount: number; vat: number };

describe('journey: a full salon day, from opening the drawer to closing the day', () => {
  let app: INestApplication;
  let api: Api;
  let J: JourneyBranch;
  const day = utcToday();
  /** Bookings are counted by slot day; it equals the money day except 00:00–03:00 Cairo. */
  const sameDay = cairoToday() === day;
  let slotId: string;
  let settingsBefore: {
    vatEnabled: boolean;
    defaultVatRate: Prisma.Decimal;
    pricesIncludeVat: boolean;
    dayCloseOpenItemsPolicy: 'ALERT' | 'BLOCK';
  };
  let loyaltyBefore: Record<string, unknown>;
  let taxableBefore: Array<{ id: string; isTaxable: boolean }>;

  const visit: Record<
    string,
    { bookingId: string; queueEntryId: string; money: Money }
  > = {};
  let drawerId = '';
  let closingId = '';
  const paid = { cash: 0, card: 0, instapay: 0, wallet: 0, loyalty: 0 };
  let lineDiscount = 0;
  let receiptDiscount = 0;

  const url = (p: string) => `/api/v1/dashboard${p}`;

  beforeAll(async () => {
    app = await createApp();
    api = new Api(app);
    J = await createJourneyBranch('Journey Day');
    // 00:05 today has already started: every booking needs the audited "started" reason,
    // and the no-show is allowed. Works at any hour except the first minutes after midnight.
    slotId = (
      await createBranchSlot(J.id, {
        date: cairoToday(),
        start: '00:05:00',
        capacity: 10,
      })
    ).id;
    const s = await prisma.systemSettings.findFirstOrThrow();
    settingsBefore = {
      vatEnabled: s.vatEnabled,
      defaultVatRate: s.defaultVatRate,
      pricesIncludeVat: s.pricesIncludeVat,
      dayCloseOpenItemsPolicy: s.dayCloseOpenItemsPolicy,
    };
    // VAT 14 % on top of prices, so the day exercises VAT arithmetic too.
    await prisma.systemSettings.update({
      where: { id: s.id },
      data: {
        vatEnabled: true,
        defaultVatRate: new Prisma.Decimal('0.14'),
        pricesIncludeVat: false,
        dayCloseOpenItemsPolicy: 'ALERT',
      },
    });
    taxableBefore = await prisma.service.findMany({
      where: { id: { in: [SVC_CUT, SVC_MANI] } },
      select: { id: true, isTaxable: true },
    });
    await prisma.service.updateMany({
      where: { id: { in: [SVC_CUT, SVC_MANI] } },
      data: { isTaxable: true },
    });
    const owner = await api.as('owner');
    loyaltyBefore = (await owner.get(url('/loyalty/settings'))).body as Record<
      string,
      unknown
    >;
    const on = await owner.patch(url('/loyalty/settings'), {
      enabled: true,
      pointsPerEgp: 1,
      redeemPoints: 1000,
      redeemValue: 50,
      visitsForReward: 5,
    });
    expect(on.status).toBe(200);
  });

  afterAll(async () => {
    const s = await prisma.systemSettings.findFirstOrThrow();
    await prisma.systemSettings.update({
      where: { id: s.id },
      data: settingsBefore,
    });
    for (const t of taxableBefore) {
      await prisma.service.update({
        where: { id: t.id },
        data: { isTaxable: t.isTaxable },
      });
    }
    const owner = await api.as('owner');
    await owner.patch(url('/loyalty/settings'), {
      enabled: loyaltyBefore.enabled,
      pointsPerEgp: loyaltyBefore.pointsPerEgp,
      redeemPoints: loyaltyBefore.redeemPoints,
      redeemValue: loyaltyBefore.redeemValue,
      visitsForReward: loyaltyBefore.visitsForReward,
    });
    await releaseJourneyBranch(J);
    await app.close();
    await prisma.$disconnect();
  });

  async function newClient(name: string) {
    return prisma.client.create({
      data: { fullName: name, phone: uniquePhone(), preferredBranchId: J.id },
    });
  }

  async function invoiceMoney(
    bookingId: string,
  ): Promise<Money & { remaining: number }> {
    const inv = await prisma.invoice.findFirstOrThrow({
      where: { bookingId, status: 'FINALIZED' },
    });
    return {
      total: Number(inv.totalAmount),
      subtotal: Number(inv.subtotal),
      discount: Number(inv.discountAmount),
      vat: Number(inv.vatAmount),
      remaining: Number(inv.remainingAmount),
    };
  }

  /** Booking → check-in → each line started with Mona and finished → invoice finalized. */
  async function bookedVisit(
    key: string,
    services: string[],
    beforeFinalize?: (b: {
      id: string;
      items: Array<{ id: string }>;
    }) => Promise<void>,
  ) {
    const rec = await api.as('receptionist');
    const client = await newClient(`Journey ${key}`);
    const created = await rec.post(url('/bookings'), {
      clientId: client.id,
      branchId: J.id,
      slotId,
      source: 'PHONE',
      initialStatus: 'CONFIRMED',
      items: services.map((serviceId) => ({
        itemType: 'SERVICE',
        serviceId,
        quantity: 1,
      })),
      overrideReason: 'Journey test: slot already started',
    });
    expect(created.status).toBe(201);
    const booking = created.body as {
      id: string;
      items: Array<{ id: string }>;
    };
    const q = await rec.post(url(`/bookings/${booking.id}/check-in`));
    expect(q.status).toBe(201);
    await runLines(booking, q.body.id as string);
    if (beforeFinalize) await beforeFinalize(booking);
    return finalize(key, booking.id, q.body.id as string, client.id);
  }

  async function runLines(
    booking: { id: string; items: Array<{ id: string }> },
    queueEntryId: string,
  ) {
    const rec = await api.as('receptionist');
    for (const [i, item] of booking.items.entries()) {
      const started =
        i === 0
          ? await rec.post(url(`/queue/${queueEntryId}/start`), {
              starts: [
                { bookingItemId: item.id, staffProfileId: J.staffProfileId },
              ],
            })
          : await rec.post(
              url(`/bookings/${booking.id}/service-items/${item.id}/start`),
              { staffProfileId: J.staffProfileId },
            );
      expect(started.status).toBe(201);
      const done = await rec.post(
        url(`/bookings/${booking.id}/service-items/${item.id}/complete`),
      );
      expect(done.status).toBe(201);
    }
  }

  async function finalize(
    key: string,
    bookingId: string,
    queueEntryId: string,
    clientId: string,
  ) {
    const rec = await api.as('receptionist');
    const fin = await rec.post(url(`/queue/${queueEntryId}/invoice/finalize`));
    expect(fin.status).toBe(201);
    const money = await invoiceMoney(bookingId);
    // Arithmetic: total = subtotal − discount + VAT, VAT = 14 % of the discounted amount.
    expect(money.total).toBeCloseTo(
      money.subtotal - money.discount + money.vat,
      2,
    );
    expect(money.vat).toBeCloseTo((money.subtotal - money.discount) * 0.14, 1);
    visit[key] = { bookingId, queueEntryId, money };
    return { bookingId, queueEntryId, clientId, money };
  }

  async function pay(key: string, amount: number, method: string) {
    const rec = await api.as('receptionist');
    const r = await rec.post(
      url(`/queue/${visit[key].queueEntryId}/payments`),
      {
        amount,
        method,
      },
    );
    expect(r.status).toBe(201);
    return r.body as { payment: { id: string } };
  }

  async function close(key: string, reason?: string) {
    const rec = await api.as('receptionist');
    return rec.post(
      url(`/queue/${visit[key].queueEntryId}/complete`),
      reason ? { closeWithBalanceReason: reason } : {},
    );
  }

  it('D01 before opening: the day shows no drawer and no money', async () => {
    const rec = await api.as('receptionist');
    const s = await rec.get(
      url(`/daily-closing/summary?branchId=${J.id}&date=${day}`),
    );
    expect(s.status).toBe(200);
    expect(s.body.status).toBe('OPEN');
    expect(s.body.cashDrawerSummary.state).toBe('NONE');
    expect(s.body.salesSummary.grossSales).toBe(0);
    expect(s.body.salesSummary.totalCollected).toBe(0);
  });

  it('D02 reception opens the drawer with 500; a second opening and a negative float are refused', async () => {
    const rec = await api.as('receptionist');
    const negative = await rec.post(url('/cash-drawer/open'), {
      branchId: J.id,
      businessDate: day,
      openingBalance: -1,
    });
    expect(negative.status).toBe(400);
    const opened = await rec.post(url('/cash-drawer/open'), {
      branchId: J.id,
      businessDate: day,
      openingBalance: 500,
      notes: 'Morning float',
    });
    expect(opened.status).toBe(201);
    drawerId = opened.body.session.id as string;
    expect(opened.body.summary.expectedCash).toBe(500);
    const again = await rec.post(url('/cash-drawer/open'), {
      branchId: J.id,
      businessDate: day,
      openingBalance: 500,
    });
    expect(again.status).toBe(409);
  });

  it('D03 visit A: booked haircut, paid in full in cash, closed', async () => {
    const v = await bookedVisit('A', [SVC_CUT]);
    await pay('A', v.money.total, 'CASH');
    paid.cash += v.money.total;
    const closed = await close('A');
    expect(closed.status).toBe(201);
    expect(closed.body.status).toBe('COMPLETED');
    expect((await invoiceMoney(v.bookingId)).remaining).toBeCloseTo(0, 2);
  });

  it('D04 visit B: walk-in manicure, split 100 card + the rest in cash', async () => {
    const rec = await api.as('receptionist');
    const client = await newClient('Journey B walk-in');
    const walk = await rec.post(url('/queue/walk-ins'), {
      branchId: J.id,
      clientId: client.id,
      items: [{ itemType: 'SERVICE', serviceId: SVC_MANI, quantity: 1 }],
    });
    expect(walk.status).toBe(201);
    const queueEntryId = walk.body.id as string;
    const bookingId = walk.body.bookingId as string;
    const booking = (await rec.get(url(`/bookings/${bookingId}`))).body as {
      id: string;
      items: Array<{ id: string }>;
    };
    await runLines(booking, queueEntryId);
    const v = await finalize('B', bookingId, queueEntryId, client.id);
    await pay('B', 100, 'CARD');
    await pay('B', Number((v.money.total - 100).toFixed(2)), 'CASH');
    paid.card += 100;
    paid.cash += Number((v.money.total - 100).toFixed(2));
    expect((await close('B')).status).toBe(201);
  });

  it('D05 visit C: two services, a line discount by reception and a receipt discount by the owner, part paid by InstaPay, closed with a balance', async () => {
    const owner = await api.as('owner');
    const rec = await api.as('receptionist');
    const cutPrice = Number(
      (await prisma.service.findUniqueOrThrow({ where: { id: SVC_CUT } }))
        .basePrice,
    );
    const v = await bookedVisit('C', [SVC_CUT, SVC_MANI], async (b) => {
      // Reception may discount a line up to 15 % with a reason.
      lineDiscount = Math.floor(cutPrice * 0.1);
      const tooMuch = await rec.patch(
        url(`/bookings/${b.id}/items/${b.items[0].id}/discount`),
        { discountAmount: Math.ceil(cutPrice * 0.5), reason: 'too generous' },
      );
      expect(tooMuch.status).toBe(403);
      const line = await rec.patch(
        url(`/bookings/${b.id}/items/${b.items[0].id}/discount`),
        { discountAmount: lineDiscount, reason: 'Regular client' },
      );
      expect(line.status).toBe(200);
      receiptDiscount = 50;
      const receipt = await owner.post(url(`/bookings/${b.id}/discount`), {
        discountAmount: receiptDiscount,
        reason: 'Owner goodwill',
      });
      expect(receipt.status).toBe(201);
    });
    expect(v.money.discount).toBeGreaterThan(0);
    await pay('C', 200, 'INSTAPAY');
    paid.instapay += 200;
    const noReason = await close('C');
    expect(noReason.status).toBe(409);
    expect(noReason.body.overridable).toBe(true);
    const withReason = await close('C', 'Client pays the rest tomorrow');
    expect(withReason.status).toBe(201);
    const after = await invoiceMoney(v.bookingId);
    expect(after.remaining).toBeCloseTo(v.money.total - 200, 2);
  });

  it('D06 visit D: 1,000 loyalty points take 50 off, the rest by mobile wallet', async () => {
    const owner = await api.as('owner');
    const rec = await api.as('receptionist');
    const v = await bookedVisit('D', [SVC_CUT]);
    const adj = await owner.post(url(`/loyalty/clients/${v.clientId}/adjust`), {
      points: 1000,
      note: 'Opening balance from the paper card',
    });
    expect(adj.status).toBe(200);
    const redeem = await rec.post(
      url(`/queue/${v.queueEntryId}/loyalty/redeem-points`),
      {
        blocks: 1,
      },
    );
    expect(redeem.status).toBe(200);
    expect(redeem.body.amount).toBe(50);
    paid.loyalty += 50;
    await pay('D', Number((v.money.total - 50).toFixed(2)), 'MOBILE_WALLET');
    paid.wallet += Number((v.money.total - 50).toFixed(2));
    expect((await close('D')).status).toBe(201);
  });

  it('D07 visit E: a cash payment entered by mistake is voided by the owner, then paid by card', async () => {
    const owner = await api.as('owner');
    const rec = await api.as('receptionist');
    const v = await bookedVisit('E', [SVC_MANI]);
    const wrong = await pay('E', v.money.total, 'CASH');
    const recVoid = await rec.patch(url(`/payments/${wrong.payment.id}`), {
      status: 'CANCELLED',
    });
    expect(recVoid.status).toBe(403);
    const voided = await owner.patch(url(`/payments/${wrong.payment.id}`), {
      status: 'CANCELLED',
    });
    expect(voided.status).toBe(200);
    expect((await invoiceMoney(v.bookingId)).remaining).toBeCloseTo(
      v.money.total,
      2,
    );
    await pay('E', v.money.total, 'CARD');
    paid.card += v.money.total;
    expect((await close('E')).status).toBe(201);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'payment.voided', entityId: wrong.payment.id },
    });
    expect(audit).toBeTruthy();
  });

  it('D08 a booking cancelled before arrival and a no-show bring in no money', async () => {
    const rec = await api.as('receptionist');
    for (const [name, action] of [
      ['F', 'cancel'],
      ['G', 'mark-no-show'],
    ] as const) {
      const client = await newClient(`Journey ${name}`);
      const b = await rec.post(url('/bookings'), {
        clientId: client.id,
        branchId: J.id,
        slotId,
        source: 'PHONE',
        initialStatus: 'CONFIRMED',
        items: [{ itemType: 'SERVICE', serviceId: SVC_CUT, quantity: 1 }],
        overrideReason: 'Journey test: slot already started',
      });
      expect(b.status).toBe(201);
      const r = await rec.post(url(`/bookings/${b.body.id}/${action}`));
      expect(r.status).toBe(201);
      expect(r.body.status).toBe(action === 'cancel' ? 'CANCELLED' : 'NO_SHOW');
    }
  });

  it('D09 reception records cash taken out for supplies and change put in; zero or no reason is refused', async () => {
    const rec = await api.as('receptionist');
    const m = url(`/cash-drawer/${drawerId}/movements`);
    expect(
      (await rec.post(m, { type: 'CASH_OUT', amount: 0, reason: 'x' })).status,
    ).toBe(400);
    expect(
      (await rec.post(m, { type: 'CASH_OUT', amount: 10, reason: ' ' })).status,
    ).toBe(400);
    expect(
      (
        await rec.post(m, {
          type: 'CASH_OUT',
          amount: 100,
          reason: 'Cleaning supplies',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await rec.post(m, {
          type: 'CASH_IN',
          amount: 50,
          reason: 'Change from the bank',
        })
      ).status,
    ).toBe(201);
  });

  it('D10 the drawer expects opening float + cash taken − cash out + cash in (the voided cash is not counted)', async () => {
    const rec = await api.as('receptionist');
    const cur = await rec.get(
      url(`/cash-drawer/current?branchId=${J.id}&date=${day}`),
    );
    expect(cur.status).toBe(200);
    expect(cur.body.summary.cashPaymentsTotal).toBeCloseTo(paid.cash, 2);
    expect(cur.body.summary.expectedCash).toBeCloseTo(
      500 + paid.cash - 100 + 50,
      2,
    );
  });

  it('D11 reception may save the closing draft but may not close the drawer or the day', async () => {
    const rec = await api.as('receptionist');
    const draft = await rec.post(url('/daily-closing'), {
      branchId: J.id,
      businessDate: day,
      notes: 'Draft by reception',
    });
    expect(draft.status).toBe(201);
    closingId = draft.body.id as string;
    expect(draft.body.status).toBe('DRAFT');
    expect(
      (
        await rec.post(url(`/cash-drawer/${drawerId}/close`), {
          countedCash: 1,
        })
      ).status,
    ).toBe(403);
    expect(
      (await rec.post(url(`/daily-closing/${closingId}/close`), {})).status,
    ).toBe(403);
  });

  it('D12 the day cannot be closed while the drawer is open', async () => {
    const owner = await api.as('owner');
    const r = await owner.post(url(`/daily-closing/${closingId}/close`), {
      carryOverReason: 'x',
    });
    expect(r.status).toBe(400);
    expect(String(r.body.message)).toMatch(/cash drawer/i);
  });

  it('D13 the owner closes the drawer 20 short; a closed drawer cannot be changed or reopened', async () => {
    const owner = await api.as('owner');
    const expected = 500 + paid.cash - 100 + 50;
    const closed = await owner.post(url(`/cash-drawer/${drawerId}/close`), {
      countedCash: expected - 20,
      notes: 'Counted at 9 pm',
    });
    expect(closed.status).toBe(201);
    expect(closed.body.summary.status).toBe('CLOSED');
    expect(closed.body.summary.cashDifference).toBeCloseTo(-20, 2);
    expect(
      (
        await owner.post(url(`/cash-drawer/${drawerId}/movements`), {
          type: 'CASH_IN',
          amount: 5,
          reason: 'late',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await owner.patch(url(`/cash-drawer/${drawerId}`), {
          countedCash: expected,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await owner.post(url(`/cash-drawer/${drawerId}/close`), {
          countedCash: expected,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await owner.post(url('/cash-drawer/open'), {
          branchId: J.id,
          businessDate: day,
          openingBalance: 0,
        })
      ).status,
    ).toBe(400);
  });

  it('D14 with the drawer closed, a late cash payment is refused (card is still possible)', async () => {
    const rec = await api.as('receptionist');
    const cash = await rec.post(
      url(`/queue/${visit.C.queueEntryId}/payments`),
      {
        amount: 10,
        method: 'CASH',
      },
    );
    expect(cash.status).toBe(409);
    expect(cash.body.code).toBe('CASH_DRAWER_CLOSED');
  });

  it('D15 the closing summary adds up: sales, discounts, every payment method, loyalty, balance, counts, warnings', async () => {
    const owner = await api.as('owner');
    const s = await owner.get(
      url(`/daily-closing/summary?branchId=${J.id}&date=${day}`),
    );
    expect(s.status).toBe(200);
    const totals = Object.values(visit).map((v) => v.money.total);
    const gross = totals.reduce((a, b) => a + b, 0);
    expect(s.body.salesSummary.grossSales).toBeCloseTo(gross, 2);
    const collected = paid.cash + paid.card + paid.instapay + paid.wallet;
    expect(s.body.salesSummary.totalCollected).toBeCloseTo(collected, 2);
    expect(s.body.salesSummary.loyaltyRedeemed).toBeCloseTo(50, 2);
    expect(s.body.salesSummary.totalDiscounts).toBeCloseTo(
      lineDiscount + receiptDiscount,
      2,
    );
    expect(s.body.paymentBreakdown.CASH.amount).toBeCloseTo(paid.cash, 2);
    expect(s.body.paymentBreakdown.CARD.amount).toBeCloseTo(paid.card, 2);
    expect(s.body.paymentBreakdown.INSTAPAY.amount).toBeCloseTo(200, 2);
    expect(s.body.paymentBreakdown.MOBILE_WALLET.amount).toBeCloseTo(
      paid.wallet,
      2,
    );
    // A cash, B card + cash, C InstaPay, D wallet, E card (the voided cash and the loyalty
    // redemption are not payments received).
    expect(s.body.paymentSummary.paymentCount).toBe(6);
    expect(s.body.invoiceSummary.finalizedCount).toBe(5);
    expect(s.body.invoiceSummary.paidCount).toBe(4);
    expect(s.body.invoiceSummary.partiallyPaidCount).toBe(1);
    expect(s.body.salesSummary.outstandingBalance).toBeCloseTo(
      visit.C.money.total - 200,
      2,
    );
    expect(s.body.cashDrawerSummary.state).toBe('CLOSED');
    expect(s.body.cashDrawerSummary.cashDifference).toBeCloseTo(-20, 2);
    expect(s.body.operationalSummary.queueVisitCount).toBe(5);
    expect(s.body.operationalSummary.queueCompletedCount).toBe(5);
    expect(s.body.operationalSummary.queueActiveCount).toBe(0);
    if (sameDay) {
      expect(s.body.operationalSummary.cancelledBookingCount).toBe(2);
      expect(s.body.operationalSummary.completedBookingCount).toBe(5);
    }
    expect(s.body.openItems.unpaidInvoices).toHaveLength(1);
    expect(s.body.openItems.openVisits).toHaveLength(0);
    const warnings = (s.body.warnings as string[]).join(' | ');
    expect(warnings).toMatch(/partially paid/i);
    expect(warnings).toMatch(/does not match/i);
  });

  it('D16 with the BLOCK policy the day cannot be closed while a balance is open', async () => {
    const owner = await api.as('owner');
    await prisma.systemSettings.updateMany({
      data: { dayCloseOpenItemsPolicy: 'BLOCK' },
    });
    const r = await owner.post(url(`/daily-closing/${closingId}/close`), {
      carryOverReason: 'try anyway',
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('DAY_CLOSE_OPEN_ITEMS');
    await prisma.systemSettings.updateMany({
      data: { dayCloseOpenItemsPolicy: 'ALERT' },
    });
  });

  it('D17 with the ALERT policy the owner closes the day by carrying the balance over with a reason', async () => {
    const owner = await api.as('owner');
    const ask = await owner.post(url(`/daily-closing/${closingId}/close`), {});
    expect(ask.status).toBe(409);
    expect(ask.body.overridable).toBe(true);
    const closed = await owner.post(url(`/daily-closing/${closingId}/close`), {
      carryOverReason: 'Client C pays the balance tomorrow',
      notes: 'Day closed',
    });
    expect(closed.status).toBe(201);
    expect(closed.body.status).toBe('CLOSED');
    expect(closed.body.readOnly).toBe(true);
    const saved = closed.body.savedSnapshot as {
      carriedOver: { reason: string; unpaidInvoices: unknown[] };
    };
    expect(saved.carriedOver.reason).toBe('Client C pays the balance tomorrow');
    expect(saved.carriedOver.unpaidInvoices).toHaveLength(1);
    expect(closed.body.totals.totalCollected).toBeCloseTo(
      paid.cash + paid.card + paid.instapay + paid.wallet,
      2,
    );
    expect(closed.body.totals.cashDifference).toBeCloseTo(-20, 2);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'dailyClosing.closed', entityId: closingId },
    });
    expect(audit).toBeTruthy();
  });

  it('D18 a closed day stays closed: no new draft, no second close, no payment, no void', async () => {
    const owner = await api.as('owner');
    const rec = await api.as('receptionist');
    expect(
      (
        await rec.post(url('/daily-closing'), {
          branchId: J.id,
          businessDate: day,
        })
      ).status,
    ).toBe(400);
    expect(
      (await owner.post(url(`/daily-closing/${closingId}/close`), {})).status,
    ).toBe(400);
    const late = await rec.post(
      url(`/queue/${visit.C.queueEntryId}/payments`),
      {
        amount: 10,
        method: 'CARD',
      },
    );
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('BUSINESS_DAY_CLOSED');
    const aPayment = await prisma.payment.findFirstOrThrow({
      where: { bookingId: visit.A.bookingId, status: 'PAID' },
    });
    const voidLate = await owner.patch(url(`/payments/${aPayment.id}`), {
      status: 'CANCELLED',
    });
    expect(voidLate.status).toBe(409);
    expect(voidLate.body.code).toBe('BUSINESS_DAY_CLOSED');
    // The closed day's figures did not move.
    const again = await owner.get(url(`/daily-closing/${closingId}`));
    expect(again.body.totals.totalCollected).toBeCloseTo(
      paid.cash + paid.card + paid.instapay + paid.wallet,
      2,
    );
  });
});
