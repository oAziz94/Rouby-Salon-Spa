"use client";

import {
  ApiClientError,
  closeDashboardDailyClosing,
  getDashboardBranches,
  getDashboardDailyClosingSummary,
  saveDashboardDailyClosingDraft,
  type DashboardBranch,
  type DashboardDailyClosingSummaryResponse,
} from "@rouby/api-client";
import { formatDateTimeAmPm } from "@rouby/wall-clock";
import { AlertTriangle, Loader2, Printer, RefreshCw } from "lucide-react";
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

function methodLabel(m: string): string {
  switch (m) {
    case "CASH":
      return "Cash";
    case "CARD":
      return "Card";
    case "INSTAPAY":
      return "Instapay";
    case "MOBILE_WALLET":
      return "Wallet";
    case "BANK_TRANSFER":
      return "Bank transfer";
    default:
      return m;
  }
}

export default function DailyClosingPage() {
  const { token, hasPermission, user } = useDashboardAuth();
  const canRead = hasPermission("dailyClosing.read");
  const canCreate = hasPermission("dailyClosing.create");
  const canClose = hasPermission("dailyClosing.close");
  const canPrint = hasPermission("dailyClosing.print");
  const canReadBranches = hasPermission("branches.read");
  const canInvoice = hasPermission("invoices.read");

  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [businessDate, setBusinessDate] = useState(todayUtc);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [data, setData] = useState<DashboardDailyClosingSummaryResponse | null>(null);
  const [notes, setNotes] = useState("");
  const [toast, setToast] = useState<{ m: string; ok: boolean } | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [closeSaving, setCloseSaving] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");

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
      const r = await getDashboardDailyClosingSummary(token, {
        branchId,
        date: businessDate,
      });
      setData(r);
      setNotes(r.draftNotes ?? "");
      setPhase("ready");
    } catch (e) {
      setError(formatApiError(e));
      setPhase("error");
    }
  }, [token, canRead, branchId, businessDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const branchName = branches.find((b) => b.id === branchId)?.name ?? data?.branch.name ?? "Branch";
  const readOnly = data?.status === "CLOSED";
  const cashDrawer = data?.cashDrawerSummary as Record<string, unknown> | undefined;

  const onSaveDraft = async () => {
    if (!token || !branchId) return;
    setDraftSaving(true);
    try {
      await saveDashboardDailyClosingDraft(token, {
        branchId,
        businessDate,
        notes: notes.trim() || undefined,
      });
      setToast({ m: "Draft saved.", ok: true });
      await load();
    } catch (e) {
      setToast({ m: formatApiError(e), ok: false });
    } finally {
      setDraftSaving(false);
    }
  };

  const onCloseDay = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!token || !data?.existingClosingId) return;
    setCloseSaving(true);
    try {
      await closeDashboardDailyClosing(token, data.existingClosingId, {
        notes: closeNotes.trim() || undefined,
      });
      setCloseModal(false);
      setCloseNotes("");
      setToast({ m: "Business day closed.", ok: true });
      await load();
    } catch (e) {
      setToast({ m: formatApiError(e), ok: false });
    } finally {
      setCloseSaving(false);
    }
  };

  const paymentRows = useMemo(() => {
    const pb = data?.paymentBreakdown;
    if (!pb) return [];
    return Object.entries(pb).map(([method, v]) => ({
      method,
      amount: v.amount,
      count: v.count,
    }));
  }, [data?.paymentBreakdown]);

  return (
    <PermissionGuard permission="dailyClosing.read">
      <div className="min-h-screen bg-[#FFFCF7] pb-16 text-[#2C2418]">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
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
                <h1 className="mt-1 text-2xl font-semibold text-[#1B4332]">Daily Closing</h1>
                <p className="mt-2 max-w-2xl text-sm text-[#5C5348]">
                  Review sales, payments, cash drawer results, outstanding balances, and close the
                  business day.
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
                {!readOnly && canCreate ? (
                  <button
                    type="button"
                    onClick={() => void onSaveDraft()}
                    disabled={draftSaving}
                    className="rounded-xl border border-[#E8E0D4] bg-[#F5E6C8] px-4 py-2 text-sm font-semibold text-[#1B4332] disabled:opacity-50"
                  >
                    {draftSaving ? "Saving…" : "Save draft"}
                  </button>
                ) : null}
                {!readOnly && canClose && !data?.existingClosingId ? (
                  <span className="self-center text-xs text-amber-800">
                    Save draft first to enable close day.
                  </span>
                ) : null}
                {!readOnly && canClose && data?.existingClosingId ? (
                  <button
                    type="button"
                    onClick={() => setCloseModal(true)}
                    className="rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-semibold text-[#F5E6C8] shadow-md hover:bg-[#163d2c]"
                  >
                    Close day
                  </button>
                ) : null}
                {readOnly && data?.existingClosingId && canPrint ? (
                  <Link
                    href={`/dashboard/daily-closing/${data.existingClosingId}/print?auto=1`}
                    target="_blank"
                    className="inline-flex items-center gap-2 rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm font-semibold text-[#1B4332] shadow-sm hover:bg-[#FFFCF7]"
                  >
                    <Printer className="h-4 w-4" />
                    Print report
                  </Link>
                ) : null}
              </div>
            </div>
          </header>

          <section className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-[#5C5348]">Business date</span>
                <input
                  type="date"
                  disabled={readOnly}
                  value={businessDate}
                  onChange={(e) => setBusinessDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2 text-sm disabled:opacity-60"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-[#5C5348]">Branch</span>
                <select
                  value={branchId}
                  disabled={readOnly || (!multiBranch && !!user?.branchId)}
                  onChange={(e) => setBranchId(e.target.value)}
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
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-xs font-medium uppercase text-[#8A7E6E]">Status</span>
              {data?.status === "CLOSED" ? (
                <span className="rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-800">
                  CLOSED
                </span>
              ) : data?.status === "DRAFT" ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                  DRAFT
                </span>
              ) : (
                <span className="rounded-full border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-1 text-xs font-semibold text-[#5C5348]">
                  OPEN
                </span>
              )}
              {data?.closedBy ? (
                <span className="text-[#5C5348]">
                  Closed by {data.closedBy.name}
                  {data.closedAt ? ` · ${formatDateTimeAmPm(data.closedAt)}` : ""}
                </span>
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
              <p className="font-semibold">Could not load daily closing</p>
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

          {phase === "ready" && data ? (
            <>
              {data.warnings.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                    <ul className="list-inside list-disc text-sm text-amber-950">
                      {data.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Gross sales", data.salesSummary.grossSales],
                  ["Total collected", data.salesSummary.totalCollected],
                  ["Outstanding", data.salesSummary.outstandingBalance],
                  ["Invoices", data.invoiceSummary.finalizedCount],
                  ["Payments", data.paymentSummary.paymentCount],
                  [
                    "Cash difference (drawer)",
                    cashDrawer?.state === "CLOSED" &&
                    typeof cashDrawer?.cashDifference === "number"
                      ? cashDrawer.cashDifference
                      : null,
                  ],
                  ["Completed bookings", data.operationalSummary.completedBookingCount],
                  ["Queue completed", data.operationalSummary.queueCompletedCount],
                ].map(([label, val]) => (
                  <div
                    key={String(label)}
                    className="rounded-2xl border border-[#E8E0D4] bg-white p-4 shadow-sm"
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-[#8A7E6E]">
                      {label}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-[#1B4332]">
                      {val == null
                        ? "—"
                        : typeof val === "number" && String(label).includes("bookings")
                          ? val
                          : typeof val === "number"
                            ? formatEGP(val)
                            : val}
                    </p>
                  </div>
                ))}
              </div>

              <section className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-[#1B4332]">Cash drawer</h2>
                {cashDrawer?.state === "NONE" ? (
                  <div className="mt-3 text-sm text-amber-900">
                    <p>No cash drawer was opened for this branch/date.</p>
                    <Link
                      href="/dashboard/cash-drawer"
                      className="mt-2 inline-block font-semibold text-[#1B4332] underline"
                    >
                      Open cash drawer
                    </Link>
                  </div>
                ) : cashDrawer?.state === "OPEN" ? (
                  <div className="mt-3 text-sm text-amber-900">
                    <p>Cash drawer is still open.</p>
                    <p className="mt-1">
                      Expected {formatEGP(Number(cashDrawer.expectedCash ?? 0))} · Difference{" "}
                      {typeof cashDrawer.cashDifference === "number"
                        ? formatEGP(cashDrawer.cashDifference)
                        : "—"}
                    </p>
                    <Link
                      href="/dashboard/cash-drawer"
                      className="mt-2 inline-block font-semibold text-[#1B4332] underline"
                    >
                      Go to Cash Drawer
                    </Link>
                  </div>
                ) : (
                  (() => {
                    const d = cashDrawer ?? {};
                    const closedByName = (d.closedBy as { name?: string } | null)?.name;
                    return (
                  <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="flex justify-between border-b border-[#F0EBE3] py-1">
                      <dt>Opening</dt>
                      <dd>{formatEGP(Number(d.openingBalance ?? 0))}</dd>
                    </div>
                    <div className="flex justify-between border-b border-[#F0EBE3] py-1">
                      <dt>Cash payments</dt>
                      <dd>{formatEGP(Number(d.cashPaymentsTotal ?? 0))}</dd>
                    </div>
                    <div className="flex justify-between border-b border-[#F0EBE3] py-1">
                      <dt>Expected</dt>
                      <dd className="font-semibold">
                        {formatEGP(Number(d.expectedCash ?? 0))}
                      </dd>
                    </div>
                    <div className="flex justify-between border-b border-[#F0EBE3] py-1">
                      <dt>Counted</dt>
                      <dd>
                        {d.countedCash != null
                          ? formatEGP(Number(d.countedCash))
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between border-b border-[#F0EBE3] py-1">
                      <dt>Difference</dt>
                      <dd>
                        {d.cashDifference != null
                          ? formatEGP(Number(d.cashDifference))
                          : "—"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2 text-xs text-[#8A7E6E]">
                      {closedByName ? `Closed by ${closedByName}` : null}
                      {typeof d.closedAt === "string"
                        ? ` · ${formatDateTimeAmPm(d.closedAt)}`
                        : null}
                    </div>
                  </dl>
                    );
                  })()
                )}
              </section>

              <section className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-[#1B4332]">Payment breakdown</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {paymentRows.map((r) => (
                    <div
                      key={r.method}
                      className="rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] p-4"
                    >
                      <p className="text-xs font-semibold uppercase text-[#8A7E6E]">
                        {methodLabel(r.method)}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-[#1B4332]">
                        {formatEGP(r.amount)}
                      </p>
                      <p className="text-xs text-[#8A7E6E]">{r.count} payments</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-[#1B4332]">Invoice summary</h2>
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div className="flex justify-between">
                    <dt>Finalized</dt>
                    <dd>{data.invoiceSummary.finalizedCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Paid</dt>
                    <dd>{data.invoiceSummary.paidCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Partially paid</dt>
                    <dd>{data.invoiceSummary.partiallyPaidCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Unpaid</dt>
                    <dd>{data.invoiceSummary.unpaidCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Total invoiced</dt>
                    <dd>{formatEGP(data.invoiceSummary.totalInvoiced)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Total paid</dt>
                    <dd>{formatEGP(data.invoiceSummary.totalPaid)}</dd>
                  </div>
                  <div className="flex justify-between sm:col-span-2">
                    <dt>Total remaining</dt>
                    <dd>{formatEGP(data.invoiceSummary.totalRemaining)}</dd>
                  </div>
                </dl>

                <h3 className="mt-6 text-sm font-semibold text-[#1B4332]">Recent invoices</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b border-[#E8E0D4] text-xs uppercase text-[#8A7E6E]">
                      <tr>
                        <th className="py-2 pr-3">Invoice</th>
                        <th className="py-2 pr-3">Client</th>
                        <th className="py-2 pr-3">Total</th>
                        <th className="py-2 pr-3">Paid</th>
                        <th className="py-2 pr-3">Remaining</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Time</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentInvoices.map((inv) => (
                        <tr key={inv.id} className="border-b border-[#F0EBE3]">
                          <td className="py-2 pr-3 font-medium">{inv.invoiceNumber}</td>
                          <td className="py-2 pr-3">{inv.client?.fullName ?? "—"}</td>
                          <td className="py-2 pr-3">{formatEGP(inv.totalAmount)}</td>
                          <td className="py-2 pr-3">{formatEGP(inv.paidAmount)}</td>
                          <td className="py-2 pr-3">{formatEGP(inv.remainingAmount)}</td>
                          <td className="py-2 pr-3">{inv.paymentStatus}</td>
                          <td className="py-2 pr-3 text-[#8A7E6E]">
                            {formatDateTimeAmPm(inv.createdAt)}
                          </td>
                          <td className="py-2">
                            {canInvoice ? (
                              <Link
                                href={`/dashboard/invoices?search=${encodeURIComponent(inv.invoiceNumber)}`}
                                className="text-xs font-semibold text-[#1B4332] underline"
                              >
                                Invoice
                              </Link>
                            ) : null}
                            <a
                              href={`/dashboard/invoices/${inv.id}/receipt?print=1`}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 text-xs font-semibold text-[#C4A35A] underline"
                            >
                              Receipt
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-[#1B4332]">Recent payments</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[800px] text-left text-sm">
                    <thead className="border-b border-[#E8E0D4] text-xs uppercase text-[#8A7E6E]">
                      <tr>
                        <th className="py-2 pr-3">Time</th>
                        <th className="py-2 pr-3">Method</th>
                        <th className="py-2 pr-3">Amount</th>
                        <th className="py-2 pr-3">Client</th>
                        <th className="py-2 pr-3">Invoice</th>
                        <th className="py-2 pr-3">Reference</th>
                        <th className="py-2 pr-3">Cashier</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentPayments.map((p) => (
                        <tr key={p.id} className="border-b border-[#F0EBE3]">
                          <td className="py-2 pr-3">
                            {formatDateTimeAmPm(p.paidAt ?? p.createdAt)}
                          </td>
                          <td className="py-2 pr-3">{methodLabel(p.method)}</td>
                          <td className="py-2 pr-3">{formatEGP(p.amount)}</td>
                          <td className="py-2 pr-3">{p.client?.fullName ?? "—"}</td>
                          <td className="py-2 pr-3">{p.invoice?.invoiceNumber ?? "—"}</td>
                          <td className="py-2 pr-3 text-[#8A7E6E]">{p.reference ?? "—"}</td>
                          <td className="py-2 pr-3">{p.cashier?.name ?? "—"}</td>
                          <td className="py-2">
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
                                className="ml-2 text-xs font-semibold text-[#C4A35A] underline"
                              >
                                Receipt
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-[#1B4332]">Operational activity</h2>
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div className="flex justify-between">
                    <dt>Bookings (slot day)</dt>
                    <dd>{data.operationalSummary.bookingCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Completed</dt>
                    <dd>{data.operationalSummary.completedBookingCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>In progress / arrived</dt>
                    <dd>{data.operationalSummary.inProgressBookingCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Cancelled / no-show</dt>
                    <dd>{data.operationalSummary.cancelledBookingCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Queue visits (checked in)</dt>
                    <dd>{data.operationalSummary.queueVisitCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Queue completed</dt>
                    <dd>{data.operationalSummary.queueCompletedCount}</dd>
                  </div>
                  <div className="flex justify-between sm:col-span-2">
                    <dt>Active queue (same day)</dt>
                    <dd>{data.operationalSummary.queueActiveCount}</dd>
                  </div>
                </dl>
              </section>

              {!readOnly && canCreate ? (
                <section className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-[#1B4332]">Staff notes</h2>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="mt-3 w-full rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2 text-sm"
                    placeholder="Optional notes saved with the draft / close…"
                  />
                </section>
              ) : null}
            </>
          ) : null}
        </div>

        {closeModal && data ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <form
              onSubmit={onCloseDay}
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#E8E0D4] bg-white p-6 shadow-xl"
            >
              <h3 className="text-lg font-semibold text-[#1B4332]">Close business day?</h3>
              <p className="mt-2 text-sm text-[#5C5348]">
                {branchName} · {businessDate}
              </p>
              <ul className="mt-4 space-y-1 text-sm">
                <li className="flex justify-between">
                  <span>Gross sales</span>
                  <span>{formatEGP(data.salesSummary.grossSales)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Total collected</span>
                  <span>{formatEGP(data.salesSummary.totalCollected)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Outstanding</span>
                  <span>{formatEGP(data.salesSummary.outstandingBalance)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Expected cash (drawer)</span>
                  <span>{formatEGP(Number(cashDrawer?.expectedCash ?? 0))}</span>
                </li>
                <li className="flex justify-between">
                  <span>Counted cash</span>
                  <span>
                    {cashDrawer?.countedCash != null
                      ? formatEGP(Number(cashDrawer.countedCash))
                      : "—"}
                  </span>
                </li>
                <li className="flex justify-between font-semibold">
                  <span>Cash difference</span>
                  <span>
                    {cashDrawer?.cashDifference != null
                      ? formatEGP(Number(cashDrawer.cashDifference))
                      : "—"}
                  </span>
                </li>
              </ul>
              {data.warnings.length > 0 ? (
                <ul className="mt-4 list-inside list-disc text-xs text-amber-900">
                  {data.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <label className="mt-4 block text-sm">
                Closing notes (optional)
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
                  {closeSaving ? "Closing…" : "Close day"}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </PermissionGuard>
  );
}
