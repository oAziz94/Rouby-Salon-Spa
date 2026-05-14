import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashDrawerMovementType,
  CashDrawerSessionStatus,
  Prisma,
} from '@prisma/client';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertDashboardBranchAccess,
  resolveDashboardBranchFilter,
} from '../billing/dashboard-branch-scope';
import { AuditService } from '../audit/audit.service';
import { paidCashPaymentsOnDayWhere } from './finance-day.util';
import { parseBusinessDateUtc } from './finance-day.util';

function dec(n: Prisma.Decimal | number | null | undefined): Prisma.Decimal {
  if (n === null || n === undefined) {
    return new Prisma.Decimal(0);
  }
  if (n instanceof Prisma.Decimal) {
    return n;
  }
  return new Prisma.Decimal(n);
}

function num(d: Prisma.Decimal): number {
  return Number(d.toString());
}

function shortSessionRef(id: string): string {
  const compact = id.replace(/-/g, '').toUpperCase();
  return `CD-${compact.slice(-6)}`;
}

@Injectable()
export class CashDrawerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private resolveBranchId(user: DashboardJwtUser, branchId?: string): string {
    const resolved = resolveDashboardBranchFilter(user, branchId);
    if (!resolved) {
      throw new BadRequestException('branchId is required');
    }
    assertDashboardBranchAccess(user, resolved);
    return resolved;
  }

  private assertPermission(user: DashboardJwtUser, key: string): void {
    if (!user.permissions.includes(key)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private async movementTotals(sessionId: string): Promise<{
    cashIn: Prisma.Decimal;
    cashOut: Prisma.Decimal;
    adjustment: Prisma.Decimal;
  }> {
    const rows = await this.prisma.cashDrawerMovement.groupBy({
      by: ['type'],
      where: { drawerSessionId: sessionId },
      _sum: { amount: true },
    });
    let cashIn = new Prisma.Decimal(0);
    let cashOut = new Prisma.Decimal(0);
    let adjustment = new Prisma.Decimal(0);
    for (const r of rows) {
      const s = r._sum.amount ?? new Prisma.Decimal(0);
      if (r.type === CashDrawerMovementType.CASH_IN) {
        cashIn = s;
      } else if (r.type === CashDrawerMovementType.CASH_OUT) {
        cashOut = s;
      } else if (r.type === CashDrawerMovementType.ADJUSTMENT) {
        adjustment = s;
      }
    }
    return { cashIn, cashOut, adjustment };
  }

  private async cashPaymentsTotal(
    branchId: string,
    dateStr: string,
  ): Promise<Prisma.Decimal> {
    const r = await this.prisma.payment.aggregate({
      where: paidCashPaymentsOnDayWhere(branchId, dateStr),
      _sum: { amount: true },
    });
    return r._sum.amount ?? new Prisma.Decimal(0);
  }

  computeExpectedCash(params: {
    openingBalance: Prisma.Decimal;
    cashPaymentsTotal: Prisma.Decimal;
    cashIn: Prisma.Decimal;
    cashOut: Prisma.Decimal;
    adjustment: Prisma.Decimal;
  }): Prisma.Decimal {
    return params.openingBalance
      .plus(params.cashPaymentsTotal)
      .plus(params.cashIn)
      .minus(params.cashOut)
      .plus(params.adjustment);
  }

  async buildLiveTotals(session: {
    id: string;
    branchId: string;
    openingBalance: Prisma.Decimal;
    businessDate: Date;
  }) {
    const dateStr = session.businessDate.toISOString().slice(0, 10);
    const [cashPaymentsTotal, mov] = await Promise.all([
      this.cashPaymentsTotal(session.branchId, dateStr),
      this.movementTotals(session.id),
    ]);
    const expectedCash = this.computeExpectedCash({
      openingBalance: session.openingBalance,
      cashPaymentsTotal,
      cashIn: mov.cashIn,
      cashOut: mov.cashOut,
      adjustment: mov.adjustment,
    });
    return {
      dateStr,
      cashPaymentsTotal,
      cashInTotal: mov.cashIn,
      cashOutTotal: mov.cashOut,
      adjustmentTotal: mov.adjustment,
      expectedCash,
    };
  }

  async computeLiveForBranchBusinessDay(branchId: string, businessDate: Date) {
    const session = await this.prisma.cashDrawerSession.findUnique({
      where: { branchId_businessDate: { branchId, businessDate } },
    });
    if (!session) {
      return null;
    }
    const live = await this.buildLiveTotals(session);
    return { session, live };
  }

  async syncExpectedCash(sessionId: string): Promise<void> {
    const session = await this.prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.status !== CashDrawerSessionStatus.OPEN) {
      return;
    }
    const live = await this.buildLiveTotals(session);
    await this.prisma.cashDrawerSession.update({
      where: { id: sessionId },
      data: { expectedCash: live.expectedCash },
    });
  }

  private mapMovement(m: {
    id: string;
    type: CashDrawerMovementType;
    amount: Prisma.Decimal;
    reason: string;
    notes: string | null;
    createdAt: Date;
    createdBy: { id: string; name: string };
  }) {
    return {
      id: m.id,
      type: m.type,
      amount: num(m.amount),
      reason: m.reason,
      notes: m.notes,
      createdAt: m.createdAt.toISOString(),
      createdBy: { id: m.createdBy.id, name: m.createdBy.name },
    };
  }

  private async recentCashPayments(branchId: string, dateStr: string) {
    const rows = await this.prisma.payment.findMany({
      where: paidCashPaymentsOnDayWhere(branchId, dateStr),
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
      include: {
        client: { select: { id: true, fullName: true } },
        createdByUser: { select: { id: true, name: true } },
        booking: {
          select: {
            id: true,
            invoices: {
              where: { status: 'FINALIZED' },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { id: true, invoiceNumber: true },
            },
          },
        },
      },
    });
    return rows.map((p) => {
      const inv = p.booking.invoices[0];
      return {
        id: p.id,
        amount: num(p.amount),
        paidAt: p.paidAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        client: p.client
          ? { id: p.client.id, fullName: p.client.fullName }
          : null,
        cashier: p.createdByUser
          ? { id: p.createdByUser.id, name: p.createdByUser.name }
          : null,
        invoice: inv ? { id: inv.id, invoiceNumber: inv.invoiceNumber } : null,
        bookingId: p.booking.id,
      };
    });
  }

  async getCurrent(user: DashboardJwtUser, branchId: string, date: string) {
    this.assertPermission(user, 'cashDrawer.read');
    const bid = this.resolveBranchId(user, branchId);
    const businessDate = parseBusinessDateUtc(date);
    const session = await this.prisma.cashDrawerSession.findUnique({
      where: {
        branchId_businessDate: { branchId: bid, businessDate },
      },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        movements: {
          orderBy: { createdAt: 'desc' },
          include: { createdBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!session) {
      return {
        session: null,
        summary: null,
        recentCashPayments: await this.recentCashPayments(bid, date),
      };
    }
    const live = await this.buildLiveTotals(session);
    await this.prisma.cashDrawerSession.update({
      where: { id: session.id },
      data: { expectedCash: live.expectedCash },
    });
    const counted = session.countedCash;
    const diff =
      counted !== null ? dec(counted).minus(live.expectedCash) : null;
    return {
      session: this.mapSession(
        { ...session, expectedCash: live.expectedCash },
        live,
        diff,
      ),
      summary: {
        openingBalance: num(session.openingBalance),
        cashPaymentsTotal: num(live.cashPaymentsTotal),
        cashInTotal: num(live.cashInTotal),
        cashOutTotal: num(live.cashOutTotal),
        adjustmentTotal: num(live.adjustmentTotal),
        expectedCash: num(live.expectedCash),
        countedCash: counted !== null ? num(counted) : null,
        cashDifference: diff !== null ? num(diff) : null,
        status: session.status,
      },
      recentCashPayments: await this.recentCashPayments(bid, date),
    };
  }

  private mapSession(
    session: {
      id: string;
      branchId: string;
      status: CashDrawerSessionStatus;
      openingBalance: Prisma.Decimal;
      expectedCash: Prisma.Decimal;
      countedCash: Prisma.Decimal | null;
      cashDifference: Prisma.Decimal | null;
      openedAt: Date;
      closedAt: Date | null;
      notes: string | null;
      openedBy: { id: string; name: string };
      closedBy: { id: string; name: string } | null;
      movements: Array<
        Prisma.CashDrawerMovementGetPayload<{
          include: { createdBy: { select: { id: true; name: true } } };
        }>
      >;
    },
    live: Awaited<ReturnType<CashDrawerService['buildLiveTotals']>>,
    difference: Prisma.Decimal | null,
  ) {
    return {
      id: session.id,
      shortRef: shortSessionRef(session.id),
      branchId: session.branchId,
      businessDate: live.dateStr,
      status: session.status,
      openingBalance: num(session.openingBalance),
      expectedCash: num(live.expectedCash),
      countedCash:
        session.countedCash !== null ? num(session.countedCash) : null,
      cashDifference:
        difference !== null
          ? num(difference)
          : session.cashDifference !== null
            ? num(session.cashDifference)
            : null,
      notes: session.notes,
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() ?? null,
      openedBy: session.openedBy,
      closedBy: session.closedBy,
      movements: session.movements.map((m) =>
        this.mapMovement({
          ...m,
          createdBy: m.createdBy,
        }),
      ),
      totals: {
        cashPaymentsTotal: num(live.cashPaymentsTotal),
        cashInTotal: num(live.cashInTotal),
        cashOutTotal: num(live.cashOutTotal),
        adjustmentTotal: num(live.adjustmentTotal),
      },
    };
  }

  async open(
    user: DashboardJwtUser,
    body: {
      branchId: string;
      businessDate: string;
      openingBalance: number;
      notes?: string;
    },
  ) {
    this.assertPermission(user, 'cashDrawer.open');
    const bid = this.resolveBranchId(user, body.branchId);
    const businessDate = parseBusinessDateUtc(body.businessDate);
    const openingBalance = dec(body.openingBalance);
    if (openingBalance.lessThan(0)) {
      throw new BadRequestException('openingBalance must be >= 0');
    }
    const existing = await this.prisma.cashDrawerSession.findUnique({
      where: { branchId_businessDate: { branchId: bid, businessDate } },
    });
    if (existing) {
      if (existing.status === CashDrawerSessionStatus.OPEN) {
        throw new ConflictException('Cash drawer is already open for this day');
      }
      throw new BadRequestException(
        'Cash drawer for this day is already closed and cannot be reopened',
      );
    }
    const session = await this.prisma.cashDrawerSession.create({
      data: {
        branchId: bid,
        businessDate,
        status: CashDrawerSessionStatus.OPEN,
        openingBalance,
        expectedCash: openingBalance,
        openedByUserId: user.userId,
        notes: body.notes?.trim() || null,
      },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        movements: {
          orderBy: { createdAt: 'desc' },
          include: { createdBy: { select: { id: true, name: true } } },
        },
      },
    });
    const live = await this.buildLiveTotals(session);
    await this.prisma.cashDrawerSession.update({
      where: { id: session.id },
      data: { expectedCash: live.expectedCash },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'cashDrawer.opened',
      module: 'cashDrawer',
      entityType: 'CashDrawerSession',
      entityId: session.id,
      branchId: bid,
      severity: 'INFO',
      newValue: {
        businessDate: body.businessDate,
        openingBalance: Number(openingBalance.toString()),
      },
    });
    return this.getCurrent(user, bid, body.businessDate);
  }

  async getById(user: DashboardJwtUser, sessionId: string) {
    this.assertPermission(user, 'cashDrawer.read');
    const session = await this.prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        movements: {
          orderBy: { createdAt: 'desc' },
          include: { createdBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!session) {
      throw new NotFoundException('Cash drawer session not found');
    }
    assertDashboardBranchAccess(user, session.branchId);
    const live = await this.buildLiveTotals(session);
    await this.prisma.cashDrawerSession.update({
      where: { id: session.id },
      data: { expectedCash: live.expectedCash },
    });
    const counted = session.countedCash;
    const diff =
      counted !== null
        ? dec(counted).minus(live.expectedCash)
        : session.cashDifference;
    return {
      session: this.mapSession(
        { ...session, expectedCash: live.expectedCash },
        live,
        diff,
      ),
      summary: {
        openingBalance: num(session.openingBalance),
        cashPaymentsTotal: num(live.cashPaymentsTotal),
        cashInTotal: num(live.cashInTotal),
        cashOutTotal: num(live.cashOutTotal),
        adjustmentTotal: num(live.adjustmentTotal),
        expectedCash: num(live.expectedCash),
        countedCash: counted !== null ? num(counted) : null,
        cashDifference: diff !== null ? num(diff) : null,
        status: session.status,
      },
      recentCashPayments: await this.recentCashPayments(
        session.branchId,
        live.dateStr,
      ),
    };
  }

  async patch(
    user: DashboardJwtUser,
    sessionId: string,
    body: { countedCash?: number; notes?: string },
  ) {
    this.assertPermission(user, 'cashDrawer.update');
    const session = await this.prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Cash drawer session not found');
    }
    assertDashboardBranchAccess(user, session.branchId);
    if (session.status !== CashDrawerSessionStatus.OPEN) {
      throw new BadRequestException('Cash drawer is not open');
    }
    const live = await this.buildLiveTotals(session);
    const counted =
      body.countedCash !== undefined
        ? dec(body.countedCash)
        : session.countedCash;
    const cashDifference =
      counted !== null ? counted.minus(live.expectedCash) : null;
    await this.prisma.cashDrawerSession.update({
      where: { id: sessionId },
      data: {
        expectedCash: live.expectedCash,
        countedCash: counted,
        cashDifference,
        notes:
          body.notes !== undefined ? body.notes?.trim() || null : undefined,
      },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'cashDrawer.updated',
      module: 'cashDrawer',
      entityType: 'CashDrawerSession',
      entityId: sessionId,
      branchId: session.branchId,
      severity: 'INFO',
      oldValue: {
        countedCash:
          session.countedCash !== null
            ? Number(session.countedCash.toString())
            : null,
        notes: session.notes,
      },
      newValue: {
        countedCash: counted !== null ? Number(counted.toString()) : null,
        notes:
          body.notes !== undefined ? body.notes?.trim() || null : session.notes,
      },
    });
    return this.getById(user, sessionId);
  }

  async addMovement(
    user: DashboardJwtUser,
    sessionId: string,
    body: {
      type: CashDrawerMovementType;
      amount: number;
      reason: string;
      notes?: string;
    },
  ) {
    this.assertPermission(user, 'cashDrawer.movement.create');
    const session = await this.prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Cash drawer session not found');
    }
    assertDashboardBranchAccess(user, session.branchId);
    if (session.status !== CashDrawerSessionStatus.OPEN) {
      throw new BadRequestException('Cannot add movements to a closed drawer');
    }
    const amount = dec(body.amount);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('amount must be > 0');
    }
    const reason = body.reason?.trim();
    if (!reason) {
      throw new BadRequestException('reason is required');
    }
    await this.prisma.cashDrawerMovement.create({
      data: {
        drawerSessionId: sessionId,
        branchId: session.branchId,
        type: body.type,
        amount,
        reason,
        notes: body.notes?.trim() || null,
        createdByUserId: user.userId,
      },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'cashDrawer.movement_created',
      module: 'cashDrawer',
      entityType: 'CashDrawerSession',
      entityId: sessionId,
      branchId: session.branchId,
      severity: 'WARNING',
      newValue: {
        movementType: body.type,
        amount: Number(amount.toString()),
        reason,
      },
    });
    await this.syncExpectedCash(sessionId);
    return this.getById(user, sessionId);
  }

  async close(
    user: DashboardJwtUser,
    sessionId: string,
    body: { countedCash: number; notes?: string },
  ) {
    this.assertPermission(user, 'cashDrawer.close');
    const session = await this.prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Cash drawer session not found');
    }
    assertDashboardBranchAccess(user, session.branchId);
    if (session.status !== CashDrawerSessionStatus.OPEN) {
      throw new BadRequestException('Cash drawer is already closed');
    }
    const counted = dec(body.countedCash);
    const live = await this.buildLiveTotals(session);
    const cashDifference = counted.minus(live.expectedCash);
    await this.prisma.cashDrawerSession.update({
      where: { id: sessionId },
      data: {
        status: CashDrawerSessionStatus.CLOSED,
        expectedCash: live.expectedCash,
        countedCash: counted,
        cashDifference,
        closedByUserId: user.userId,
        closedAt: new Date(),
        notes:
          body.notes !== undefined
            ? body.notes?.trim() || session.notes
            : session.notes,
      },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'cashDrawer.closed',
      module: 'cashDrawer',
      entityType: 'CashDrawerSession',
      entityId: sessionId,
      branchId: session.branchId,
      severity: 'WARNING',
      newValue: {
        countedCash: Number(counted.toString()),
        expectedCash: Number(live.expectedCash.toString()),
        cashDifference: Number(cashDifference.toString()),
      },
    });
    return this.getById(user, sessionId);
  }
}
