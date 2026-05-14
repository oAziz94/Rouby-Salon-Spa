"use client";

import {
  ApiClientError,
  exportDashboardFinancialReport,
  getDashboardBranches,
  getDashboardFinancialReports,
  type DashboardBranch,
  type DashboardFinancialReport,
} from "@rouby/api-client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

function dayString(value: Date): string {
  const y = value.getUTCFullYear();
  const m = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${value.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangeByPreset(preset: string): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (preset === "today") return { dateFrom: dayString(today), dateTo: dayString(today) };
  if (preset === "yesterday") {
    const y = new Date(today.getTime() - 86400000);
    return { dateFrom: dayString(y), dateTo: dayString(y) };
  }
  if (preset === "last7") {
    const from = new Date(today.getTime() - 6 * 86400000);
    return { dateFrom: dayString(from), dateTo: dayString(today) };
  }
  if (preset === "lastMonth") {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    return { dateFrom: dayString(first), dateTo: dayString(last) };
  }
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return { dateFrom: dayString(first), dateTo: dayString(today) };
}

function egp(value: number): string {
  return `EGP ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function DashboardReportsPage() {
  const { token, user, hasPermission } = useDashboardAuth();
  const canReadBranches = hasPermission("branches.read");
  const canReadFinancialReports = hasPermission("reports.view_financial");
  const canReadInvoices = hasPermission("invoices.read");
  const canRecordPayments = hasPermission("payments.record") || hasPermission("payments.record_simple");
  const canReadDailyClosing = hasPermission("dailyClosing.read");
  const canReadCashDrawer = hasPermission("cashDrawer.read");
  const canAccessMultipleBranches = useMemo(
    () => user?.branchId === null && canReadBranches,
    [canReadBranches, user?.branchId],
  );

  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [preset, setPreset] = useState("thisMonth");
  const defaultRange = useMemo(() => rangeByPreset("thisMonth"), []);
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultRange.dateTo);
  const [branchId, setBranchId] = useState("");
  const [report, setReport] = useState<DashboardFinancialReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [salesTab, setSalesTab] = useState<"ALL" | "SERVICE" | "PACKAGE" | "ADD_ON">("ALL");

  useEffect(() => {
    if (!token || !canReadBranches) return;
    getDashboardBranches(token)
      .then((items) => {
        setBranches(items);
        setBranchId((current) => current || user?.branchId || items[0]?.id || "");
      })
      .catch(() => {
        if (user?.branchId) setBranchId(user.branchId);
      });
  }, [canReadBranches, token, user?.branchId]);

  const loadReport = () => {
    if (!token) return;
    setLoading(true);
    setError("");
    void getDashboardFinancialReports(token, {
      dateFrom,
      dateTo,
      branchId: branchId || undefined,
    })
      .then((res) => setReport(res))
      .catch((requestError) => setError(formatApiError(requestError)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token || !dateFrom || !dateTo) return;
    if (!branchId && canAccessMultipleBranches) return;
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, dateFrom, dateTo, branchId, canAccessMultipleBranches]);

  const onPreset = (next: string) => {
    setPreset(next);
    if (next !== "custom") {
      const range = rangeByPreset(next);
      setDateFrom(range.dateFrom);
      setDateTo(range.dateTo);
    }
  };

  const filteredSales = useMemo(() => {
    if (!report) return [];
    if (salesTab === "ALL") return report.salesByItem;
    return report.salesByItem.filter((row) => {
      if (salesTab === "ADD_ON") return row.itemType === "ADD_ON" || row.itemType === "SERVICE_ENHANCEMENT";
      return row.itemType === salesTab;
    });
  }, [report, salesTab]);

  const downloadCsv = async (type: "summary" | "payments" | "outstanding" | "sales-items" | "daily-closing") => {
    if (!token) return;
    try {
      setExporting(true);
      const blob = await exportDashboardFinancialReport(token, {
        dateFrom,
        dateTo,
        branchId: branchId || undefined,
        type,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `financial-report-${type}-${dateFrom}-${dateTo}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setExporting(false);
    }
  };

  return (
    <PermissionGuard permission="reports.view_financial">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Reports</h1>
              <p className="mt-2 text-sm text-[#7A6A58]">
                Analyze revenue, collections, outstanding balances, services, branches, and daily closing performance.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={loadReport} className="rounded-md bg-[#1F6B57] px-3 py-2 text-sm font-semibold text-white">
                Refresh
              </button>
              <button onClick={() => void downloadCsv("summary")} disabled={exporting} className="rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-[#1F2420] disabled:opacity-60">
                Export CSV
              </button>
              <button onClick={() => window.print()} className="rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-[#1F2420]">
                Print report
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-5">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date range</span>
              <select value={preset} onChange={(e) => onPreset(e.target.value)} className="w-full rounded-md border border-border bg-white px-3 py-2">
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last7">Last 7 days</option>
                <option value="thisMonth">This month</option>
                <option value="lastMonth">Last month</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date from</span>
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPreset("custom"); }} className="w-full rounded-md border border-border bg-white px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date to</span>
              <input type="date" value={dateTo} min={dateFrom} onChange={(e) => { setDateTo(e.target.value); setPreset("custom"); }} className="w-full rounded-md border border-border bg-white px-3 py-2" />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-[#1F2420]">Branch</span>
              <select value={branchId} disabled={!canAccessMultipleBranches} onChange={(e) => setBranchId(e.target.value)} className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]">
                <option value="">All accessible branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-[#F3EBDD] px-2 py-1 text-[#7A6A58]">{dateFrom} to {dateTo}</span>
            <span className="rounded-full bg-[#F3EBDD] px-2 py-1 text-[#7A6A58]">{branchId ? branches.find((b) => b.id === branchId)?.name ?? "Branch" : "All branches"}</span>
            <button onClick={() => { setPreset("thisMonth"); const range = rangeByPreset("thisMonth"); setDateFrom(range.dateFrom); setDateTo(range.dateTo); setBranchId(user?.branchId ?? ""); }} className="rounded-full border border-border bg-white px-2 py-1 text-[#1F2420]">Clear filters</button>
          </div>
        </section>

        {loading ? <section className="rounded-xl border border-border bg-card p-6 text-sm text-[#7A6A58]">Loading financial report...</section> : null}
        {error ? <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-4 text-sm text-danger">{error}</section> : null}

        {!loading && !error && report ? (
          <>
            {!report.hasData ? (
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-[#1F2420]">No financial activity found</h2>
                <p className="mt-2 text-sm text-[#7A6A58]">There are no finalized invoices or payments for this period.</p>
              </section>
            ) : null}

            <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                { title: "Gross invoiced", value: egp(report.kpis.grossInvoiced), sub: `${report.kpis.invoiceCount} finalized invoices` },
                { title: "Total collected", value: egp(report.kpis.totalCollected), sub: `Top method: ${report.paymentBreakdown.topPaymentMethod ?? "-"}` },
                { title: "Outstanding balance", value: egp(report.kpis.outstandingBalance), sub: `${report.outstanding.unpaidInvoicesCount} unpaid invoices` },
                { title: "Paid invoices", value: `${report.kpis.paidInvoices} (${pct(report.kpis.paidInvoicesRate)})`, sub: "Finalized invoices paid in full" },
                { title: "Average invoice value", value: egp(report.kpis.averageInvoiceValue), sub: "Gross invoiced / invoices count" },
                { title: "Cash difference", value: egp(report.kpis.cashDifference), sub: "Daily closing reconciliation variance" },
              ].map((card) => (
                <article key={card.title} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-[#7A6A58]">{card.title}</p>
                  <p className="mt-2 text-xl font-semibold text-[#1F2420]">{card.value}</p>
                  <p className="mt-1 text-xs text-[#7A6A58]">{card.sub}</p>
                </article>
              ))}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[#1F2420]">Needs attention</h2>
              {report.alerts.length === 0 ? (
                <p className="mt-3 rounded-lg border border-[#CDE8D8] bg-[#EEF9F1] px-3 py-2 text-sm text-[#2B5F45]">No financial issues found for this period.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {report.alerts.map((alert) => (
                    <article key={alert.code} className="rounded-lg border border-border bg-[#FFFDF9] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#F3EBDD] px-2 py-1 text-xs font-semibold text-[#7A6A58]">{alert.severity.toUpperCase()}</span>
                        <p className="text-sm font-medium text-[#1F2420]">{alert.message}</p>
                        {typeof alert.count === "number" ? <span className="text-xs text-[#7A6A58]">{alert.count} cases</span> : null}
                        {typeof alert.amount === "number" ? <span className="text-xs text-[#7A6A58]">{egp(alert.amount)}</span> : null}
                        {alert.actionHref && alert.actionLabel ? <Link className="ml-auto text-xs font-semibold text-[#1F6B57]" href={alert.actionHref}>{alert.actionLabel}</Link> : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[#1F2420]">Revenue trend</h2>
              <div className="mt-4 grid gap-2">
                {report.revenueTrend.length === 0 ? <p className="text-sm text-[#7A6A58]">No data for selected period.</p> : report.revenueTrend.map((point) => {
                  const max = Math.max(1, ...report.revenueTrend.map((x) => x.invoiced));
                  const w = Math.min(100, (point.invoiced / max) * 100);
                  return (
                    <div key={point.date} className="grid grid-cols-[100px,1fr,140px] items-center gap-3 text-xs">
                      <span className="text-[#7A6A58]">{point.date}</span>
                      <div className="h-2 rounded-full bg-[#F3EBDD]">
                        <div className="h-2 rounded-full bg-[#1F6B57]" style={{ width: `${w}%` }} />
                      </div>
                      <span className="text-right text-[#1F2420]">{egp(point.invoiced)} / {egp(point.collected)}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-[#1F2420]">Payment methods</h2>
                  <button onClick={() => void downloadCsv("payments")} className="text-xs font-semibold text-[#1F6B57]">Export payments CSV</button>
                </div>
                {report.paymentBreakdown.methods.length === 0 ? <p className="text-sm text-[#7A6A58]">No payments were recorded for this period.</p> : (
                  <div className="space-y-2">
                    {report.paymentBreakdown.methods.map((method) => (
                      <div key={method.method} className="rounded-lg border border-border bg-[#FFFDF9] p-3">
                        <div className="flex justify-between text-sm"><span className="font-medium text-[#1F2420]">{method.method}</span><span className="text-[#7A6A58]">{pct(method.percentage)}</span></div>
                        <p className="mt-1 text-sm text-[#1F2420]">{egp(method.amount)} · {method.count} payments</p>
                      </div>
                    ))}
                    <p className="text-xs text-[#7A6A58]">Cash {egp(report.paymentBreakdown.cashTotal)} · Non-cash {egp(report.paymentBreakdown.nonCashTotal)}</p>
                  </div>
                )}
              </article>

              <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-[#1F2420]">Outstanding balances</h2>
                  <button onClick={() => void downloadCsv("outstanding")} className="text-xs font-semibold text-[#1F6B57]">Export outstanding CSV</button>
                </div>
                <p className="text-sm text-[#7A6A58]">
                  Total unpaid {egp(report.outstanding.totalUnpaidAmount)} · Unpaid {report.outstanding.unpaidInvoicesCount} · Partially paid {report.outstanding.partiallyPaidInvoicesCount}
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead><tr className="text-left text-xs text-[#7A6A58]"><th>Invoice</th><th>Client</th><th>Remaining</th><th>Age</th><th>Status</th><th /></tr></thead>
                    <tbody>
                      {report.outstanding.invoices.slice(0, 12).map((row) => (
                        <tr key={row.invoiceId} className="border-t border-border">
                          <td className="py-2 text-[#1F2420]">{row.invoiceNumber}</td>
                          <td className="py-2 text-[#1F2420]">{row.clientName}<div className="text-xs text-[#7A6A58]">{row.phone ?? "-"}</div></td>
                          <td className="py-2 text-[#1F2420]">{egp(row.remaining)}</td>
                          <td className="py-2 text-[#1F2420]">{row.ageDays}d</td>
                          <td className="py-2"><span className="rounded-full bg-[#F3EBDD] px-2 py-1 text-xs text-[#7A6A58]">{row.status}</span></td>
                          <td className="py-2 text-right">
                            {canReadInvoices ? <Link className="text-xs font-semibold text-[#1F6B57]" href={`/dashboard/invoices?invoiceId=${row.invoiceId}`}>Open invoice</Link> : null}
                            {canRecordPayments ? <Link className="ml-2 text-xs font-semibold text-[#1F6B57]" href={`/dashboard/invoices?invoiceId=${row.invoiceId}`}>Record payment</Link> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-[#1F2420]">Sales by services / packages / add-ons</h2>
                <div className="flex gap-2 text-xs">
                  {(["ALL", "SERVICE", "PACKAGE", "ADD_ON"] as const).map((tab) => (
                    <button key={tab} onClick={() => setSalesTab(tab)} className={`rounded-full px-3 py-1 ${salesTab === tab ? "bg-[#1F6B57] text-white" : "border border-border bg-white text-[#1F2420]"}`}>{tab}</button>
                  ))}
                  <button onClick={() => void downloadCsv("sales-items")} className="rounded-full border border-border bg-white px-3 py-1 text-[#1F2420]">Export</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="text-left text-xs text-[#7A6A58]"><th>Item</th><th>Type</th><th>Qty</th><th>Gross</th><th>Discount</th><th>Net</th><th>Avg</th><th>Share</th></tr></thead>
                  <tbody>
                    {filteredSales.slice(0, 20).map((row) => (
                      <tr key={`${row.itemType}:${row.itemName}`} className="border-t border-border">
                        <td className="py-2 text-[#1F2420]">{row.itemName}</td><td className="py-2 text-[#1F2420]">{row.itemType}</td><td className="py-2 text-[#1F2420]">{row.quantity}</td>
                        <td className="py-2 text-[#1F2420]">{egp(row.grossRevenue)}</td><td className="py-2 text-[#1F2420]">{egp(row.discountAmount)}</td><td className="py-2 text-[#1F2420]">{egp(row.netRevenue)}</td><td className="py-2 text-[#1F2420]">{egp(row.averagePrice)}</td><td className="py-2 text-[#1F2420]">{pct(row.revenueShare)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[#1F2420]">Branch performance</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="text-left text-xs text-[#7A6A58]"><th>Branch</th><th>Invoiced</th><th>Collected</th><th>Outstanding</th><th>Invoices</th><th>Avg</th><th>Cash diff</th><th>Completed / Queue</th></tr></thead>
                  <tbody>{report.branchPerformance.map((row) => (
                    <tr key={row.branchId} className="border-t border-border">
                      <td className="py-2 text-[#1F2420]">{row.branchName}</td><td className="py-2 text-[#1F2420]">{egp(row.grossInvoiced)}</td><td className="py-2 text-[#1F2420]">{egp(row.collected)}</td><td className="py-2 text-[#1F2420]">{egp(row.outstanding)}</td><td className="py-2 text-[#1F2420]">{row.invoiceCount}</td><td className="py-2 text-[#1F2420]">{egp(row.averageInvoiceValue)}</td><td className="py-2 text-[#1F2420]">{egp(row.cashDifference)}</td><td className="py-2 text-[#1F2420]">{row.completedBookings} / {row.queueVisits}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#1F2420]">Daily closing review</h2>
                <button onClick={() => void downloadCsv("daily-closing")} className="text-xs font-semibold text-[#1F6B57]">Export daily closing CSV</button>
              </div>
              {report.dailyClosingStatus.length === 0 ? <p className="text-sm text-[#7A6A58]">No daily closing reports found for this period.</p> : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead><tr className="text-left text-xs text-[#7A6A58]"><th>Date</th><th>Branch</th><th>Status</th><th>Gross</th><th>Collected</th><th>Expected</th><th>Counted</th><th>Diff</th><th>Closed by</th><th /></tr></thead>
                    <tbody>{report.dailyClosingStatus.slice(0, 40).map((row) => (
                      <tr key={`${row.branchId}:${row.date}`} className="border-t border-border">
                        <td className="py-2 text-[#1F2420]">{row.date}</td><td className="py-2 text-[#1F2420]">{row.branchName}</td>
                        <td className="py-2"><span className={`rounded-full px-2 py-1 text-xs ${row.status === "CLOSED" ? "bg-[#EEF9F1] text-[#2B5F45]" : row.status === "DRAFT" ? "bg-[#FFF4DC] text-[#7A6A58]" : "bg-[#FFF1EC] text-danger"}`}>{row.status}</span></td>
                        <td className="py-2 text-[#1F2420]">{egp(row.grossSales)}</td><td className="py-2 text-[#1F2420]">{egp(row.totalCollected)}</td><td className="py-2 text-[#1F2420]">{egp(row.expectedCash)}</td><td className="py-2 text-[#1F2420]">{row.countedCash === null ? "-" : egp(row.countedCash)}</td><td className="py-2 text-[#1F2420]">{egp(row.cashDifference)}</td><td className="py-2 text-[#1F2420]">{row.closedBy ?? "-"}</td>
                        <td className="py-2 text-right">
                          {canReadDailyClosing ? <Link className="text-xs font-semibold text-[#1F6B57]" href="/dashboard/daily-closing">Open daily closing</Link> : null}
                          {canReadCashDrawer ? <Link className="ml-2 text-xs font-semibold text-[#1F6B57]" href="/dashboard/cash-drawer">Open cash drawer</Link> : null}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-[#1F2420]">Cash drawer summary</h2>
                <p className="mt-2 text-sm text-[#7A6A58]">Opening {egp(report.cashDrawerSummary.openingCashTotal)} · Expected {egp(report.cashDrawerSummary.expectedCash)} · Counted {egp(report.cashDrawerSummary.countedCash)} · Difference {egp(report.cashDrawerSummary.cashDifference)}</p>
                <p className="mt-1 text-xs text-[#7A6A58]">Open drawers: {report.cashDrawerSummary.openDrawersCount} · Closed drawers: {report.cashDrawerSummary.closedDrawersCount}</p>
              </article>
              <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-[#1F2420]">Client financial insights</h2>
                <p className="mt-2 text-sm text-[#7A6A58]">New clients revenue {egp(report.clientInsights.newClientsRevenue)} · Repeat clients revenue {egp(report.clientInsights.repeatClientsRevenue)}</p>
                <div className="mt-3 space-y-2">
                  {report.clientInsights.topClientsByRevenue.slice(0, 5).map((row) => (
                    <div key={row.clientId} className="flex items-center justify-between rounded-lg border border-border bg-[#FFFDF9] p-2 text-sm">
                      <span className="text-[#1F2420]">{row.clientName}</span>
                      <span className="text-[#7A6A58]">{egp(row.totalSpent)} · {row.invoiceCount} invoices</span>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            {report.cashierCollections.length > 0 ? (
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-[#1F2420]">Cashier collections</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead><tr className="text-left text-xs text-[#7A6A58]"><th>Cashier</th><th>Total</th><th>Cash</th><th>Card/Digital</th><th>Count</th><th>Average</th></tr></thead>
                    <tbody>{report.cashierCollections.map((row) => (
                      <tr key={row.userId} className="border-t border-border">
                        <td className="py-2 text-[#1F2420]">{row.name}</td><td className="py-2 text-[#1F2420]">{egp(row.totalCollected)}</td><td className="py-2 text-[#1F2420]">{egp(row.cashCollected)}</td><td className="py-2 text-[#1F2420]">{egp(row.digitalCollected)}</td><td className="py-2 text-[#1F2420]">{row.paymentCount}</td><td className="py-2 text-[#1F2420]">{egp(row.averagePayment)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {!canReadFinancialReports ? <section className="rounded-xl border border-border bg-card p-4 text-sm text-[#7A6A58]">Financial reports require `reports.view_financial` permission.</section> : null}
      </section>
    </PermissionGuard>
  );
}
