"use client";

import {
  ApiClientError,
  getDashboardBookingById,
  getDashboardBookingChangeRequestById,
  getDashboardBookingChangeRequests,
  postDashboardBookingChangeRequestAction,
  type DashboardBookingChangeRequestDetail,
  type DashboardBookingChangeRequestListItem,
} from "@rouby/api-client";
import { formatDateTimeAmPm, formatWallClockRange12h } from "@rouby/wall-clock";
import { useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type PageState = "loading" | "loaded" | "empty" | "error";

const REQUEST_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-[#FFF6E6] text-[#8B6A1D]",
  APPROVED: "bg-[#EAF7EE] text-[#1E6A3A]",
  REJECTED: "bg-[#FBECEA] text-[#8B4428]",
  CANCELLED: "bg-[#F3F0EF] text-[#6A615A]",
};

const REQUEST_TYPE_STYLES: Record<string, string> = {
  CANCEL: "bg-[#FCEEE8] text-[#8B4428]",
  RESCHEDULE: "bg-[#EAF1F8] text-[#2C567A]",
};

function statusBadge(status: string): string {
  return REQUEST_STATUS_STYLES[status] ?? "bg-[#F3EBDD] text-[#4A3C2F]";
}

function typeBadge(type: string): string {
  return REQUEST_TYPE_STYLES[type] ?? "bg-[#F3EBDD] text-[#4A3C2F]";
}

function toDateInput(value: Date): string {
  const y = value.getFullYear();
  const m = `${value.getMonth() + 1}`.padStart(2, "0");
  const d = `${value.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "BOOKING_SLOT_FULL") {
      return "Selected slot is full (BOOKING_SLOT_FULL).";
    }
    if (error.code === "SLOT_NOT_ONLINE") {
      return "Selected slot is not available online (SLOT_NOT_ONLINE).";
    }
    if (error.code === "CANCEL_WINDOW_EXPIRED") {
      return "Cancellation window expired (CANCEL_WINDOW_EXPIRED).";
    }
    if (error.code === "INVALID_REQUEST_STATUS") {
      return "Invalid or duplicate request state.";
    }
    if (error.statusCode === 403) {
      return "You do not have permission for this action (403).";
    }
    if (error.statusCode === 401) {
      return "Session expired (401). Please sign in again.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected API error.";
}

export default function BookingChangeRequestsPage() {
  const { token, hasPermission } = useDashboardAuth();
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardBookingChangeRequestListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [requestTypeFilter, setRequestTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detail, setDetail] = useState<DashboardBookingChangeRequestDetail | null>(null);
  const [bookingDetailNote, setBookingDetailNote] = useState("");
  const [actionLoading, setActionLoading] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [actionError, setActionError] = useState("");

  const canRead = hasPermission("bookings.read");
  const canApproveCancel = hasPermission("bookings.cancel");
  const canApproveReschedule = hasPermission("bookings.reschedule");

  async function loadList() {
    if (!token || !canRead) {
      return;
    }
    if (!dateFrom || !dateTo) {
      return;
    }
    setState("loading");
    setError("");
    try {
      const response = await getDashboardBookingChangeRequests(token, {
        status: statusFilter || undefined,
        page,
        pageSize: 20,
      });
      let data = response.data;

      if (requestTypeFilter) {
        data = data.filter((row) => row.requestType === requestTypeFilter);
      }
      // API currently does not support date-range query for this endpoint.
      if (dateFrom || dateTo) {
        data = data.filter((row) => {
          const created = new Date(row.createdAt).getTime();
          const min = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
          const max = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : Infinity;
          return created >= min && created <= max;
        });
      }

      setRows(data);
      setState(data.length > 0 ? "loaded" : "empty");
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  async function loadDetail(requestId: string) {
    if (!token) {
      return;
    }
    setDetailLoading(true);
    setDetailError("");
    setActionError("");
    setBookingDetailNote("");
    try {
      const response = await getDashboardBookingChangeRequestById(token, requestId);
      setDetail(response);
      if (response.bookingId) {
        try {
          await getDashboardBookingById(token, response.bookingId);
        } catch {
          setBookingDetailNote(
            "Related booking detail endpoint unavailable for this request scope.",
          );
        }
      }
    } catch (requestError) {
      setDetailError(formatApiError(requestError));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    const today = toDateInput(new Date());
    setDateFrom(today);
    setDateTo(today);
  }, []);

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canRead, statusFilter, requestTypeFilter, dateFrom, dateTo, page]);

  const canApproveCurrent = useMemo(() => {
    if (!detail) {
      return false;
    }
    if (detail.requestType === "CANCEL") {
      return canApproveCancel;
    }
    if (detail.requestType === "RESCHEDULE") {
      return canApproveReschedule;
    }
    return false;
  }, [canApproveCancel, canApproveReschedule, detail]);

  async function triggerAction(action: "approve" | "reject" | "cancel") {
    if (!token || !selectedRequestId) {
      return;
    }
    setActionLoading(action);
    setActionError("");
    try {
      await postDashboardBookingChangeRequestAction(token, selectedRequestId, action);
      await Promise.all([loadList(), loadDetail(selectedRequestId)]);
    } catch (requestError) {
      setActionError(formatApiError(requestError));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <PermissionGuard permission="bookings.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-[#1F2420]">Booking Change Requests</h1>
          <p className="mt-2 text-sm text-[#7A6A58]">
            Review cancellation and reschedule requests from clients.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Request type</span>
              <select
                value={requestTypeFilter}
                onChange={(event) => {
                  setPage(1);
                  setRequestTypeFilter(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="">All types</option>
                <option value="CANCEL">CANCEL</option>
                <option value="RESCHEDULE">RESCHEDULE</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setPage(1);
                  setStatusFilter(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="">All statuses</option>
                {Object.keys(REQUEST_STATUS_STYLES).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date from</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => {
                  setPage(1);
                  setDateFrom(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => {
                  setPage(1);
                  setDateTo(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-[#7A6A58]">
            Date range is applied client-side because the endpoint currently supports status/branch/booking filters only.
          </p>
        </section>

        {state === "loading" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm text-sm text-[#7A6A58]">
            Loading change requests...
          </section>
        ) : null}
        {state === "error" ? (
          <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 shadow-sm text-sm text-danger">
            {error}
          </section>
        ) : null}
        {state === "empty" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm text-sm text-[#7A6A58]">
            No change requests found.
          </section>
        ) : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Request</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Booking</th>
                    <th className="py-2 pr-3 font-medium">Client</th>
                    <th className="py-2 pr-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => {
                        setDrawerOpen(true);
                        setSelectedRequestId(row.id);
                        void loadDetail(row.id);
                      }}
                      className="cursor-pointer border-b border-border/60 hover:bg-[#FFF9EE]"
                    >
                      <td className="py-3 pr-3 font-medium text-[#1F2420]">{row.id}</td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${typeBadge(
                            row.requestType,
                          )}`}
                        >
                          {row.requestType}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusBadge(
                            row.status,
                          )}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.bookingId}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.clientId}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{formatDateTimeAmPm(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <article
                  key={row.id}
                  onClick={() => {
                    setDrawerOpen(true);
                    setSelectedRequestId(row.id);
                    void loadDetail(row.id);
                  }}
                  className="rounded-lg border border-border bg-white p-4"
                >
                  <p className="text-sm font-semibold text-[#1F2420]">{row.id}</p>
                  <p className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs ${typeBadge(row.requestType)}`}>
                      {row.requestType}
                    </span>
                    <span className={`rounded-full px-2 py-1 text-xs ${statusBadge(row.status)}`}>
                      {row.status}
                    </span>
                  </p>
                  <p className="mt-2 text-xs text-[#7A6A58]">Booking: {row.bookingId}</p>
                  <p className="mt-1 text-xs text-[#7A6A58]">Created: {formatDateTimeAmPm(row.createdAt)}</p>
                </article>
              ))}
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
                onClick={() => setPage((prev) => prev + 1)}
                className="rounded border border-border bg-white px-3 py-1 text-sm"
              >
                Next
              </button>
            </div>
          </section>
        ) : null}

        {drawerOpen ? (
          <div className="fixed inset-0 z-50 flex justify-end bg-[#2A1722]/35">
            <aside className="h-full w-full overflow-y-auto border-l border-border bg-[#FFFDF9] p-5 shadow-xl sm:max-w-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#1F2420]">Request detail</h2>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setDetail(null);
                    setActionError("");
                    setDetailError("");
                  }}
                  className="rounded border border-border bg-white px-3 py-1 text-sm"
                >
                  Close
                </button>
              </div>

              {detailLoading ? <p className="text-sm text-[#7A6A58]">Loading detail...</p> : null}
              {detailError ? (
                <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                  {detailError}
                </p>
              ) : null}

              {detail ? (
                <div className="space-y-4">
                  <section className="rounded-lg border border-border bg-white p-4">
                    <p className="text-sm font-semibold text-[#1F2420]">{detail.id}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs ${typeBadge(detail.requestType)}`}>
                        {detail.requestType}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-xs ${statusBadge(detail.status)}`}>
                        {detail.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[#7A6A58]">Booking: {detail.bookingId}</p>
                    <p className="mt-1 text-sm text-[#7A6A58]">
                      Client: {detail.booking.client?.fullName ?? detail.clientId}
                    </p>
                    <p className="mt-1 text-sm text-[#7A6A58]">
                      Created: {formatDateTimeAmPm(detail.createdAt)}
                    </p>
                  </section>

                  <section className="rounded-lg border border-border bg-white p-4">
                    <h3 className="text-sm font-semibold text-[#1F2420]">Slots</h3>
                    <p className="mt-2 text-sm text-[#7A6A58]">
                      Original:{" "}
                      {detail.booking.slot
                        ? `${detail.booking.slot.date} ${formatWallClockRange12h(detail.booking.slot.startTime, detail.booking.slot.endTime, " – ")}`
                        : detail.booking.slotId}
                    </p>
                    <p className="mt-1 text-sm text-[#7A6A58]">
                      Requested:{" "}
                      {detail.requestedSlot
                        ? `${detail.requestedSlot.date} ${formatWallClockRange12h(detail.requestedSlot.startTime, detail.requestedSlot.endTime, " – ")}`
                        : detail.requestType === "RESCHEDULE"
                          ? detail.requestedSlotId ?? "-"
                          : "N/A"}
                    </p>
                    <p className="mt-2 text-sm text-[#7A6A58]">Reason: {detail.reason ?? "-"}</p>
                  </section>

                  {bookingDetailNote ? (
                    <p className="rounded border border-[#E6DCCB] bg-[#FFF9EE] px-3 py-2 text-xs text-[#7A6A58]">
                      {bookingDetailNote}
                    </p>
                  ) : null}

                  <section className="rounded-lg border border-border bg-white p-4">
                    <h3 className="text-sm font-semibold text-[#1F2420]">Actions</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canApproveCurrent ? (
                        <button
                          type="button"
                          disabled={actionLoading !== null}
                          onClick={() => void triggerAction("approve")}
                          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                        >
                          Approve
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={actionLoading !== null || !canRead}
                        onClick={() => void triggerAction("reject")}
                        className="rounded border border-border bg-white px-3 py-1.5 text-xs"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={actionLoading !== null || !canRead}
                        onClick={() => void triggerAction("cancel")}
                        className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-1.5 text-xs text-danger"
                      >
                        Cancel Request
                      </button>
                    </div>
                    {actionError ? (
                      <p className="mt-3 rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                        {actionError}
                      </p>
                    ) : null}
                  </section>
                </div>
              ) : null}
            </aside>
          </div>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
