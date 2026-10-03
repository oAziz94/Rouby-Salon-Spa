"use client";

import {
  ApiClientError,
  getDashboardQueueLoyalty,
  redeemDashboardQueueLoyaltyPoints,
  redeemDashboardQueueLoyaltyReward,
  type DashboardLoyaltyVisitSummary,
} from "@rouby/api-client";
import { Gift, Loader2, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

function formatEGP(amount: number): string {
  return `EGP ${amount.toLocaleString("en-EG", { maximumFractionDigits: 2 })}`;
}

function messageOf(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

/**
 * Loyalty at checkout: shows the client's points and visit reward, and lets reception use
 * them against the open invoice. Redeeming settles part of the bill as a "Loyalty" payment,
 * so `onRedeemed` receives the new remaining amount to collect.
 */
export function LoyaltyCheckoutCard({
  token,
  queueEntryId,
  canRedeem,
  onRedeemed,
}: {
  token: string;
  queueEntryId: string;
  canRedeem: boolean;
  onRedeemed: (remaining: number) => void;
}) {
  const [data, setData] = useState<DashboardLoyaltyVisitSummary | null>(null);
  const [busy, setBusy] = useState<"points" | "reward" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await getDashboardQueueLoyalty(token, queueEntryId));
    } catch {
      // Loyalty is optional at checkout; without it the payment dialog works as before.
      setData(null);
    }
  }, [queueEntryId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data?.enabled) return null;

  const remaining = data.invoiceRemaining ?? 0;
  const blocksByBill = data.redeemBlockValue > 0 ? Math.floor(remaining / data.redeemBlockValue) : 0;
  const blocks = Math.min(data.redeemableBlocks, blocksByBill);
  const rewardName = data.rewardServiceName ?? "reward service";

  async function redeem(kind: "points" | "reward"): Promise<void> {
    setBusy(kind);
    setError("");
    setDone("");
    try {
      const res =
        kind === "points"
          ? await redeemDashboardQueueLoyaltyPoints(token, queueEntryId, 1)
          : await redeemDashboardQueueLoyaltyReward(token, queueEntryId);
      setDone(`${formatEGP(res.amount)} taken off with loyalty.`);
      const fresh = await getDashboardQueueLoyalty(token, queueEntryId);
      setData(fresh);
      onRedeemed(fresh.invoiceRemaining ?? 0);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-[#E5D5A8] bg-[#FBF6E8] p-3 text-xs text-[#5C4A18]">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-[#3F3210]">
          <Star className="h-4 w-4" aria-hidden />
          Loyalty: {data.points.toLocaleString("en-EG")} points
        </p>
        <span>
          Visit {data.visits % data.visitsForReward}/{data.visitsForReward}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span>
          {data.redeemableBlocks > 0
            ? `${data.redeemBlockPoints.toLocaleString("en-EG")} points = ${formatEGP(data.redeemBlockValue)} off`
            : `${(data.redeemBlockPoints - data.points).toLocaleString("en-EG")} more points for ${formatEGP(data.redeemBlockValue)} off`}
        </span>
        {canRedeem && blocks > 0 ? (
          <button
            type="button"
            onClick={() => void redeem("points")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-lg bg-[#062A2D] px-2.5 py-1.5 text-[11px] font-semibold text-[#F6F2EA] disabled:opacity-50"
          >
            {busy === "points" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Use {data.redeemBlockPoints.toLocaleString("en-EG")} points
          </button>
        ) : null}
      </div>

      {data.rewardsAvailable > 0 ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#E5D5A8] pt-2">
          <span className="flex items-center gap-1.5 font-semibold text-[#3F3210]">
            <Gift className="h-4 w-4" aria-hidden />
            Free {rewardName} earned
          </span>
          {canRedeem ? (
            data.rewardLineOnVisit ? (
              <button
                type="button"
                onClick={() => void redeem("reward")}
                disabled={busy !== null || remaining <= 0}
                className="inline-flex items-center gap-1 rounded-lg bg-[#062A2D] px-2.5 py-1.5 text-[11px] font-semibold text-[#F6F2EA] disabled:opacity-50"
              >
                {busy === "reward" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                Use free {rewardName}
              </button>
            ) : (
              <span>Add {rewardName} to this visit to use it.</span>
            )
          ) : null}
        </div>
      ) : (
        <p className="mt-2 border-t border-[#E5D5A8] pt-2">
          {data.visitsToNextReward} more visit{data.visitsToNextReward === 1 ? "" : "s"} for a free {rewardName}.
        </p>
      )}

      {done ? <p className="mt-2 font-semibold text-[#0E342B]">{done}</p> : null}
      {error ? <p className="mt-2 text-[#8B2C1A]">{error}</p> : null}
    </div>
  );
}
