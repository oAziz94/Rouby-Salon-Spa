"use client";

import {
  ApiClientError,
  getDashboardNotificationLogById,
  getDashboardNotificationLogs,
  listDashboardBranches,
  retryDashboardNotification,
  type DashboardNotificationLogDetail,
  type DashboardNotificationLogItem,
  type DashboardNotificationLogsQuery,
  type DashboardNotificationStatus,
  type DashboardNotificationType,
} from "@rouby/api-client";
import { formatDateTimeAmPm } from "@rouby/wall-clock";
import {
  AlertTriangle,
  Bell,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "ready" | "empty" | "error";

type Filters = {
  search: string;
  status: "" | DashboardNotificationStatus;
  type: "" | DashboardNotificationType;
  branchId: string;
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

function statusBadgeClass(status: DashboardNotificationStatus): string {
  if (status === "SENT") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "FAILED") return "border-red-200 bg-red-50 text-red-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function typeLabel(type: DashboardNotificationType): string {
  const labels: Record<DashboardNotificationType, string> = {
    BOOKING_CONFIRMATION: "Confirmation",
    APPOINTMENT_REMINDER: "Reminder (24h)",
    APPOINTMENT_REMINDER_90M: "Reminder (90m)",
    BOOKING_CANCELLATION: "Cancellation",
    CHANGE_REQUEST_UPDATE: "Change request",
  };
  return labels[type] ?? type;
}

export default function DashboardNotificationLogsPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canRetry = hasPermission("notifications.retry");

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardNotificationLogItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>(
    [],
  );

  const defaultDateFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return toDateInput(d);
  }, []);
  const defaultDateTo = useMemo(() => toDateInput(new Date()), []);

  const defaultFilters = useMemo<Filters>(
    () => ({
      search: "",
      status: "",
      type: "",
      branchId: "",
      dateFrom: defaultDateFrom,
      dateTo: defaultDateTo,
    }),
    [defaultDateFrom, defaultDateTo],
  );
  const [draftFilters, setDraftFilters] = useState<Filters>(defaultFilters);
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [detail, setDetail] = useState<DashboardNotificationLogDetail | null>(
    null,
  );
  const [detailError, setDetailError] = useState("");
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const query = useMemo<DashboardNotificationLogsQuery>(
    () => ({
      search: filters.search || undefined,
      status: filters.status || undefined,
      type: filters.type || undefined,
      branchId: filters.branchId || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      page,
      pageSize: 20,
    }),
    [filters, page],
  );

  const loadList = useCallback(async () => {
    if (!token) return;
    setState("loading");
    setError("");
    try {
      const res = await getDashboardNotificationLogs(token, query);
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
    void listDashboardBranches(token)
      .then((list) => setBranches(list.map((b) => ({ id: b.id, name: b.name }))))
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!token || !detailId) return;
    setDetailState("loading");
    setDetailError("");
    void getDashboardNotificationLogById(token, detailId)
      .then((res) => {
        setDetail(res);
        setDetailState("ready");
      })
      .catch((requestError) => {
        setDetailError(formatApiError(requestError));
        setDetailState("error");
      });
  }, [detailId, token]);

  const applyFilters = () => {
    setFilters(draftFilters);
    setPage(1);
  };

  const resetFilters = () => {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
    setPage(1);
  };

  const handleRetry = async (id: string) => {
    if (!token || !canRetry) return;
    setRetryingId(id);
    try {
      const res = await retryDashboardNotification(token, id);
      setDetailId(res.attempt.id);
      setDetail(res.attempt);
      setDetailState("ready");
      await loadList();
    } catch (requestError) {
      setDetailError(formatApiError(requestError));
      setDetailState("error");
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <PermissionGuard permission="notifications.read">
      <section className="space-y-6">
        <header className="rounded-2xl border border-[#E9D8B6] bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold text-[#1F2420]">
                <Bell className="h-6 w-6 text-[#B8860B]" />
                Notification Logs
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[#7A6A58]">
                Monitor transactional WhatsApp messages sent through WAPilot.
                Failed deliveries can be retried when you have permission.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadList()}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm text-[#1F2420] hover:bg-[#FFF9EE]"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="xl:col-span-2">
              <span className="mb-1 block text-xs font-medium text-[#7A6A58]">
                Search
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#9A8B78]" />
                <input
                  value={draftFilters.search}
                  onChange={(e) =>
                    setDraftFilters((f) => ({ ...f, search: e.target.value }))
                  }
                  placeholder="Phone, client, RB-…"
                  className="w-full rounded-lg border border-border py-2 pl-9 pr-3 text-sm"
                />
              </div>
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-[#7A6A58]">
                Status
              </span>
              <select
                value={draftFilters.status}
                onChange={(e) =>
                  setDraftFilters((f) => ({
                    ...f,
                    status: e.target.value as Filters["status"],
                  }))
                }
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              >
                <option value="">All</option>
                <option value="SENT">Sent</option>
                <option value="FAILED">Failed</option>
                <option value="PENDING">Pending</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-[#7A6A58]">
                Type
              </span>
              <select
                value={draftFilters.type}
                onChange={(e) =>
                  setDraftFilters((f) => ({
                    ...f,
                    type: e.target.value as Filters["type"],
                  }))
                }
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              >
                <option value="">All</option>
                <option value="BOOKING_CONFIRMATION">Confirmation</option>
                <option value="APPOINTMENT_REMINDER">Reminder (24h)</option>
                <option value="APPOINTMENT_REMINDER_90M">Reminder (90m)</option>
                <option value="BOOKING_CANCELLATION">Cancellation</option>
                <option value="CHANGE_REQUEST_UPDATE">Change request</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-[#7A6A58]">
                Branch
              </span>
              <select
                value={draftFilters.branchId}
                onChange={(e) =>
                  setDraftFilters((f) => ({ ...f, branchId: e.target.value }))
                }
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-[#7A6A58]">
                From
              </span>
              <input
                type="date"
                value={draftFilters.dateFrom}
                onChange={(e) =>
                  setDraftFilters((f) => ({ ...f, dateFrom: e.target.value }))
                }
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-[#7A6A58]">
                To
              </span>
              <input
                type="date"
                value={draftFilters.dateTo}
                onChange={(e) =>
                  setDraftFilters((f) => ({ ...f, dateTo: e.target.value }))
                }
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyFilters}
              className="rounded-lg bg-[#1F2420] px-4 py-2 text-sm font-medium text-white hover:bg-[#2C332E]"
            >
              Apply filters
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-border px-4 py-2 text-sm text-[#1F2420] hover:bg-[#FFF9EE]"
            >
              Reset
            </button>
          </div>
        </section>

        {state === "error" ? (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {state === "loading" ? (
            <div className="flex items-center justify-center gap-2 p-12 text-sm text-[#7A6A58]">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading notification logs…
            </div>
          ) : state === "empty" ? (
            <div className="p-12 text-center">
              <Bell className="mx-auto h-10 w-10 text-[#C4B59A]" />
              <p className="mt-4 text-sm font-medium text-[#1F2420]">
                No notification logs yet
              </p>
              <p className="mt-2 text-sm text-[#7A6A58]">
                Entries appear when bookings are confirmed, reminders fire, or
                other WhatsApp notifications are sent with NOTIFICATIONS_ENABLED.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-[#FFF9EE] text-xs uppercase tracking-wide text-[#7A6A58]">
                  <tr>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Appointment</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Sent</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-b border-border/70 ${
                        row.status === "FAILED" ? "bg-red-50/40" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(row.status)}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border border-[#E9D8B6] bg-[#FFF8EA] px-2.5 py-0.5 text-xs font-medium text-[#6B4B00]">
                          {typeLabel(row.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#1F2420]">
                        {row.recipientPhone}
                      </td>
                      <td className="px-4 py-3">{row.clientName ?? "—"}</td>
                      <td className="px-4 py-3 text-[#7A6A58]">
                        {row.bookingDateLabel && row.bookingTimeLabel
                          ? `${row.bookingDateLabel} · ${row.bookingTimeLabel}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">{row.branchName ?? "—"}</td>
                      <td className="px-4 py-3 text-[#7A6A58]">
                        {formatDateTimeAmPm(row.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-[#7A6A58]">
                        {row.sentAt ? formatDateTimeAmPm(row.sentAt) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailId(row.id)}
                            className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-[#FFF9EE]"
                          >
                            View
                          </button>
                          {row.canRetry && canRetry ? (
                            <button
                              type="button"
                              disabled={retryingId === row.id}
                              onClick={() => void handleRetry(row.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-900 hover:bg-red-100 disabled:opacity-60"
                            >
                              {retryingId === row.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              Retry
                            </button>
                          ) : null}
                          {row.bookingId ? (
                            <Link
                              href={`/dashboard/bookings?bookingId=${row.bookingId}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-[#FFF9EE]"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Booking
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {state === "ready" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-[#7A6A58]">
              <p>
                {totalItems} log{totalItems === 1 ? "" : "s"} · page {page}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {detailId ? (
          <div
            className="fixed inset-0 z-50 flex justify-end bg-black/30"
            role="presentation"
            onClick={() => setDetailId(null)}
          >
            <aside
              className="h-full w-full max-w-lg overflow-y-auto bg-card shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="text-lg font-semibold text-[#1F2420]">
                  Notification detail
                </h2>
                <button
                  type="button"
                  onClick={() => setDetailId(null)}
                  className="rounded-lg p-1 hover:bg-[#FFF9EE]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {detailState === "loading" ? (
                <div className="flex items-center justify-center gap-2 p-12 text-sm text-[#7A6A58]">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading…
                </div>
              ) : detailState === "error" ? (
                <p className="p-6 text-sm text-red-800">{detailError}</p>
              ) : detail ? (
                <div className="space-y-6 p-6 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(detail.status)}`}
                    >
                      {detail.status}
                    </span>
                    <span className="inline-flex rounded-full border border-[#E9D8B6] bg-[#FFF8EA] px-2.5 py-0.5 text-xs font-medium text-[#6B4B00]">
                      {typeLabel(detail.type)}
                    </span>
                  </div>
                  <dl className="grid gap-3">
                    <div>
                      <dt className="text-xs text-[#7A6A58]">Recipient</dt>
                      <dd className="font-mono">{detail.recipientPhone}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#7A6A58]">Provider</dt>
                      <dd>{detail.provider}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#7A6A58]">Created</dt>
                      <dd>{formatDateTimeAmPm(detail.createdAt)}</dd>
                    </div>
                    {detail.sentAt ? (
                      <div>
                        <dt className="text-xs text-[#7A6A58]">Sent</dt>
                        <dd>{formatDateTimeAmPm(detail.sentAt)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {detail.client ? (
                    <section className="rounded-xl border border-border p-4">
                      <h3 className="font-medium text-[#1F2420]">Client</h3>
                      <p className="mt-2">{detail.client.fullName}</p>
                      <p className="text-[#7A6A58]">{detail.client.phone}</p>
                    </section>
                  ) : null}
                  {detail.booking ? (
                    <section className="rounded-xl border border-border p-4">
                      <h3 className="font-medium text-[#1F2420]">Booking</h3>
                      <p className="mt-2 font-medium">{detail.booking.reference}</p>
                      <p className="text-[#7A6A58]">
                        {detail.booking.dateLabel} · {detail.booking.timeLabel}
                      </p>
                      <p className="mt-2 text-[#7A6A58]">{detail.booking.services}</p>
                      {detail.bookingId ? (
                        <Link
                          href={`/dashboard/bookings?bookingId=${detail.bookingId}`}
                          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#B8860B] hover:underline"
                        >
                          Open booking
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      ) : null}
                    </section>
                  ) : null}
                  {detail.errorMessage ? (
                    <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
                      <h3 className="font-medium">Error</h3>
                      <p className="mt-2 text-sm">{detail.errorMessage}</p>
                    </section>
                  ) : null}
                  {detail.canRetry && canRetry ? (
                    <button
                      type="button"
                      disabled={retryingId === detail.id}
                      onClick={() => void handleRetry(detail.id)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1F2420] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2C332E] disabled:opacity-60"
                    >
                      {retryingId === detail.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      Retry delivery
                    </button>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </div>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
