"use client";

import {
  ApiClientError,
  exportDashboardStaffServicesRevenueReport,
  getDashboardBranches,
  getDashboardServiceCategories,
  getDashboardServices,
  getDashboardStaffList,
  getDashboardStaffServicesRevenueDetail,
  getDashboardStaffServicesRevenueReport,
  type DashboardBranch,
  type DashboardServiceCategory,
  type DashboardService,
  type StaffServicesRevenueDetailReport,
  type StaffServicesRevenueQuery,
  type StaffServicesRevenueReport,
  type StaffServicesRevenueStaffRow,
} from "@rouby/api-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

const CAIRO_TZ = "Africa/Cairo";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

function cairoYmd(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDaysYmd(ymd: string, delta: number): string {
  const { y, m, d } = parseYmd(ymd);
  const t = new Date(Date.UTC(y, m - 1, d + delta, 12, 0, 0));
  return formatYmd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

function cairoWeekday(ymd: string): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: CAIRO_TZ,
    weekday: "short",
  }).format(new Date(`${ymd}T12:00:00.000Z`));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[label.slice(0, 3)] ?? 0;
}

function rangeByPreset(preset: string): { dateFrom: string; dateTo: string } {
  const today = cairoYmd();
  if (preset === "today") return { dateFrom: today, dateTo: today };
  if (preset === "yesterday") {
    const y = addDaysYmd(today, -1);
    return { dateFrom: y, dateTo: y };
  }
  if (preset === "thisWeek") {
    const wd = cairoWeekday(today);
    const mondayOffset = wd === 0 ? -6 : 1 - wd;
    return { dateFrom: addDaysYmd(today, mondayOffset), dateTo: today };
  }
  if (preset === "lastMonth") {
    const { y, m } = parseYmd(today);
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const lastDay = new Date(Date.UTC(prevY, prevM, 0, 12)).getUTCDate();
    return {
      dateFrom: formatYmd(prevY, prevM, 1),
      dateTo: formatYmd(prevY, prevM, lastDay),
    };
  }
  const { y, m } = parseYmd(today);
  return { dateFrom: formatYmd(y, m, 1), dateTo: today };
}

