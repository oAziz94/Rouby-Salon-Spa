"use client";

import {
  ApiClientError,
  getDashboardDailyClosing,
  type DashboardDailyClosingReport,
} from "@rouby/api-client";
import { formatDateTimeAmPm } from "@rouby/wall-clock";
import { Loader2, Printer } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

function formatEGP(n: number): string {
  return `EGP ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DailyClosingPrintPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { token, hasPermission } = useDashboardAuth();
  const canPrint = hasPermission("dailyClosing.print");

  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [report, setReport] = useState<DashboardDailyClosingReport | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setPhase("loading");
    setError("");
    try {
      const r = await getDashboardDailyClosing(token, id);
      setReport(r);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to load report.");
      setPhase("error");
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (phase !== "ready" || report?.status !== "CLOSED") return;
    if (searchParams.get("auto") !== "1") return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [phase, report?.status, searchParams]);

  return (
    <PermissionGuard permission="dailyClosing.print">
      <div className="daily-closing-print min-h-screen bg-white text-black">
        <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-[#FFFCF7] px-4 py-3">
          <p className="text-sm font-medium text-[#1B4332]">Daily closing print preview</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!canPrint}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1B4332] px-3 py-1.5 text-xs font-semibold text-[#F5E6C8] disabled:opacity-40"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
          </div>
        </div>

        {phase === "loading" ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="p-8 text-sm text-red-700">{error}</div>
        ) : null}

        {phase === "ready" && report ? (
          <article className="mx-auto max-w-[210mm] px-8 py-10 print:px-6 print:py-8">
            <header className="border-b border-black pb-4">
              <h1 className="text-2xl font-bold">Alrouby Salon &amp; Spa</h1>
              <p className="mt-1 text-sm">Daily closing report</p>
              <p className="mt-2 text-sm">
                Branch: <strong>{report.branch.name}</strong>
              </p>
              <p className="text-sm">
                Business date: <strong>{report.businessDate}</strong>
              </p>
              <p className="text-sm">
                Report ref: <strong>{report.shortRef}</strong>
              </p>
              {report.closedBy ? (
                <p className="text-sm">
                  Closed by {report.closedBy.name}
                  {report.closedAt ? ` · ${formatDateTimeAmPm(report.closedAt)}` : ""}
                </p>
              ) : (
                <p className="text-sm text-neutral-600">Draft / not finalized</p>
              )}
            </header>

            <section className="mt-6">
              <h2 className="text-sm font-bold uppercase tracking-wide">Sales</h2>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1">Gross sales</td>
                    <td className="py-1 text-right">{formatEGP(report.totals.grossSales)}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Total collected</td>
                    <td className="py-1 text-right">{formatEGP(report.totals.totalCollected)}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Outstanding balance</td>
                    <td className="py-1 text-right">
                      {formatEGP(report.totals.outstandingBalance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="mt-6">
              <h2 className="text-sm font-bold uppercase tracking-wide">Payments by method</h2>
              <table className="mt-2 w-full border border-black text-sm print:text-xs">
                <thead>
                  <tr className="border-b border-black">
                    <th className="px-2 py-1 text-left">Method</th>
                    <th className="px-2 py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Cash", report.totals.cashCollected],
                      ["Card", report.totals.cardCollected],
                      ["Instapay", report.totals.instapayCollected],
                      ["Wallet", report.totals.walletCollected],
                      ["Bank transfer", report.totals.bankTransferCollected],
                      ["Other", report.totals.otherCollected],
                    ] as const
                  ).map(([label, amt]) => (
                    <tr key={label} className="border-b border-neutral-300">
                      <td className="px-2 py-1">{label}</td>
                      <td className="px-2 py-1 text-right">{formatEGP(amt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="mt-6">
              <h2 className="text-sm font-bold uppercase tracking-wide">Cash drawer</h2>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1">Expected cash</td>
                    <td className="py-1 text-right">{formatEGP(report.totals.expectedCash)}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Counted cash</td>
                    <td className="py-1 text-right">{formatEGP(report.totals.countedCash)}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Difference</td>
                    <td className="py-1 text-right">{formatEGP(report.totals.cashDifference)}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="mt-6">
              <h2 className="text-sm font-bold uppercase tracking-wide">Counts</h2>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1">Invoices</td>
                    <td className="py-1 text-right">{report.totals.invoiceCount}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Payments</td>
                    <td className="py-1 text-right">{report.totals.paymentCount}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Bookings (completed)</td>
                    <td className="py-1 text-right">{report.totals.completedBookingCount}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Queue completed</td>
                    <td className="py-1 text-right">{report.totals.queueCompletedCount}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {report.notes ? (
              <section className="mt-6">
                <h2 className="text-sm font-bold uppercase tracking-wide">Notes</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm">{report.notes}</p>
              </section>
            ) : null}

            <section className="mt-16 grid gap-16 border-t border-black pt-8 sm:grid-cols-2 print:mt-12">
              <div>
                <p className="text-sm font-semibold">Receptionist</p>
                <div className="mt-10 border-b border-black" />
              </div>
              <div>
                <p className="text-sm font-semibold">Manager</p>
                <div className="mt-10 border-b border-black" />
              </div>
            </section>
          </article>
        ) : null}

        <style
          dangerouslySetInnerHTML={{
            __html: `@media print { .no-print { display: none !important; } @page { size: A4; margin: 12mm; } }`,
          }}
        />
      </div>
    </PermissionGuard>
  );
}
