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
import Link from "next/link";
import { formatDateTimeAmPm, formatDayLabel, formatWallClockRange12h } from "@rouby/wall-clock";
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

const TYPE_LABELS: Record<string, string> = {
  RESCHEDULE: "Move the booking",
  CANCEL: "Cancel the booking",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Waiting",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Closed",
};

const STATUS_FILTERS = [
  { value: "PENDING", label: "Waiting for an answer" },
  { value: "", label: "All requests" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Closed" },
];

/** Slots arrive as `YYYY-MM-DD` + `HH:mm` (list) or as ISO timestamps (detail); show both the same way. */
function slotText(
  slot: { date: string; startTime: string; endTime: string } | null | undefined,
): string {
  if (!slot) {
    return "—";
  }
  const time = (value: string) => (value.includes("T") ? value.slice(11, 16) : value);
  return `${formatDayLabel(slot.date.slice(0, 10))} · ${formatWallClockRange12h(time(slot.startTime), time(slot.endTime), " – ")}`;
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
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [hasNextPage, setHasNextPage] = useState(false);
  const [requestTypeFilter, setRequestTypeFilter] = useState("");
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
    setState("loading");
    setError("");
    try {
      const response = await getDashboardBookingChangeRequests(token, {
        status: statusFilter || undefined,
        page,
        pageSize: 20,
      });
      let data = response.data;
      setHasNextPage(response.meta.hasNextPage);

      if (requestTypeFilter) {
        data = data.filter((row) => row.requestType === requestTypeFilter);
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
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canRead, statusFilter, requestTypeFilter, page]);

  function openRequest(requestId: string) {
    setDrawerOpen(true);
    setSelectedRequestId(requestId);
    void loadDetail(requestId);
  }

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
            Clients who booked on the website can ask to move or cancel. Approve or reject each one; the client gets a WhatsApp message either way.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Show</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setPage(1);
                  setStatusFilter(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
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
                <option value="">Move and cancel</option>
                <option value="RESCHEDULE">{TYPE_LABELS.RESCHEDULE}</option>
                <option value="CANCEL">{TYPE_LABELS.CANCEL}</option>
              </select>
            </label>
          </div>
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
            {statusFilter === "PENDING"
              ? "No requests waiting. You are all caught up."
              : "No change requests found."}
          </section>
        ) : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Client</th>
                    <th className="py-2 pr-3 font-medium">Asks to</th>
                    <th className="py-2 pr-3 font-medium">Booked for</th>
                    <th className="py-2 pr-3 font-medium">Wants instead</th>
                    <th className="py-2 pr-3 font-medium">Reason</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => openRequest(row.id)}
                      className="cursor-pointer border-b border-border/60 hover:bg-[#FFF9EE]"
                    >
                      <td className="py-3 pr-3">
                        <p className="font-medium text-[#1F2420]">{row.clientName}</p>
                        <p className="text-xs text-[#7A6A58]">{row.clientPhone}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${typeBadge(
                            row.requestType,
                          )}`}
                        >
                          {TYPE_LABELS[row.requestType] ?? row.requestType}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-[#1F2420]">{slotText(row.currentSlot)}</td>
                      <td className="py-3 pr-3 text-[#1F2420]">
                        {row.requestType === "RESCHEDULE" ? slotText(row.requestedSlot) : "—"}
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.reason || "—"}</td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusBadge(
                            row.status,
                          )}`}
                        >
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
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
                  onClick={() => openRequest(row.id)}
                  className="rounded-lg border border-border bg-white p-4"
                >
                  <p className="text-sm font-semibold text-[#1F2420]">{row.clientName}</p>
                  <p className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs ${typeBadge(row.requestType)}`}>
                      {TYPE_LABELS[row.requestType] ?? row.requestType}
                    </span>
                    <span className={`rounded-full px-2 py-1 text-xs ${statusBadge(row.status)}`}>
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  </p>
                  <p className="mt-2 text-xs text-[#7A6A58]">Booked for: {slotText(row.currentSlot)}</p>
                  {row.requestType === "RESCHEDULE" ? (
                    <p className="mt-1 text-xs text-[#7A6A58]">
                      Wants instead: {slotText(row.requestedSlot)}
                    </p>
                  ) : null}
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
                disabled={!hasNextPage}
                onClick={() => setPage((prev) => prev + 1)}
                className="rounded border border-border bg-white px-3 py-1 text-sm disabled:opacity-50"
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
                <h2 className="text-xl font-semibold text-[#1F2420]">Change request</h2>
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
                    <p className="text-base font-semibold text-[#1F2420]">
                      {detail.booking.client?.fullName ?? "Client"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs ${typeBadge(detail.requestType)}`}>
                        {TYPE_LABELS[detail.requestType] ?? detail.requestType}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-xs ${statusBadge(detail.status)}`}>
                        {STATUS_LABELS[detail.status] ?? detail.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[#7A6A58]">
                      Received: {formatDateTimeAmPm(detail.createdAt)}
                    </p>
                    <Link
                      href={`/dashboard/bookings?bookingId=${detail.bookingId}`}
                      className="mt-2 inline-block text-sm font-medium text-[#1F4B3F] underline"
                    >
                      Open the booking
                    </Link>
                  </section>

                  <section className="rounded-lg border border-border bg-white p-4">
                    <p className="text-sm text-[#7A6A58]">
                      Booked for:{" "}
                      <span className="font-medium text-[#1F2420]">
                        {slotText(detail.booking.slot)}
                      </span>
                    </p>
                    {detail.requestType === "RESCHEDULE" ? (
                      <p className="mt-1 text-sm text-[#7A6A58]">
                        Wants instead:{" "}
                        <span className="font-medium text-[#1F2420]">
                          {slotText(detail.requestedSlot)}
                        </span>
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-[#7A6A58]">Reason: {detail.reason || "—"}</p>
                  </section>

                  {bookingDetailNote ? (
                    <p className="rounded border border-[#E6DCCB] bg-[#FFF9EE] px-3 py-2 text-xs text-[#7A6A58]">
                      {bookingDetailNote}
                    </p>
                  ) : null}

                  <section className="rounded-lg border border-border bg-white p-4">
                    <h3 className="text-sm font-semibold text-[#1F2420]">Your answer</h3>
                    {detail.status !== "PENDING" ? (
                      <p className="mt-2 text-sm text-[#7A6A58]">
                        This request is {(STATUS_LABELS[detail.status] ?? detail.status).toLowerCase()}. Nothing more to do.
                      </p>
                    ) : null}
                    <div className={`mt-3 flex flex-wrap items-center gap-2 ${detail.status !== "PENDING" ? "hidden" : ""}`}>
                      {canApproveCurrent ? (
                        <button
                          type="button"
                          disabled={actionLoading !== null}
                          onClick={() => void triggerAction("approve")}
                          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                        >
                          {detail.requestType === "CANCEL" ? "Approve and cancel booking" : "Approve and move booking"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={actionLoading !== null || !canRead}
                        onClick={() => void triggerAction("reject")}
                        className="rounded border border-border bg-white px-4 py-2 text-sm"
                      >
                        Reject (keep booking as is)
                      </button>
                      <button
                        type="button"
                        disabled={actionLoading !== null || !canRead}
                        onClick={() => void triggerAction("cancel")}
                        className="rounded px-2 py-2 text-xs text-[#7A6A58] underline"
                      >
                        Close request without answering
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
