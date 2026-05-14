"use client";

import {
  ApiClientError,
  getDashboardAuditLogById,
  getDashboardAuditLogFacets,
  getDashboardAuditLogs,
  type DashboardAuditLogDetail,
  type DashboardAuditLogItem,
  type DashboardAuditLogSeverity,
  type DashboardAuditLogsQuery,
} from "@rouby/api-client";
import { formatDateTimeAmPm } from "@rouby/wall-clock";
import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "ready" | "empty" | "error";

type Filters = {
  search: string;
  module: string;
  action: string;
  entityType: string;
  userId: string;
  branchId: string;
  severity: "" | DashboardAuditLogSeverity;
  dateFrom: string;
  dateTo: string;
};

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shortRef(value?: string | null): string {
  if (!value) return "-";
  if (/^[0-9a-f-]{36}$/i.test(value)) {
    return `…${value.slice(-6).toUpperCase()}`;
  }
  return value;
}

function moduleLabel(value: string): string {
  const labels: Record<string, string> = {
    queue: "Queue",
    bookings: "Bookings",
    invoices: "Invoices",
    payments: "Payments",
    users: "Users",
    settings: "Settings",
    branches: "Branches",
    cashDrawer: "Cash Drawer",
    dailyClosing: "Daily Closing",
    catalog: "Catalog",
    clients: "Clients",
  };
  return labels[value] ?? value;
}