function egp(value: number): string {
  return `EGP ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function BarChart({
  rows,
  valueKey,
  labelKey,
  formatValue,
}: {
  rows: Array<Record<string, string | number>>;
  valueKey: string;
  labelKey: string;
  formatValue?: (v: number) => string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#7A6A58]">No data for the selected period.</p>;
  }
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const value = Number(row[valueKey]) || 0;
        const w = Math.min(100, (value / max) * 100);
        return (
          <div
            key={String(row[labelKey]) + String(row[valueKey])}
            className="grid grid-cols-[120px,1fr,100px] items-center gap-3 text-xs"
          >
            <span className="truncate text-[#7A6A58]" title={String(row[labelKey])}>
              {row[labelKey]}
            </span>
            <div className="h-2 rounded-full bg-[#F3EBDD]">
              <div className="h-2 rounded-full bg-[#1F6B57]" style={{ width: `${w}%` }} />
            </div>
            <span className="text-right text-[#1F2420]">
              {formatValue ? formatValue(value) : value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-border bg-card p-4">
          <div className="h-3 w-24 rounded bg-[#F3EBDD]" />
          <div className="mt-3 h-7 w-32 rounded bg-[#F3EBDD]" />
        </div>
      ))}
    </div>
  );
}

function StaffDetailDrawer({
  open,
  staffRow,
  query,
  token,
  onClose,
}: {
  open: boolean;
  staffRow: StaffServicesRevenueStaffRow | null;
  query: StaffServicesRevenueQuery;
  token: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<StaffServicesRevenueDetailReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !token || !staffRow) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError("");
    void getDashboardStaffServicesRevenueDetail(token, staffRow.staffId, query)
      .then(setDetail)
      .catch((e) => setError(formatApiError(e)))
      .finally(() => setLoading(false));
  }, [open, token, staffRow, query]);

  if (!open || !staffRow) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <aside className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-[#FFFDF9] shadow-xl">
        <header className="sticky top-0 z-10 border-b border-border bg-[#FFFDF9] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#1F2420]">{staffRow.staffName}</h2>
              <p className="mt-1 text-xs text-[#7A6A58]">Staff performance detail</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-2 py-1 text-xs text-[#1F2420]"
            >
              Close
            </button>
          </div>
        </header>
        <div className="space-y-5 p-5">
          {loading ? (
            <p className="text-sm text-[#7A6A58]">Loading staff detail...</p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          {!loading && !error && detail?.staff ? (
            <>
              <section className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Services done", value: String(detail.kpis.servicesDone) },
                  { label: "Total revenue", value: egp(detail.kpis.totalRevenue) },
                  { label: "Paid revenue", value: egp(detail.kpis.paidRevenue) },
                  { label: "Avg. service value", value: egp(detail.kpis.averageServiceValue) },
                  { label: "Most performed", value: detail.kpis.mostPerformedService ?? "—" },
                  { label: "Best revenue service", value: detail.kpis.bestRevenueService ?? "—" },
                  { label: "Clients served", value: String(detail.kpis.totalClientsServed) },
                  {
                    label: "Repeat clients",
                    value: `${detail.kpis.repeatClientsInPeriod} in period · ${detail.kpis.repeatClientsFromHistory} returning`,
                  },
                ].map((card) => (
                  <article key={card.label} className="rounded-lg border border-border bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-[#7A6A58]">{card.label}</p>
                    <p className="mt-1 text-sm font-semibold text-[#1F2420]">{card.value}</p>
                  </article>
                ))}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[#1F2420]">Service breakdown</h3>
                {detail.serviceBreakdown.length === 0 ? (
                  <p className="mt-2 text-sm text-[#7A6A58]">No completed services in this period.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-[#7A6A58]">
                          <th className="py-2">Service</th>
                          <th>Qty</th>
                          <th>Revenue</th>
                          <th>Paid</th>
                          <th>Avg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.serviceBreakdown.map((row) => (
                          <tr key={`${row.serviceId ?? row.serviceName}`} className="border-t border-border">
                            <td className="py-2 text-[#1F2420]">{row.serviceName}</td>
                            <td className="py-2">{row.count}</td>
                            <td className="py-2">{egp(row.totalRevenue)}</td>
                            <td className="py-2">{egp(row.paidRevenue)}</td>
                            <td className="py-2">{egp(row.averageValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[#1F2420]">Daily breakdown</h3>
                {detail.dailyBreakdown.length === 0 ? (
                  <p className="mt-2 text-sm text-[#7A6A58]">No daily activity recorded.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-[#7A6A58]">
                          <th className="py-2">Date</th>
                          <th>Services</th>
                          <th>Revenue</th>
                          <th>Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.dailyBreakdown.map((row) => (
                          <tr key={row.date} className="border-t border-border">
                            <td className="py-2 text-[#1F2420]">{row.date}</td>
                            <td className="py-2">{row.servicesDone}</td>
                            <td className="py-2">{egp(row.totalRevenue)}</td>
                            <td className="py-2">{egp(row.paidRevenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

export default function StaffServicesRevenueReportPage() {
  const { token, user, hasPermission } = useDashboardAuth();
  const canReadBranches = hasPermission("branches.read");
  const canAccessMultipleBranches = useMemo(
    () => user?.branchId === null && canReadBranches,
    [canReadBranches, user?.branchId],
  );

  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [staffList, setStaffList] = useState<
    Array<{ id: string; displayName: string }>
  >([]);
  const [services, setServices] = useState<DashboardService[]>([]);
  const [categories, setCategories] = useState<DashboardServiceCategory[]>([]);

  const [preset, setPreset] = useState("thisMonth");
  const defaultRange = useMemo(() => rangeByPreset("thisMonth"), []);
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultRange.dateTo);
  const [branchId, setBranchId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [source, setSource] = useState<StaffServicesRevenueQuery["source"]>("all");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");

  const [report, setReport] = useState<StaffServicesRevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [detailStaff, setDetailStaff] = useState<StaffServicesRevenueStaffRow | null>(null);

  const query = useMemo<StaffServicesRevenueQuery>(
    () => ({
      dateFrom,
      dateTo,
      branchId: branchId || undefined,
      staffId: staffId || undefined,
      serviceId: serviceId || undefined,
      categoryId: categoryId || undefined,
      source: source || "all",
      paymentStatus: paymentStatus
        ? (paymentStatus as StaffServicesRevenueQuery["paymentStatus"])
        : undefined,
      invoiceStatus: invoiceStatus
        ? (invoiceStatus as StaffServicesRevenueQuery["invoiceStatus"])
        : undefined,
    }),
    [
      dateFrom,
      dateTo,
      branchId,
      staffId,
      serviceId,
      categoryId,
      source,
      paymentStatus,
      invoiceStatus,
    ],
  );

  useEffect(() => {
    if (!token) return;
    if (canReadBranches) {
      void getDashboardBranches(token)
        .then((items) => {
          setBranches(items);
          setBranchId((c) => c || user?.branchId || items[0]?.id || "");
        })
        .catch(() => {
          if (user?.branchId) setBranchId(user.branchId);
        });
    } else if (user?.branchId) {
      setBranchId(user.branchId);
    }
    const staffBranch = branchId || user?.branchId;
    if (staffBranch) {
      void getDashboardStaffList(token, staffBranch)
        .then((res) =>
          setStaffList(
            res.staffUsers
              .filter((row) => row.profile?.isActive)
              .map((row) => ({
                id: row.profile!.id,
                displayName: row.profile!.displayName,
              })),
          ),
        )
        .catch(() => setStaffList([]));
    }
    void getDashboardServices(token, { page: 1, pageSize: 200, isActive: true })
      .then((res) => setServices(res.data ?? []))
      .catch(() => setServices([]));
    void getDashboardServiceCategories(token)
      .then((res) => setCategories(res.data ?? []))
      .catch(() => setCategories([]));
  }, [token, canReadBranches, user?.branchId, branchId]);

  const loadReport = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError("");
    void getDashboardStaffServicesRevenueReport(token, query)
      .then(setReport)
      .catch((e) => setError(formatApiError(e)))
      .finally(() => setLoading(false));
  }, [token, query]);

  useEffect(() => {
    if (!token || !dateFrom || !dateTo) return;
    if (!branchId && canAccessMultipleBranches) return;
    loadReport();
  }, [token, dateFrom, dateTo, branchId, canAccessMultipleBranches, loadReport]);

  const onPreset = (next: string) => {
    setPreset(next);
    if (next !== "custom") {
      const range = rangeByPreset(next);
      setDateFrom(range.dateFrom);
      setDateTo(range.dateTo);
    }
  };

  const downloadCsv = async () => {
    if (!token) return;
    try {
      setExporting(true);
      const blob = await exportDashboardStaffServicesRevenueReport(token, query);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `staff-services-revenue-${dateFrom}-${dateTo}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setExporting(false);
    }
  };

  const revenueChartRows =
    report?.charts.revenueByStaff.map((r) => ({
      staffName: r.staffName,
      revenue: r.revenue,
    })) ?? [];

  const countChartRows =
    report?.charts.servicesCountByStaff.map((r) => ({
      staffName: r.staffName,
      count: r.count,
    })) ?? [];

  return (
    <PermissionGuard permission="reports.view">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Staff Services & Revenue</h1>
              <p className="mt-2 text-sm text-[#7A6A58]">
                Track services completed by each staff member and the revenue generated.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadReport}
                className="rounded-md bg-[#1F6B57] px-3 py-2 text-sm font-semibold text-white"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void downloadCsv()}
                disabled={exporting}
                className="rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-[#1F2420] disabled:opacity-60"
              >
                Export CSV
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-5">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date range</span>
              <select
                value={preset}
                onChange={(e) => onPreset(e.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="thisWeek">This week</option>
                <option value="thisMonth">This month</option>
                <option value="lastMonth">Last month</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPreset("custom");
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">To</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPreset("custom");
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Branch</span>
              <select
                value={branchId}
                disabled={!canAccessMultipleBranches}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
              >
                <option value="">All accessible branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Staff</span>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="">All staff</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Service</span>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="">All services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {categories.length > 0 ? (
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Category</span>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-md border border-border bg-white px-3 py-2"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Source</span>
              <select
                value={source}
                onChange={(e) =>
                  setSource(e.target.value as StaffServicesRevenueQuery["source"])
                }
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="all">All</option>
                <option value="booking">Bookings</option>
                <option value="walkin">Walk-ins</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Payment status</span>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="">All</option>
                <option value="PAID">Paid</option>
                <option value="PARTIALLY_PAID">Partially paid</option>
                <option value="UNPAID">Unpaid</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Invoice status</span>
              <select
                value={invoiceStatus}
                onChange={(e) => setInvoiceStatus(e.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="">All (excl. cancelled)</option>
                <option value="FINALIZED">Finalized</option>
                <option value="CANCELLED">Cancelled only</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-[#7A6A58]">
            Dates use {CAIRO_TZ}. Only completed service lines with assigned staff are included.
          </p>
        </section>

        {loading ? <SummarySkeleton /> : null}
        {error ? (
          <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-4 text-sm text-danger">
            {error}
          </section>
        ) : null}

        {!loading && !error && report ? (
          <>
            {!report.hasData ? (
              <section className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
                <h2 className="text-lg font-semibold text-[#1F2420]">No completed services yet</h2>
                <p className="mt-2 text-sm text-[#7A6A58]">
                  Adjust the date range or filters, or complete services in the queue or bookings flow
                  with staff assigned on each line.
                </p>
              </section>
            ) : null}

            <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
              {[
                {
                  title: "Total services done",
                  value: String(report.summary.totalServicesDone),
                },
                { title: "Total revenue", value: egp(report.summary.totalRevenue) },
                { title: "Paid revenue", value: egp(report.summary.paidRevenue) },
                { title: "Pending revenue", value: egp(report.summary.pendingRevenue) },
                {
                  title: "Avg. revenue / service",
                  value: egp(report.summary.averageRevenuePerService),
                },
                {
                  title: "Top staff (revenue)",
                  value: report.summary.topStaffByRevenue?.staffName ?? "—",
                  sub: report.summary.topStaffByRevenue
                    ? egp(report.summary.topStaffByRevenue.totalRevenue)
                    : undefined,
                },
                {
                  title: "Top staff (services)",
                  value: report.summary.topStaffByServiceCount?.staffName ?? "—",
                  sub: report.summary.topStaffByServiceCount
                    ? `${report.summary.topStaffByServiceCount.servicesDone} services`
                    : undefined,
                },
              ].map((card) => (
                <article
                  key={card.title}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <p className="text-xs uppercase tracking-wide text-[#7A6A58]">{card.title}</p>
                  <p className="mt-2 text-xl font-semibold text-[#1F2420]">{card.value}</p>
                  {card.sub ? (
                    <p className="mt-1 text-xs text-[#7A6A58]">{card.sub}</p>
                  ) : null}
                </article>
              ))}
            </section>

            {report.excludedCancelled.servicesDone > 0 ? (
              <p className="text-xs text-[#7A6A58]">
                Excluded cancelled invoices: {report.excludedCancelled.servicesDone} services (
                {egp(report.excludedCancelled.totalRevenue)} gross).
              </p>
            ) : null}

            <section className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-[#1F2420]">Revenue by staff</h2>
                <div className="mt-4">
                  <BarChart
                    rows={revenueChartRows}
                    valueKey="revenue"
                    labelKey="staffName"
                    formatValue={(v) => egp(v)}
                  />
                </div>
              </article>
              <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-[#1F2420]">Services count by staff</h2>
                <div className="mt-4">
                  <BarChart rows={countChartRows} valueKey="count" labelKey="staffName" />
                </div>
              </article>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[#1F2420]">Revenue trend by day</h2>
              <div className="mt-4">
                <BarChart
                  rows={report.charts.revenueTrendByDay.map((p) => ({
                    date: p.date,
                    revenue: p.revenue,
                  }))}
                  valueKey="revenue"
                  labelKey="date"
                  formatValue={(v) => egp(v)}
                />
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[#1F2420]">Staff table</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[#7A6A58]">
                      <th className="py-2">Staff</th>
                      <th>Services</th>
                      <th>Total</th>
                      <th>Paid</th>
                      <th>Pending</th>
                      <th>Avg</th>
                      <th>Top service</th>
                      <th>Bookings</th>
                      <th>Walk-ins</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {report.staffRows.map((row) => (
                      <tr key={row.staffId} className="border-t border-border">
                        <td className="py-2 font-medium text-[#1F2420]">{row.staffName}</td>
                        <td className="py-2">{row.servicesDone}</td>
                        <td className="py-2">{egp(row.totalRevenue)}</td>
                        <td className="py-2">{egp(row.paidRevenue)}</td>
                        <td className="py-2">{egp(row.pendingRevenue)}</td>
                        <td className="py-2">{egp(row.averageServiceValue)}</td>
                        <td className="py-2">{row.topServiceName ?? "—"}</td>
                        <td className="py-2">{row.bookingsCount}</td>
                        <td className="py-2">{row.walkinsCount}</td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => setDetailStaff(row)}
                            className="text-xs font-semibold text-[#1F6B57]"
                          >
                            View details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}

        <StaffDetailDrawer
          open={detailStaff !== null}
          staffRow={detailStaff}
          query={query}
          token={token}
          onClose={() => setDetailStaff(null)}
        />
      </section>
    </PermissionGuard>
  );
}
