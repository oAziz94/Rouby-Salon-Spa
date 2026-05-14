"use client";

import {
  ApiClientError,
  addDashboardCashDrawerMovement,
  closeDashboardCashDrawer,
  getDashboardBranches,
  getDashboardCashDrawerCurrent,
  openDashboardCashDrawer,
  updateDashboardCashDrawer,
  type DashboardBranch,
  type DashboardCashDrawerCashPaymentRow,
  type DashboardCashDrawerMovement,
  type DashboardCashDrawerSession,
} from "@rouby/api-client";
import { formatDateTimeAmPm } from "@rouby/wall-clock";
import {
  AlertTriangle,
  Banknote,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

function formatEGP(n: number): string {
  return `EGP ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatApiError(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error) return e.message;
  return "Unexpected error.";
}

function movementTypeLabel(t: string): string {
  switch (t) {
    case "CASH_IN":
      return "Cash in";
    case "CASH_OUT":
      return "Cash out";
    case "ADJUSTMENT":
      return "Adjustment";
    default:
      return t;
  }
}

export default function CashDrawerPage() {
  const { token, hasPermission, user } = useDashboardAuth();
  const canRead = hasPermission("cashDrawer.read");
  const canOpen = hasPermission("cashDrawer.open");
  const canUpdate = hasPermission("cashDrawer.update");
  const canClose = hasPermission("cashDrawer.close");
  const canMovement = hasPermission("cashDrawer.movement.create");
  const canReadBranches = hasPermission("branches.read");
  const canInvoice = hasPermission("invoices.read");

  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [businessDate, setBusinessDate] = useState(todayUtc);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [session, setSession] = useState<DashboardCashDrawerSession | null>(null);
  const [summary, setSummary] = useState<{
    openingBalance: number;
    cashPaymentsTotal: number;
    cashInTotal: number;
    cashOutTotal: number;
    adjustmentTotal: number;
    expectedCash: number;
    countedCash: number | null;
    cashDifference: number | null;
    status: string;
  } | null>(null);
  const [cashRows, setCashRows] = useState<DashboardCashDrawerCashPaymentRow[]>([]);
  const [toast, setToast] = useState<{ m: string; ok: boolean } | null>(null);

  const [openModal, setOpenModal] = useState(false);
  const [openBal, setOpenBal] = useState("0");
  const [openNotes, setOpenNotes] = useState("");
  const [openSaving, setOpenSaving] = useState(false);

  const [movModal, setMovModal] = useState(false);
  const [movType, setMovType] = useState<"CASH_IN" | "CASH_OUT" | "ADJUSTMENT">("CASH_IN");
  const [movAmount, setMovAmount] = useState("");
  const [movReason, setMovReason] = useState("");
  const [movNotes, setMovNotes] = useState("");
  const [movSaving, setMovSaving] = useState(false);

  const [countInput, setCountInput] = useState("");
  const [countNotes, setCountNotes] = useState("");
  const [countSaving, setCountSaving] = useState(false);

  const [closeModal, setCloseModal] = useState(false);
  const [closeCount, setCloseCount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeSaving, setCloseSaving] = useState(false);

  const multiBranch = user?.branchId === null && canReadBranches;

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!token || !canReadBranches) {
      setBranches([]);
      return;
    }
    let c = false;
    void getDashboardBranches(token)
      .then((b) => {
        if (!c) setBranches(Array.isArray(b) ? b : []);
      })
      .catch(() => {
        if (!c) setBranches([]);
      });
    return () => {
      c = true;
    };
  }, [token, canReadBranches]);

  useEffect(() => {
    if (branchId) return;
    if (user?.branchId) {
      setBranchId(user.branchId);
      return;
    }
    if (branches[0]?.id) setBranchId(branches[0].id);
  }, [user?.branchId, branches, branchId]);

  const load = useCallback(async () => {
    if (!token || !canRead || !branchId) return;
    setPhase("loading");
    setError("");
    try {
      const r = await getDashboardCashDrawerCurrent(token, {
        branchId,
        date: businessDate,
      });
      setSession(r.session);
      setSummary(r.session ? r.summary : null);
      setCashRows(r.recentCashPayments ?? []);
      if (r.session?.countedCash != null) {
        setCountInput(String(r.session.countedCash));
      } else {
        setCountInput("");
      }
      setPhase("ready");
    } catch (e) {
      setError(formatApiError(e));
      setPhase("error");
    }
  }, [token, canRead, branchId, businessDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const diffTone = useMemo(() => {
    const d = summary?.cashDifference;
    if (d == null) return "neutral";
    if (Math.abs(d) < 0.01) return "ok";
    if (d > 0) return "over";
    return "short";
  }, [summary?.cashDifference]);

  const onOpenDrawer = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!token || !branchId) return;
    setOpenSaving(true);
    try {
      await openDashboardCashDrawer(token, {
        branchId,
        businessDate,
        openingBalance: Number(openBal) || 0,
        notes: openNotes.trim() || undefined,
      });
      setOpenModal(false);
      setOpenBal("0");
      setOpenNotes("");
      setToast({ m: "Cash drawer opened.", ok: true });
      await load();
    } catch (e) {
      setToast({ m: formatApiError(e), ok: false });
    } finally {
      setOpenSaving(false);
    }
  };

  const onAddMovement = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!token || !session) return;
    setMovSaving(true);
    try {
      await addDashboardCashDrawerMovement(token, session.id, {
        type: movType,
        amount: Number(movAmount) || 0,
        reason: movReason.trim(),
        notes: movNotes.trim() || undefined,
      });
      setMovModal(false);
      setMovAmount("");
      setMovReason("");
      setMovNotes("");
      setToast({ m: "Movement recorded.", ok: true });
      await load();
    } catch (e) {
      setToast({ m: formatApiError(e), ok: false });
    } finally {
      setMovSaving(false);
    }
  };

  const onSaveCount = async () => {
    if (!token || !session) return;
    setCountSaving(true);
    try {
      await updateDashboardCashDrawer(token, session.id, {
        countedCash: countInput === "" ? undefined : Number(countInput),
        notes: countNotes.trim() || undefined,
      });
      setToast({ m: "Count saved.", ok: true });
      await load();
    } catch (e) {
      setToast({ m: formatApiError(e), ok: false });
    } finally {
      setCountSaving(false);
    }
  };

  const onCloseDrawer = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!token || !session) return;
    setCloseSaving(true);
    try {
      await closeDashboardCashDrawer(token, session.id, {
        countedCash: Number(closeCount) || 0,
        notes: closeNotes.trim() || undefined,
      });
      setCloseModal(false);
      setCloseCount("");
      setCloseNotes("");
      setToast({ m: "Cash drawer closed.", ok: true });
      await load();
    } catch (e) {
      setToast({ m: formatApiError(e), ok: false });
    } finally {
      setCloseSaving(false);
    }
  };

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "Branch";

  return (
    <PermissionGuard permission="cashDrawer.read">
      <div className="cash-drawer-page min-h-screen bg-[#FFFCF7] pb-16 text-[#2C2418] print:bg-white">
        <div className="no-print mx-auto max-w-6xl space-y-6 px-4 py-8">
          {toast ? (
            <div
              className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${
                toast.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-red-200 bg-red-50 text-red-900"
              }`}
            >
              {toast.m}
            </div>
          ) : null}

          <header className="rounded-2xl border border-[#E8E0D4] bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#8A7E6E]">
                  Finance
                </p>
                <h1 className="mt-1 text-2xl font-semibold text-[#1B4332]">Cash Drawer</h1>
                <p className="mt-2 max-w-2xl text-sm text-[#5C5348]">
                  Open, track, reconcile, and close the cash drawer for the selected branch and
                  business date.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void load()}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm font-medium text-[#1B4332] shadow-sm hover:bg-[#FFFCF7]"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
                {session?.status === "CLOSED" ? (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-semibold text-[#F5E6C8] shadow-md hover:bg-[#163d2c]"
                  >
                    <Printer className="h-4 w-4" />
                    Print summary
                  </button>
                ) : null}
                {!session && canOpen ? (
                  <button
                    type="button"
                    onClick={() => setOpenModal(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-semibold text-[#F5E6C8] shadow-md hover:bg-[#163d2c]"
                  >
                    <Wallet className="h-4 w-4" />
                    Open drawer
                  </button>
                ) : null}
                {session?.status === "OPEN" && canClose ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCloseCount(
                        summary ? String(summary.expectedCash) : countInput || "",
                      );
                      setCloseModal(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-300/80 bg-[#F5E6C8] px-4 py-2 text-sm font-semibold text-[#1B4332] shadow-sm hover:bg-[#edd9a8]"
                  >
                    Close drawer
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <section className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm no-print">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-[#5C5348]">Business date</span>
                <input
                  type="date"
                  value={businessDate}
                  onChange={(e) => setBusinessDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-[#5C5348]">Branch</span>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  disabled={!multiBranch && !!user?.branchId}
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2 text-sm disabled:opacity-60"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase text-[#8A7E6E]">Status</span>
              {!session ? (
                <span className="rounded-full border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-1 text-xs font-semibold text-[#5C5348]">
                  No drawer opened
                </span>
              ) : session.status === "OPEN" ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
                  OPEN
                </span>
              ) : (
                <span className="rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-800">
                  CLOSED
                </span>
              )}
              {session ? (
                <span className="text-xs text-[#8A7E6E]">Ref {session.shortRef}</span>
              ) : null}
            </div>
          </section>

          {phase === "loading" ? (
            <div className="flex items-center justify-center rounded-2xl border border-[#E8E0D4] bg-white py-20 shadow-sm">
              <Loader2 className="h-8 w-8 animate-spin text-[#1B4332]" />
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900 shadow-sm">
              <p className="font-semibold">Could not load cash drawer</p>
              <p className="mt-2">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-4 rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-semibold text-[#F5E6C8]"
              >
                Retry
              </button>
            </div>
          ) : null}

          {phase === "ready" && !session ? (
            <div className="rounded-2xl border border-[#E8E0D4] bg-gradient-to-br from-white to-[#FFFCF7] p-10 text-center shadow-md">
              <Banknote className="mx-auto h-12 w-12 text-[#C4A35A]" />
              <h2 className="mt-4 text-xl font-semibold text-[#1B4332]">No cash drawer opened</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#5C5348]">
                Open the drawer to start tracking cash payments and cash movements for this branch
                and date.
              </p>
              {canOpen ? (
                <button
                  type="button"
                  onClick={() => setOpenModal(true)}
                  className="mt-6 inline-flex rounded-xl bg-[#1B4332] px-6 py-3 text-sm font-semibold text-[#F5E6C8] shadow-lg hover:bg-[#163d2c]"
                >
                  Open drawer
                </button>
              ) : null}
            </div>
          ) : null}

          {phase === "ready" && session && summary !== null ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Opening", summary.openingBalance],
                  ["Cash payments", summary.cashPaymentsTotal],
                  ["Cash in", summary.cashInTotal],
                  ["Cash out", summary.cashOutTotal],
                  ["Adjustments", summary.adjustmentTotal],
                  ["Expected cash", summary.expectedCash],
                  ["Counted cash", summary.countedCash ?? "—"],
                  [
                    "Difference",
                    summary.cashDifference ?? "—",
                    diffTone,
                  ],
                ].map(([label, val, tone]) => (
                  <div
                    key={String(label)}
                    className={`rounded-2xl border p-4 shadow-sm ${
                      tone === "ok"
                        ? "border-emerald-200 bg-emerald-50/60"
                        : tone === "over"
                          ? "border-amber-200 bg-amber-50/50"
                          : tone === "short"
                            ? "border-red-200 bg-red-50/50"
                            : "border-[#E8E0D4] bg-white"
                    }`}
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-[#8A7E6E]">
                      {label}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-[#1B4332]">
                      {typeof val === "number" ? formatEGP(val) : val}
                    </p>
                  </div>
                ))}
              </div>

              <section className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm no-print">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-[#1B4332]">Cash movements</h2>
                  {session.status === "OPEN" && canMovement ? (
                    <button
                      type="button"
                      onClick={() => setMovModal(true)}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#1B4332] px-3 py-2 text-sm font-semibold text-[#F5E6C8]"
                    >
                      <Plus className="h-4 w-4" />
                      Add movement
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-[#E8E0D4] text-xs uppercase text-[#8A7E6E]">
                      <tr>
                        <th className="py-2 pr-4">Time</th>
                        <th className="py-2 pr-4">Type</th>
                        <th className="py-2 pr-4">Amount</th>
                        <th className="py-2 pr-4">Reason</th>
                        <th className="py-2 pr-4">Created by</th>
                        <th className="py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {session.movements.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-[#8A7E6E]">
                            No movements yet.
                          </td>
                        </tr>
                      ) : (
                        session.movements.map((m: DashboardCashDrawerMovement) => (
                          <tr key={m.id} className="border-b border-[#F0EBE3]">
                            <td className="py-2 pr-4 text-[#5C5348]">
                              {formatDateTimeAmPm(m.createdAt)}
                            </td>
                            <td className="py-2 pr-4">{movementTypeLabel(m.type)}</td>
                            <td className="py-2 pr-4 font-medium">{formatEGP(m.amount)}</td>
                            <td className="py-2 pr-4">{m.reason}</td>
                            <td className="py-2 pr-4">{m.createdBy.name}</td>
                            <td className="py-2 text-[#8A7E6E]">{m.notes ?? "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-[#1B4332] no-print">Cash payments</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b border-[#E8E0D4] text-xs uppercase text-[#8A7E6E]">
                      <tr>
                        <th className="py-2 pr-4">Time</th>
                        <th className="py-2 pr-4">Invoice</th>
                        <th className="py-2 pr-4">Client</th>
                        <th className="py-2 pr-4">Amount</th>
                        <th className="py-2 pr-4">Cashier</th>
                        <th className="py-2 no-print">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-[#8A7E6E]">
                            No cash payments recorded for this date.
                          </td>
                        </tr>
                      ) : (
                        cashRows.map((p) => (
                          <tr key={p.id} className="border-b border-[#F0EBE3]">
                            <td className="py-2 pr-4">
                              {formatDateTimeAmPm(p.paidAt ?? p.createdAt)}
                            </td>
                            <td className="py-2 pr-4 font-medium">
                              {p.invoice?.invoiceNumber ?? "—"}
                            </td>
                            <td className="py-2 pr-4">{p.client?.fullName ?? "—"}</td>
                            <td className="py-2 pr-4">{formatEGP(p.amount)}</td>
                            <td className="py-2 pr-4">{p.cashier?.name ?? "—"}</td>
                            <td className="py-2 no-print">
                              <div className="flex flex-wrap gap-2">
                                {p.invoice && canInvoice ? (
                                  <Link
                                    href={`/dashboard/invoices?search=${encodeURIComponent(p.invoice.invoiceNumber)}`}
                                    className="text-xs font-semibold text-[#1B4332] underline"
                                  >
                                    Invoice
                                  </Link>
                                ) : null}
                                {p.invoice ? (
                                  <a
                                    href={`/dashboard/invoices/${p.invoice.id}/receipt?print=1`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-semibold text-[#C4A35A] underline"
                                  >
                                    Receipt
                                  </a>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm no-print">
                <h2 className="text-lg font-semibold text-[#1B4332]">Cash count</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block text-sm">
                    <span className="text-[#5C5348]">Expected cash (read-only)</span>
                    <input
                      readOnly
                      value={formatEGP(summary.expectedCash)}
                      className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-[#5C5348]">Counted cash</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={session.status !== "OPEN" || !canUpdate}
                      value={countInput}
                      onChange={(e) => setCountInput(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm disabled:opacity-50"
                    />
                  </label>
                  <label className="block text-sm md:col-span-2">
                    <span className="text-[#5C5348]">Notes</span>
                    <textarea
                      rows={2}
                      disabled={session.status !== "OPEN" || !canUpdate}
                      value={countNotes}
                      onChange={(e) => setCountNotes(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm disabled:opacity-50"
                    />
                  </label>
                </div>
                {session.status === "OPEN" && canUpdate ? (
                  <button
                    type="button"
                    onClick={() => void onSaveCount()}
                    disabled={countSaving}
                    className="mt-4 rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-semibold text-[#F5E6C8] disabled:opacity-50"
                  >
                    {countSaving ? "Saving…" : "Save count"}
                  </button>
                ) : null}
                {session.status === "CLOSED" && session.closedBy ? (
                  <p className="mt-4 text-sm text-[#5C5348]">
                    Closed by {session.closedBy.name} at{" "}
                    {session.closedAt ? formatDateTimeAmPm(session.closedAt) : "—"}
                  </p>
                ) : null}
              </section>
            </>
          ) : null}
        </div>

        {/* Print view */}
        {session && summary ? (
          <div className="hidden print:block print:p-8">
            <h1 className="text-xl font-bold">Cash drawer — {branchName}</h1>
            <p className="text-sm">
              Date {businessDate} · Ref {session.shortRef} · {session.status}
            </p>
            <table className="mt-6 w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-1">Opening</td>
                  <td className="py-1 text-right">{formatEGP(summary.openingBalance)}</td>
                </tr>
                <tr>
                  <td className="py-1">Cash payments</td>
                  <td className="py-1 text-right">{formatEGP(summary.cashPaymentsTotal)}</td>
                </tr>
                <tr>
                  <td className="py-1">Cash in / out / adj.</td>
                  <td className="py-1 text-right">
                    +{formatEGP(summary.cashInTotal)} / −{formatEGP(summary.cashOutTotal)} / +
                    {formatEGP(summary.adjustmentTotal)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold">Expected</td>
                  <td className="py-1 text-right font-semibold">
                    {formatEGP(summary.expectedCash)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold">Counted</td>
                  <td className="py-1 text-right font-semibold">
                    {summary.countedCash != null ? formatEGP(summary.countedCash) : "—"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 font-semibold">Difference</td>
                  <td className="py-1 text-right font-semibold">
                    {summary.cashDifference != null ? formatEGP(summary.cashDifference) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        {openModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 no-print">
            <form
              onSubmit={onOpenDrawer}
              className="w-full max-w-md rounded-2xl border border-[#E8E0D4] bg-white p-6 shadow-xl"
            >
              <h3 className="text-lg font-semibold text-[#1B4332]">Open cash drawer</h3>
              <label className="mt-4 block text-sm">
                Opening balance
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={openBal}
                  onChange={(e) => setOpenBal(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2"
                />
              </label>
              <label className="mt-3 block text-sm">
                Notes (optional)
                <textarea
                  value={openNotes}
                  onChange={(e) => setOpenNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2"
                />
              </label>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpenModal(false)}
                  className="rounded-xl border border-[#E8E0D4] px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={openSaving}
                  className="rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-semibold text-[#F5E6C8] disabled:opacity-50"
                >
                  {openSaving ? "Opening…" : "Confirm open drawer"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {movModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 no-print">
            <form
              onSubmit={onAddMovement}
              className="w-full max-w-md rounded-2xl border border-[#E8E0D4] bg-white p-6 shadow-xl"
            >
              <h3 className="text-lg font-semibold text-[#1B4332]">Add movement</h3>
              <label className="mt-4 block text-sm">
                Type
                <select
                  value={movType}
                  onChange={(e) =>
                    setMovType(e.target.value as "CASH_IN" | "CASH_OUT" | "ADJUSTMENT")
                  }
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2"
                >
                  <option value="CASH_IN">Cash in</option>
                  <option value="CASH_OUT">Cash out</option>
                  <option value="ADJUSTMENT">Adjustment</option>
                </select>
              </label>
              <label className="mt-3 block text-sm">
                Amount
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                  value={movAmount}
                  onChange={(e) => setMovAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2"
                />
              </label>
              <label className="mt-3 block text-sm">
                Reason
                <input
                  required
                  value={movReason}
                  onChange={(e) => setMovReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2"
                  placeholder={
                    movType === "CASH_IN"
                      ? "Owner deposit, petty cash top-up…"
                      : "Supplies, staff payout…"
                  }
                />
              </label>
              <label className="mt-3 block text-sm">
                Notes (optional)
                <textarea
                  value={movNotes}
                  onChange={(e) => setMovNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2"
                />
              </label>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMovModal(false)}
                  className="rounded-xl border border-[#E8E0D4] px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={movSaving}
                  className="rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-semibold text-[#F5E6C8] disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {closeModal && session && summary ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 no-print">
            <form
              onSubmit={onCloseDrawer}
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#E8E0D4] bg-white p-6 shadow-xl"
            >
              <h3 className="text-lg font-semibold text-[#1B4332]">Close cash drawer?</h3>
              <p className="mt-2 text-sm text-[#5C5348]">
                {branchName} · {businessDate}
              </p>
              <ul className="mt-4 space-y-1 text-sm">
                <li className="flex justify-between">
                  <span>Opening</span>
                  <span>{formatEGP(summary.openingBalance)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Cash payments</span>
                  <span>{formatEGP(summary.cashPaymentsTotal)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Cash in</span>
                  <span>{formatEGP(summary.cashInTotal)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Cash out</span>
                  <span>{formatEGP(summary.cashOutTotal)}</span>
                </li>
                <li className="flex justify-between font-semibold">
                  <span>Expected cash</span>
                  <span>{formatEGP(summary.expectedCash)}</span>
                </li>
              </ul>
              {Math.abs(Number(closeCount) - summary.expectedCash) > 0.01 ? (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Counted cash differs from expected — confirm to proceed.
                </p>
              ) : null}
              <label className="mt-4 block text-sm">
                Counted cash
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={closeCount}
                  onChange={(e) => setCloseCount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2"
                />
              </label>
              <label className="mt-3 block text-sm">
                Notes (optional)
                <textarea
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2"
                />
              </label>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCloseModal(false)}
                  className="rounded-xl border border-[#E8E0D4] px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={closeSaving}
                  className="rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-semibold text-[#F5E6C8] disabled:opacity-50"
                >
                  {closeSaving ? "Closing…" : "Close drawer"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <style
          dangerouslySetInnerHTML={{
            __html: `@media print { .no-print { display: none !important; } .cash-drawer-page { background: white !important; } }`,
          }}
        />
      </div>
    </PermissionGuard>
  );
}
