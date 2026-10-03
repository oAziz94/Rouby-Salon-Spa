"use client";

import {
  ApiClientError,
  adjustDashboardLoyaltyPoints,
  getDashboardLoyaltyClients,
  getDashboardServices,
  updateDashboardLoyaltySettings,
  type DashboardLoyaltyClientRow,
  type DashboardLoyaltyRules,
  type DashboardService,
} from "@rouby/api-client";
import { Gift, Loader2, Star } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

function formatEGP(amount: number): string {
  return `EGP ${amount.toLocaleString("en-EG", { maximumFractionDigits: 2 })}`;
}

const inputClass =
  "w-full rounded-lg border border-[#D8CBB8] bg-white px-3 py-2 text-sm text-[#1F2420] outline-none focus:ring-2 focus:ring-[#B9974A]/40";

export default function LoyaltyPage() {
  return (
    <PermissionGuard permission="loyalty.read">
      <LoyaltyContent />
    </PermissionGuard>
  );
}

function LoyaltyContent() {
  const { token, hasPermission } = useDashboardAuth();
  const canManage = hasPermission("loyalty.manage");
  const [rules, setRules] = useState<DashboardLoyaltyRules | null>(null);
  const [clients, setClients] = useState<DashboardLoyaltyClientRow[]>([]);
  const [services, setServices] = useState<DashboardService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");

  const [form, setForm] = useState({
    enabled: false,
    pointsPerEgp: "1",
    redeemPoints: "1000",
    redeemValue: "50",
    visitsForReward: "5",
    rewardServiceId: "",
  });

  const [adjustFor, setAdjustFor] = useState<DashboardLoyaltyClientRow | null>(null);
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustError, setAdjustError] = useState("");
  const [adjustBusy, setAdjustBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [list, svc] = await Promise.all([
        getDashboardLoyaltyClients(token),
        canManage
          ? getDashboardServices(token, { pageSize: 100, isActive: true }).catch(() => ({ data: [] as DashboardService[] }))
          : Promise.resolve({ data: [] as DashboardService[] }),
      ]);
      setRules(list.rules);
      setClients(list.data);
      setServices(svc.data);
      setForm({
        enabled: list.rules.enabled,
        pointsPerEgp: String(list.rules.pointsPerEgp),
        redeemPoints: String(list.rules.redeemPoints),
        redeemValue: String(list.rules.redeemValue),
        visitsForReward: String(list.rules.visitsForReward),
        rewardServiceId: list.rules.rewardServiceId ?? "",
      });
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [canManage, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRules(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setSaved("");
    setError("");
    try {
      const next = await updateDashboardLoyaltySettings(token, {
        enabled: form.enabled,
        pointsPerEgp: Number(form.pointsPerEgp),
        redeemPoints: Number(form.redeemPoints),
        redeemValue: Number(form.redeemValue),
        visitsForReward: Number(form.visitsForReward),
        ...(form.rewardServiceId ? { rewardServiceId: form.rewardServiceId } : {}),
      });
      setRules(next);
      setSaved("Saved.");
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }

  async function submitAdjust(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!token || !adjustFor) return;
    const points = Number(adjustPoints);
    if (!Number.isInteger(points) || points === 0) {
      setAdjustError("Enter a whole number of points, for example 200 or -200.");
      return;
    }
    if (adjustNote.trim().length < 3) {
      setAdjustError("Say why the balance is being changed.");
      return;
    }
    setAdjustBusy(true);
    setAdjustError("");
    try {
      await adjustDashboardLoyaltyPoints(token, adjustFor.clientId, { points, note: adjustNote.trim() });
      setAdjustFor(null);
      setAdjustPoints("");
      setAdjustNote("");
      await load();
    } catch (e) {
      setAdjustError(formatApiError(e));
    } finally {
      setAdjustBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-[#062A2D]">Loyalty</h1>
        <p className="mt-1 text-sm text-[#7A6A58]">
          Clients earn points on what they pay and a free service after a number of visits. Reception uses
          them when collecting payment in the queue.
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[#7A6A58]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#062A2D]">
                <Star className="h-4 w-4" aria-hidden /> Program rules
              </h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  rules?.enabled ? "bg-[#E8F2EE] text-[#0E342B]" : "bg-[#F4F1EC] text-[#5E574C]"
                }`}
              >
                {rules?.enabled ? "Running" : "Switched off"}
              </span>
            </div>
            {rules?.enabled ? (
              <p className="mt-2 text-sm text-[#5E574C]">
                {rules.pointsPerEgp} point{rules.pointsPerEgp === 1 ? "" : "s"} per EGP paid ·{" "}
                {rules.redeemPoints.toLocaleString("en-EG")} points = {formatEGP(rules.redeemValue)} off · every{" "}
                {rules.visitsForReward} visits = free {rules.rewardServiceName ?? "service (not chosen yet)"}
                {rules.startedAt ? ` · counting since ${new Date(rules.startedAt).toLocaleDateString("en-GB")}` : ""}
              </p>
            ) : (
              <p className="mt-2 text-sm text-[#5E574C]">
                Nothing is earned or redeemed while the program is off. Points and visits count from the day it
                is first switched on.
              </p>
            )}

            {canManage ? (
              <form onSubmit={(e) => void saveRules(e)} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex items-center gap-2 text-sm font-medium text-[#1F2420] sm:col-span-2 lg:col-span-3">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  Loyalty program is running
                </label>
                <label className="block text-xs font-medium text-[#7A6A58]">
                  Points per 1 EGP paid
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={form.pointsPerEgp}
                    onChange={(e) => setForm((f) => ({ ...f, pointsPerEgp: e.target.value }))}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <label className="block text-xs font-medium text-[#7A6A58]">
                  Points needed to redeem
                  <input
                    type="number"
                    min={1}
                    value={form.redeemPoints}
                    onChange={(e) => setForm((f) => ({ ...f, redeemPoints: e.target.value }))}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <label className="block text-xs font-medium text-[#7A6A58]">
                  Worth (EGP off the bill)
                  <input
                    type="number"
                    min={1}
                    value={form.redeemValue}
                    onChange={(e) => setForm((f) => ({ ...f, redeemValue: e.target.value }))}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <label className="block text-xs font-medium text-[#7A6A58]">
                  Visits for a free service
                  <input
                    type="number"
                    min={1}
                    value={form.visitsForReward}
                    onChange={(e) => setForm((f) => ({ ...f, visitsForReward: e.target.value }))}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <label className="block text-xs font-medium text-[#7A6A58] sm:col-span-2">
                  Free service
                  <select
                    value={form.rewardServiceId}
                    onChange={(e) => setForm((f) => ({ ...f, rewardServiceId: e.target.value }))}
                    className={`${inputClass} mt-1`}
                  >
                    <option value="">Choose a service…</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    Save rules
                  </button>
                  {saved ? <span className="text-sm text-[#0E342B]">{saved}</span> : null}
                </div>
              </form>
            ) : null}
          </section>

          <section className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#062A2D]">
              <Gift className="h-4 w-4" aria-hidden /> Clients
            </h2>
            {clients.length === 0 ? (
              <p className="mt-3 text-sm text-[#7A6A58]">
                No client has earned points yet. They appear here after their first paid visit.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-[#7A6A58]">
                    <tr>
                      <th className="py-2 pr-3">Client</th>
                      <th className="py-2 pr-3">Points</th>
                      <th className="py-2 pr-3">Worth now</th>
                      <th className="py-2 pr-3">Visits</th>
                      <th className="py-2 pr-3">Free service</th>
                      {canManage ? <th className="py-2" /> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EBE3]">
                    {clients.map((c) => (
                      <tr key={c.clientId}>
                        <td className="py-2 pr-3 font-medium text-[#1F2420]">{c.fullName}</td>
                        <td className="py-2 pr-3">{c.points.toLocaleString("en-EG")}</td>
                        <td className="py-2 pr-3">{formatEGP(c.redeemableBlocks * c.redeemBlockValue)}</td>
                        <td className="py-2 pr-3">{c.visits}</td>
                        <td className="py-2 pr-3">
                          {c.rewardsAvailable > 0
                            ? `${c.rewardsAvailable} ready`
                            : `in ${c.visitsToNextReward} visit${c.visitsToNextReward === 1 ? "" : "s"}`}
                        </td>
                        {canManage ? (
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setAdjustFor(c);
                                setAdjustPoints("");
                                setAdjustNote("");
                                setAdjustError("");
                              }}
                              className="rounded-lg border border-[#D8CBB8] bg-white px-2.5 py-1 text-xs font-semibold text-[#1F2420]"
                            >
                              Adjust
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {adjustFor ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Adjust loyalty points"
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
        >
          <form
            onSubmit={(e) => void submitAdjust(e)}
            className="w-full max-w-md rounded-3xl border border-[#E8E0D4] bg-[#FFFCF7] p-6 shadow-2xl"
          >
            <h2 className="text-lg font-semibold text-[#062A2D]">Adjust points — {adjustFor.fullName}</h2>
            <p className="mt-1 text-xs text-[#7A6A58]">
              Current balance: {adjustFor.points.toLocaleString("en-EG")} points. Use a minus sign to remove points.
            </p>
            <label className="mt-4 block text-xs font-medium text-[#7A6A58]">
              Points to add or remove
              <input
                type="number"
                value={adjustPoints}
                onChange={(e) => setAdjustPoints(e.target.value)}
                className={`${inputClass} mt-1`}
                autoFocus
              />
            </label>
            <label className="mt-3 block text-xs font-medium text-[#7A6A58]">
              Reason
              <input
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                maxLength={300}
                className={`${inputClass} mt-1`}
              />
            </label>
            {adjustError ? <p className="mt-2 text-xs text-[#8B2C1A]">{adjustError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdjustFor(null)}
                className="rounded-xl border border-[#D8CBB8] bg-white px-4 py-2 text-sm font-semibold text-[#1F2420]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adjustBusy}
                className="inline-flex items-center gap-2 rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] disabled:opacity-50"
              >
                {adjustBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
