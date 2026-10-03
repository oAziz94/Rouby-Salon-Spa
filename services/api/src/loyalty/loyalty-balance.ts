import {
  InvoiceStatus,
  LoyaltyTransactionType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
  QueueEntryStatus,
} from '@prisma/client';
import { SYSTEM_SETTINGS_ID } from '../settings/settings.constants';

/**
 * Loyalty rules and balance maths as plain functions, so the receipt (billing) can show a
 * client's points without billing depending on the loyalty module.
 */
type Db = PrismaClient | Prisma.TransactionClient;

export type LoyaltyRules = {
  enabled: boolean;
  pointsPerEgp: number;
  redeemPoints: number;
  redeemValue: number;
  visitsForReward: number;
  rewardServiceId: string | null;
  rewardServiceName: string | null;
  startedAt: string | null;
};

export type LoyaltySummary = {
  enabled: boolean;
  clientId: string;
  /** Spendable balance right now. */
  points: number;
  earnedPoints: number;
  redeemedPoints: number;
  adjustedPoints: number;
  /** How many redemption blocks the balance covers, and what each is worth. */
  redeemBlockPoints: number;
  redeemBlockValue: number;
  redeemableBlocks: number;
  visits: number;
  visitsForReward: number;
  rewardsEarned: number;
  rewardsUsed: number;
  rewardsAvailable: number;
  visitsToNextReward: number;
  rewardServiceId: string | null;
  rewardServiceName: string | null;
};

/** A visit counts toward the free reward only once its finalized invoice is fully settled. */
export const SETTLED_INVOICE: Prisma.InvoiceWhereInput = {
  status: InvoiceStatus.FINALIZED,
  remainingAmount: { lte: new Prisma.Decimal(0) },
};

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : Number(d.toString());

export async function loadLoyaltyRules(db: Db): Promise<LoyaltyRules> {
  const s = await db.systemSettings.findUnique({
    where: { id: SYSTEM_SETTINGS_ID },
    select: {
      loyaltyEnabled: true,
      loyaltyPointsPerEgp: true,
      loyaltyRedeemPoints: true,
      loyaltyRedeemValue: true,
      loyaltyVisitsForReward: true,
      loyaltyRewardServiceId: true,
      loyaltyStartedAt: true,
    },
  });
  const rewardService = s?.loyaltyRewardServiceId
    ? await db.service.findUnique({
        where: { id: s.loyaltyRewardServiceId },
        select: { name: true },
      })
    : null;
  return {
    enabled: s?.loyaltyEnabled ?? false,
    pointsPerEgp: num(s?.loyaltyPointsPerEgp ?? 1),
    redeemPoints: s?.loyaltyRedeemPoints ?? 1000,
    redeemValue: num(s?.loyaltyRedeemValue ?? 50),
    visitsForReward: s?.loyaltyVisitsForReward ?? 5,
    rewardServiceId: s?.loyaltyRewardServiceId ?? null,
    rewardServiceName: rewardService?.name ?? null,
    startedAt: s?.loyaltyStartedAt?.toISOString() ?? null,
  };
}

export async function computeLoyaltySummary(
  db: Db,
  clientId: string,
  rules: LoyaltyRules,
): Promise<LoyaltySummary> {
  const since = rules.startedAt ? new Date(rules.startedAt) : null;
  const [paid, ledger, visits] = await Promise.all([
    since
      ? db.payment.aggregate({
          where: {
            clientId,
            status: PaymentStatus.PAID,
            method: { not: PaymentMethod.LOYALTY },
            createdAt: { gte: since },
          },
          _sum: { amount: true },
        })
      : null,
    db.loyaltyTransaction.findMany({
      where: { clientId },
      select: {
        type: true,
        points: true,
        payment: { select: { status: true } },
      },
    }),
    since
      ? db.queueEntry.count({
          where: {
            clientId,
            status: QueueEntryStatus.COMPLETED,
            checkedInAt: { gte: since },
            booking: { invoices: { some: SETTLED_INVOICE } },
          },
        })
      : 0,
  ]);
  const earnedPoints = Math.floor(num(paid?._sum.amount) * rules.pointsPerEgp);
  let redeemedPoints = 0;
  let adjustedPoints = 0;
  let rewardsUsed = 0;
  for (const row of ledger) {
    // A redemption whose payment was cancelled/refunded gives the points (or reward) back.
    const live = !row.payment || row.payment.status === PaymentStatus.PAID;
    if (row.type === LoyaltyTransactionType.ADJUST) {
      adjustedPoints += row.points;
    } else if (row.type === LoyaltyTransactionType.REDEEM_POINTS && live) {
      redeemedPoints += -row.points;
    } else if (row.type === LoyaltyTransactionType.REWARD && live) {
      rewardsUsed += 1;
    }
  }
  const points = Math.max(0, earnedPoints + adjustedPoints - redeemedPoints);
  const rewardsEarned =
    rules.visitsForReward > 0 ? Math.floor(visits / rules.visitsForReward) : 0;
  const rewardsAvailable = Math.max(0, rewardsEarned - rewardsUsed);
  return {
    enabled: rules.enabled,
    clientId,
    points,
    earnedPoints,
    redeemedPoints,
    adjustedPoints,
    redeemBlockPoints: rules.redeemPoints,
    redeemBlockValue: rules.redeemValue,
    redeemableBlocks:
      rules.redeemPoints > 0 ? Math.floor(points / rules.redeemPoints) : 0,
    visits,
    visitsForReward: rules.visitsForReward,
    rewardsEarned,
    rewardsUsed,
    rewardsAvailable,
    visitsToNextReward:
      rules.visitsForReward > 0
        ? rules.visitsForReward - (visits % rules.visitsForReward)
        : 0,
    rewardServiceId: rules.rewardServiceId,
    rewardServiceName: rules.rewardServiceName,
  };
}