function severityBadgeClass(severity: DashboardAuditLogSeverity): string {
  if (severity === "CRITICAL") return "border-red-200 bg-red-50 text-red-900";
  if (severity === "WARNING")
    return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function serializeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export default function DashboardAuditLogsPage() {
  const { token } = useDashboardAuth();
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardAuditLogItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [facets, setFacets] = useState<{
    modules: string[];
    actions: string[];
    users: Array<{ id: string; name: string; email: string }>;
    branches: Array<{ id: string; name: string }>;
    severities: DashboardAuditLogSeverity[];
  }>({
    modules: [],
    actions: [],
    users: [],
    branches: [],
    severities: ["INFO", "WARNING", "CRITICAL"],
  });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [detail, setDetail] = useState<DashboardAuditLogDetail | null>(null);
  const [detailError, setDetailError] = useState("");

  const defaultDateFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return toDateInput(d);
  }, []);
  const defaultDateTo = useMemo(() => toDateInput(new Date()), []);

  const defaultFilters = useMemo<Filters>(
    () => ({
      search: "",
      module: "",
      action: "",
      entityType: "",
      userId: "",
      branchId: "",
      severity: "",
      dateFrom: defaultDateFrom,
      dateTo: defaultDateTo,
    }),
    [defaultDateFrom, defaultDateTo],
  );
  const [draftFilters, setDraftFilters] = useState<Filters>(defaultFilters);
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const query = useMemo<DashboardAuditLogsQuery>(
    () => ({
      search: filters.search || undefined,
      module: filters.module || undefined,
      action: filters.action || undefined,
      entityType: filters.entityType || undefined,
      userId: filters.userId || undefined,
      branchId: filters.branchId || undefined,
      severity: filters.severity || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      page,
      limit: 20,
    }),
    [filters, page],
  );

  const summary = useMemo(() => {
    const today = toDateInput(new Date());
    const todayEvents = rows.filter(
      (r) => r.createdAt.slice(0, 10) === today,
    ).length;
    const sensitiveEvents = rows.filter((r) =>
      ["WARNING", "CRITICAL"].includes(r.severity),
    ).length;
    const financialEvents = rows.filter((r) =>
      ["invoices", "payments", "cashDrawer", "dailyClosing"].includes(r.module),
    ).length;
    const adminEvents = rows.filter((r) =>
      ["users", "settings", "branches", "roles"].includes(r.module),
    ).length;
    return { todayEvents, sensitiveEvents, financialEvents, adminEvents };
  }, [rows]);

  const loadList = useCallback(async () => {
    if (!token) return;
    setState("loading");
    setError("");
    try {
      const res = await getDashboardAuditLogs(token, query);
      setRows(res.data);
      setTotalItems(res.meta.totalItems);
      setHasNextPage(res.meta.hasNextPage);
      setState(res.data.length ? "ready" : "empty");
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }, [query, token]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!token) return;
    void getDashboardAuditLogFacets(token)
      .then(setFacets)
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!token || !detailId) return;
    setDetailState("loading");
    setDetailError("");
    void getDashboardAuditLogById(token, detailId)
      .then((res) => {
        setDetail(res);
        setDetailState("ready");
      })
      .catch((requestError) => {
        setDetailError(formatApiError(requestError));
        setDetailState("error");
      });
  }, [detailId, token]);

  const activeChips = useMemo(() => {
    const chips: Array<{ key: keyof Filters; label: string }> = [];
    if (filters.search)
      chips.push({ key: "search", label: `Search: ${filters.search}` });
    if (filters.module)
      chips.push({
        key: "module",
        label: `Module: ${moduleLabel(filters.module)}`,
      });
    if (filters.action)
      chips.push({ key: "action", label: `Action: ${filters.action}` });
    if (filters.userId) {
      const user = facets.users.find((u) => u.id === filters.userId);
      chips.push({
        key: "userId",
        label: `User: ${user?.name ?? shortRef(filters.userId)}`,
      });
    }
    if (filters.branchId) {
      const branch = facets.branches.find((b) => b.id === filters.branchId);
      chips.push({
        key: "branchId",
        label: `Branch: ${branch?.name ?? shortRef(filters.branchId)}`,
      });
    }
    if (filters.severity)
      chips.push({ key: "severity", label: `Severity: ${filters.severity}` });
    if (filters.dateFrom)
      chips.push({ key: "dateFrom", label: `From: ${filters.dateFrom}` });
    if (filters.dateTo)
      chips.push({ key: "dateTo", label: `To: ${filters.dateTo}` });
    return chips;
  }, [facets.branches, facets.users, filters]);

  const exportCsv = useCallback(() => {
    const header = [
      "createdAt",
      "severity",
      "module",
      "action",
      "summary",
      "actorName",
      "actorEmail",
      "branchName",
      "entityType",
      "entityLabel",
    ];
    const lines = rows.map((row) =>
      [
        row.createdAt,
        row.severity,
        row.module,
        row.action,
        row.summary,
        row.actor.name,
        row.actor.email ?? "",
        row.branch?.name ?? "",
        row.entityType ?? "",
        row.entityLabel ?? "",
      ]
        .map((cell) => serializeCsvCell(String(cell ?? "")))
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${toDateInput(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows]);

  return (
    <PermissionGuard permission="audit.read">
      <section className="space-y-6">
        <header className="rounded-2xl border border-[#E9D8B6] bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">
                Audit Logs
              </h1>
              <p className="mt-2 text-sm text-[#7A6A58]">
                Review system activity, financial changes, user actions, and
                sensitive admin events.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadList()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm text-[#1F2420] hover:bg-[#FFF9EE]"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button
                type="button"
                onClick={exportCsv}
                className="rounded-lg border border-[#D4AF37]/50 bg-[#FFF4D6] px-3 py-2 text-sm font-medium text-[#6B4B00] hover:bg-[#FDEAB3]"
              >
                Export CSV
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs text-[#7A6A58]">Total events</p>
            <p className="mt-2 text-2xl font-semibold text-[#1F2420]">
              {totalItems}
            </p>
          </article>
          <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs text-[#7A6A58]">Today&apos;s events</p>
            <p className="mt-2 text-2xl font-semibold text-[#1F2420]">
              {summary.todayEvents}
            </p>
          </article>
          <article className="rounded-xl border border-[#F8D7A0] bg-[#FFF8EA] p-4 shadow-sm">
            <p className="text-xs text-[#7A6A58]">Sensitive events</p>
            <p className="mt-2 text-2xl font-semibold text-[#7A4A00]">
              {summary.sensitiveEvents}
            </p>
          </article>
          <article className="rounded-xl border border-[#D8E6DE] bg-[#F1F8F4] p-4 shadow-sm">
            <p className="text-xs text-[#7A6A58]">Financial events</p>
            <p className="mt-2 text-2xl font-semibold text-[#174634]">
              {summary.financialEvents}
            </p>
          </article>
          <article className="rounded-xl border border-[#E5DDEB] bg-[#F8F3FD] p-4 shadow-sm">
            <p className="text-xs text-[#7A6A58]">User/admin changes</p>
            <p className="mt-2 text-2xl font-semibold text-[#523176]">
              {summary.adminEvents}
            </p>
          </article>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <form
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setFilters(draftFilters);
            }}
          >
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Search
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#9A8B79]" />
                <input
                  value={draftFilters.search}
                  onChange={(event) =>
                    setDraftFilters((prev) => ({
                      ...prev,
                      search: event.target.value,
                    }))
                  }
                  placeholder="Action, summary, actor, reference"
                  className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3"
                />
              </div>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Module
              </span>
              <select
                value={draftFilters.module}
                onChange={(event) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    module: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-border bg-white px-3 py-2"
              >
                <option value="">All modules</option>
                {facets.modules.map((value) => (
                  <option key={value} value={value}>
                    {moduleLabel(value)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Action
              </span>
              <select
                value={draftFilters.action}
                onChange={(event) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    action: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-border bg-white px-3 py-2"
              >
                <option value="">All actions</option>
                {facets.actions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                User
              </span>
              <select
                value={draftFilters.userId}
                onChange={(event) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    userId: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-border bg-white px-3 py-2"
              >
                <option value="">All users</option>
                {facets.users.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Branch
              </span>
              <select
                value={draftFilters.branchId}
                onChange={(event) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    branchId: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-border bg-white px-3 py-2"
              >
                <option value="">All branches</option>
                {facets.branches.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Severity
              </span>
              <select
                value={draftFilters.severity}
                onChange={(event) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    severity: event.target.value as Filters["severity"],
                  }))
                }
                className="w-full rounded-lg border border-border bg-white px-3 py-2"
              >
                <option value="">All severities</option>
                {facets.severities.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Date from
              </span>
              <input
                type="date"
                value={draftFilters.dateFrom}
                onChange={(event) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    dateFrom: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-border bg-white px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Date to
              </span>
              <input
                type="date"
                min={draftFilters.dateFrom || undefined}
                value={draftFilters.dateTo}
                onChange={(event) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    dateTo: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-border bg-white px-3 py-2"
              />
            </label>

            <div className="flex items-end justify-end gap-2 xl:col-span-4">
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  setDraftFilters(defaultFilters);
                  setFilters(defaultFilters);
                }}
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-[#1F2420] hover:bg-[#FFF9EE]"
              >
                Clear filters
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#17352B] px-4 py-2 text-sm font-medium text-white hover:bg-[#122A22]"
              >
                Apply
              </button>
            </div>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {activeChips.map((chip) => (
              <span
                key={chip.label}
                className="inline-flex items-center gap-1 rounded-full border border-[#EADAC4] bg-[#FFF8EA] px-2.5 py-1 text-xs text-[#7A6A58]"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={() => {
                    setPage(1);
                    setFilters((prev) => ({ ...prev, [chip.key]: "" }));
                    setDraftFilters((prev) => ({ ...prev, [chip.key]: "" }));
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </section>

        {state === "loading" ? (
          <section className="rounded-xl border border-border bg-card p-8 shadow-sm">
            <p className="inline-flex items-center gap-2 text-sm text-[#7A6A58]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading audit logs...
            </p>
          </section>
        ) : null}
        {state === "error" ? (
          <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-4 text-sm text-danger">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadList()}
              className="mt-2 rounded border border-[#E7B9A4] bg-white px-3 py-1.5 text-xs text-[#8A3D1E]"
            >
              Retry
            </button>
          </section>
        ) : null}
        {state === "empty" ? (
          <section className="rounded-xl border border-border bg-card p-6 text-sm text-[#7A6A58]">
            <h2 className="text-base font-semibold text-[#1F2420]">
              No matching audit logs
            </h2>
            <p className="mt-1">Try changing filters or clearing the search.</p>
          </section>
        ) : null}

        {state === "ready" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Event</th>
                    <th className="py-2 pr-3 font-medium">Actor</th>
                    <th className="py-2 pr-3 font-medium">Module / Entity</th>
                    <th className="py-2 pr-3 font-medium">Branch</th>
                    <th className="py-2 pr-3 font-medium">Time</th>
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/60 hover:bg-[#FFF9EE]"
                    >
                      <td className="py-3 pr-3">
                        <p className="font-medium text-[#1F2420]">
                          {row.action}
                        </p>
                        <p className="mt-0.5 text-xs text-[#7A6A58]">
                          {row.summary}
                        </p>
                        <span
                          className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] ${severityBadgeClass(row.severity)}`}
                        >
                          {row.severity}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        <p className="font-medium text-[#1F2420]">
                          {row.actor.name}
                        </p>
                        <p className="text-xs">{row.actor.email ?? "System"}</p>
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        <span className="rounded-full border border-[#D8E6DE] bg-[#F1F8F4] px-2 py-0.5 text-xs text-[#174634]">
                          {moduleLabel(row.module)}
                        </span>
                        <p className="mt-1 text-xs">{row.entityType ?? "-"}</p>
                        <p className="text-xs text-[#9A8B79]">
                          {row.entityLabel ?? shortRef(row.entityId)}
                        </p>
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {row.branch?.name ?? "All branches"}
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {formatDateTimeAmPm(row.createdAt)}
                      </td>
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() => {
                            setDetailId(row.id);
                            setDetail(null);
                          }}
                          className="rounded border border-border bg-white px-2 py-1 text-xs text-[#1F2420] hover:bg-[#FFF9EE]"
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded border border-border bg-white px-3 py-1 text-sm disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm text-[#7A6A58]">Page {page}</span>
              <button
                type="button"
                disabled={!hasNextPage}
                onClick={() => setPage((prev) => prev + 1)}
                className="rounded border border-border bg-white px-3 py-1 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </section>
        ) : null}

        {detailId ? (
          <div className="fixed inset-0 z-50 flex justify-end bg-[#2A1722]/35">
            <button
              aria-label="Close"
              className="h-full flex-1"
              onClick={() => {
                setDetailId(null);
                setDetailState("idle");
              }}
            />
            <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-[#FFFDF9] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-[#1F2420]">
                    Audit log details
                  </h2>
                  <p className="text-xs text-[#7A6A58]">
                    Read-only security event record
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-border bg-white p-2"
                  onClick={() => {
                    setDetailId(null);
                    setDetailState("idle");
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {detailState === "loading" ? (
                <p className="mt-4 inline-flex items-center gap-2 text-sm text-[#7A6A58]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading
                  details...
                </p>
              ) : null}
              {detailState === "error" ? (
                <p className="mt-4 rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                  {detailError}
                </p>
              ) : null}

              {detailState === "ready" && detail ? (
                <div className="mt-4 space-y-5">
                  <section className="rounded-xl border border-border bg-white p-4">
                    <p className="font-semibold text-[#1F2420]">
                      {detail.action}
                    </p>
                    <p className="mt-1 text-sm text-[#7A6A58]">
                      {detail.summary}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${severityBadgeClass(detail.severity)}`}
                      >
                        {detail.severity}
                      </span>
                      <span className="text-xs text-[#7A6A58]">
                        {formatDateTimeAmPm(detail.createdAt)}
                      </span>
                    </div>
                  </section>

                  <section className="rounded-xl border border-border bg-white p-4">
                    <h3 className="text-sm font-semibold text-[#1F2420]">
                      Actor
                    </h3>
                    <p className="mt-1 text-sm text-[#1F2420]">
                      {detail.actor.name}
                    </p>
                    <p className="text-xs text-[#7A6A58]">
                      {detail.actor.email ?? "System event"}
                    </p>
                    {detail.ipAddress ? (
                      <p className="mt-2 text-xs text-[#7A6A58]">
                        IP: {detail.ipAddress}
                      </p>
                    ) : null}
                  </section>

                  <section className="rounded-xl border border-border bg-white p-4">
                    <h3 className="text-sm font-semibold text-[#1F2420]">
                      Target
                    </h3>
                    <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                      <p className="text-[#7A6A58]">
                        Module:{" "}
                        <span className="text-[#1F2420]">
                          {moduleLabel(detail.module)}
                        </span>
                      </p>
                      <p className="text-[#7A6A58]">
                        Entity type:{" "}
                        <span className="text-[#1F2420]">
                          {detail.entityType ?? "-"}
                        </span>
                      </p>
                      <p className="text-[#7A6A58]">
                        Reference:{" "}
                        <span className="text-[#1F2420]">
                          {detail.entityLabel ?? shortRef(detail.entityId)}
                        </span>
                      </p>
                      <p className="text-[#7A6A58]">
                        Branch:{" "}
                        <span className="text-[#1F2420]">
                          {detail.branch?.name ?? "All branches"}
                        </span>
                      </p>
                    </div>
                  </section>

                  <section className="rounded-xl border border-border bg-white p-4">
                    <div className="flex items-center gap-2 text-[#7A4A00]">
                      <ShieldAlert className="h-4 w-4" />
                      <h3 className="text-sm font-semibold">
                        Changes (sensitive fields are masked)
                      </h3>
                    </div>
                    {detail.changes.length ? (
                      <div className="mt-3 space-y-2">
                        {detail.changes.map((change) => (
                          <article
                            key={change.field}
                            className="rounded-lg border border-[#EFE6D8] bg-[#FFFCF6] p-3"
                          >
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                              {change.field}
                            </p>
                            <p className="mt-1 text-xs text-[#7A6A58]">
                              Before:{" "}
                              <span className="text-[#1F2420]">
                                {JSON.stringify(change.before)}
                              </span>
                            </p>
                            <p className="mt-1 text-xs text-[#7A6A58]">
                              After:{" "}
                              <span className="text-[#1F2420]">
                                {JSON.stringify(change.after)}
                              </span>
                            </p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-[#7A6A58]">
                        No field-level diff available for this event.
                      </p>
                    )}
                  </section>

                  <details className="rounded-xl border border-border bg-white p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-[#1F2420]">
                      Advanced details
                    </summary>
                    <pre className="mt-3 overflow-x-auto rounded bg-[#F7F3EC] p-3 text-xs text-[#5E5447]">
                      {JSON.stringify(
                        {
                          previousValue: detail.previousValue,
                          newValue: detail.newValue,
                          metadata: detail.metadata,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>

                  <details className="rounded-xl border border-border bg-white p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-[#1F2420]">
                      Technical details
                    </summary>
                    <div className="mt-3 space-y-1 text-xs text-[#7A6A58]">
                      <p>
                        Audit log ID: {shortRef(detail.technical.auditLogId)}
                      </p>
                      <p>Entity ID: {shortRef(detail.technical.entityId)}</p>
                      <p>User ID: {shortRef(detail.technical.userId)}</p>
                      <p>Branch ID: {shortRef(detail.technical.branchId)}</p>
                    </div>
                  </details>
                </div>
              ) : null}
            </aside>
          </div>
        ) : null}

        <section className="rounded-xl border border-[#E9D8B6] bg-[#FFF8EA] p-4 text-xs text-[#7A6A58]">
          <p className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Audit logs are read-only and cannot be edited or deleted from the
            dashboard.
          </p>
        </section>
      </section>
    </PermissionGuard>
  );
}
