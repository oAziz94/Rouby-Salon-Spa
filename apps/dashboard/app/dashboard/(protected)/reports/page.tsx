"use client";

import {
  ApiClientError,
  getDashboardBranches,
  getDashboardReportsBookings,
  getDashboardReportsClients,
  getDashboardReportsFinancial,
  getDashboardReportsOperations,
  getDashboardReportsOverview,
  getDashboardReportsPayments,
  getDashboardReportsServices,
  type DashboardBranch,
  type DashboardReportSectionResponse,
  type DashboardReportsOverviewResponse,
} from "@rouby/api-client";
import { useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type ReportState = "loading" | "loaded" | "empty" | "error";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

function toDateInput(value: Date): string {
  const y = value.getFullYear();
  const m = `${value.getMonth() + 1}`.padStart(2, "0");
  const d = `${value.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatEGP(value: unknown): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return `EGP ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function metricEntries(section: Record<string, unknown>) {
  return Object.entries(section).filter(([key, value]) => {
    if (["range", "branchId", "currency"].includes(key)) return false;
    return (
      typeof value === "number" ||
      typeof value === "string" ||
      typeof value === "boolean"
    );
  });
}

function ReportCard({
  title,
  state,
  error,
  data,
  sensitive,
}: {
  title: string;
  state: ReportState;
  error: string;
  data: Record<string, unknown> | null;
  sensitive?: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#1F2420]">{title}</h2>
        {sensitive ? (
          <span className="rounded-full bg-[#F3EBDD] px-2 py-1 text-xs font-medium text-[#7A6A58]">
            Financial permission required
          </span>
        ) : null}
      </div>
      {state === "loading" ? <p className="text-sm text-[#7A6A58]">Loading section...</p> : null}
      {state === "error" ? (
        <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {state === "empty" ? (
        <p className="rounded border border-border bg-[#FFFDF9] px-3 py-2 text-sm text-[#7A6A58]">
          No data available for current filters.
        </p>
      ) : null}
      {state === "loaded" && data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metricEntries(data).map(([key, value]) => {
            const egp = formatEGP(value);
            return (
              <article
                key={key}
                className="rounded-lg border border-border bg-[#FFFDF9] p-3 font-variant-numeric-tabular"
              >
                <p className="text-xs uppercase tracking-wide text-[#7A6A58]">{key}</p>
                <p className="mt-1 text-sm font-semibold text-[#1F2420]">
                  {egp ?? String(value)}
                </p>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export default function DashboardReportsPage() {
  const { token, user, hasPermission } = useDashboardAuth();
  const canReadBranches = hasPermission("branches.read");
  const canViewFinancial = hasPermission("reports.view_financial");
  const canAccessMultipleBranches = useMemo(
    () => user?.branchId === null && canReadBranches,
    [canReadBranches, user?.branchId],
  );

  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [overview, setOverview] = useState<DashboardReportsOverviewResponse | null>(null);
  const [operations, setOperations] = useState<DashboardReportSectionResponse | null>(null);
  const [bookings, setBookings] = useState<DashboardReportSectionResponse | null>(null);
  const [services, setServices] = useState<DashboardReportSectionResponse | null>(null);
  const [clients, setClients] = useState<DashboardReportSectionResponse | null>(null);
  const [financial, setFinancial] = useState<DashboardReportSectionResponse | null>(null);
  const [payments, setPayments] = useState<DashboardReportSectionResponse | null>(null);

  const [overviewState, setOverviewState] = useState<ReportState>("loading");
  const [operationsState, setOperationsState] = useState<ReportState>("loading");
  const [bookingsState, setBookingsState] = useState<ReportState>("loading");
  const [servicesState, setServicesState] = useState<ReportState>("loading");
  const [clientsState, setClientsState] = useState<ReportState>("loading");
  const [financialState, setFinancialState] = useState<ReportState>("loading");
  const [paymentsState, setPaymentsState] = useState<ReportState>("loading");

  const [overviewError, setOverviewError] = useState("");
  const [operationsError, setOperationsError] = useState("");
  const [bookingsError, setBookingsError] = useState("");
  const [servicesError, setServicesError] = useState("");
  const [clientsError, setClientsError] = useState("");
  const [financialError, setFinancialError] = useState("");
  const [paymentsError, setPaymentsError] = useState("");

  useEffect(() => {
    if (!token || !canReadBranches) return;
    getDashboardBranches(token)
      .then((result) => {
        setBranches(result);
        if (!branchId) {
          setBranchId(user?.branchId ?? result[0]?.id ?? "");
        }
      })
      .catch(() => {
        if (user?.branchId) {
          setBranchId(user.branchId);
        }
      });
  }, [branchId, canReadBranches, token, user?.branchId]);

  useEffect(() => {
    const today = toDateInput(new Date());
    setDateFrom(today);
    setDateTo(today);
  }, []);

  useEffect(() => {
    if (!token) return;
    if (!branchId && canAccessMultipleBranches) return;
    if (!dateFrom || !dateTo) return;

    const query = {
      branchId: branchId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    };

    setOverviewState("loading");
    setOperationsState("loading");
    setBookingsState("loading");
    setServicesState("loading");
    setClientsState("loading");
    if (canViewFinancial) {
      setFinancialState("loading");
      setPaymentsState("loading");
    }

    void getDashboardReportsOverview(token, query)
      .then((res) => {
        setOverview(res);
        setOverviewState(metricEntries(res).length ? "loaded" : "empty");
      })
      .catch((error) => {
        setOverviewError(formatApiError(error));
        setOverviewState("error");
      });

    void getDashboardReportsOperations(token, query)
      .then((res) => {
        setOperations(res);
        setOperationsState(metricEntries(res).length ? "loaded" : "empty");
      })
      .catch((error) => {
        setOperationsError(formatApiError(error));
        setOperationsState("error");
      });

    void getDashboardReportsBookings(token, query)
      .then((res) => {
        setBookings(res);
        setBookingsState(metricEntries(res).length ? "loaded" : "empty");
      })
      .catch((error) => {
        setBookingsError(formatApiError(error));
        setBookingsState("error");
      });

    void getDashboardReportsServices(token, query)
      .then((res) => {
        setServices(res);
        setServicesState(metricEntries(res).length ? "loaded" : "empty");
      })
      .catch((error) => {
        setServicesError(formatApiError(error));
        setServicesState("error");
      });

    void getDashboardReportsClients(token, query)
      .then((res) => {
        setClients(res);
        setClientsState(metricEntries(res).length ? "loaded" : "empty");
      })
      .catch((error) => {
        setClientsError(formatApiError(error));
        setClientsState("error");
      });

    if (canViewFinancial) {
      void getDashboardReportsFinancial(token, query)
        .then((res) => {
          setFinancial(res);
          setFinancialState(metricEntries(res).length ? "loaded" : "empty");
        })
        .catch((error) => {
          setFinancialError(formatApiError(error));
          setFinancialState("error");
        });

      void getDashboardReportsPayments(token, query)
        .then((res) => {
          setPayments(res);
          setPaymentsState(metricEntries(res).length ? "loaded" : "empty");
        })
        .catch((error) => {
          setPaymentsError(formatApiError(error));
          setPaymentsState("error");
        });
    } else {
      setFinancial(null);
      setPayments(null);
      setFinancialState("empty");
      setPaymentsState("empty");
    }
  }, [branchId, canAccessMultipleBranches, canViewFinancial, dateFrom, dateTo, token]);

  return (
    <PermissionGuard permission="reports.view">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-[#1F2420]">Reports</h1>
          <p className="mt-2 text-sm text-[#7A6A58]">
            Operational and financial reporting with date filters and branch scope.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date from</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Branch</span>
              <select
                value={branchId}
                disabled={!canAccessMultipleBranches}
                onChange={(event) => setBranchId(event.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <ReportCard
          title="Overview"
          state={overviewState}
          error={overviewError}
          data={overview}
        />
        <ReportCard
          title="Operations"
          state={operationsState}
          error={operationsError}
          data={operations}
        />
        <ReportCard
          title="Bookings"
          state={bookingsState}
          error={bookingsError}
          data={bookings}
        />
        <ReportCard
          title="Services"
          state={servicesState}
          error={servicesError}
          data={services}
        />
        <ReportCard
          title="Clients"
          state={clientsState}
          error={clientsError}
          data={clients}
        />

        {canViewFinancial ? (
          <>
            <ReportCard
              title="Financial"
              state={financialState}
              error={financialError}
              data={financial}
              sensitive
            />
            <ReportCard
              title="Payments"
              state={paymentsState}
              error={paymentsError}
              data={payments}
              sensitive
            />
          </>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
