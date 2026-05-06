"use client";

import {
  ApiClientError,
  getDashboardBookingById,
  getDashboardBookings,
  getDashboardBranches,
  getDashboardSlots,
  postDashboardBookingAction,
  type DashboardBookingDetail,
  type DashboardBookingsListItem,
  type DashboardBranch,
  type DashboardSlot,
} from "@rouby/api-client";
import { useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type PageState = "loading" | "loaded" | "empty" | "error";

const BOOKING_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-[#FFF6E6] text-[#8B6A1D]",
  CONFIRMED: "bg-[#EAF7EE] text-[#1E6A3A]",
  REQUIRES_FOLLOW_UP: "bg-[#EFEAF8] text-[#4C3E77]",
  RESCHEDULED: "bg-[#EAF1F8] text-[#2C567A]",
  ARRIVED: "bg-[#F5F0DF] text-[#6D5A1A]",
  IN_PROGRESS: "bg-[#E7F0E8] text-[#2E5A3A]",
  COMPLETED: "bg-[#EEF2EC] text-[#355032]",
  CANCELLED: "bg-[#F3F0EF] text-[#6A615A]",
  REJECTED: "bg-[#FBECEA] text-[#8B4428]",
  NO_SHOW: "bg-[#FCEEE8] text-[#8B4428]",
};

function statusBadge(status: string): string {
  return BOOKING_STATUS_STYLES[status] ?? "bg-[#F3EBDD] text-[#4A3C2F]";
}

function toDateInput(value: Date): string {
  const y = value.getFullYear();
  const m = `${value.getMonth() + 1}`.padStart(2, "0");
  const d = `${value.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatEGP(amount: number): string {
  return `EGP ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "BOOKING_SLOT_FULL") {
      return "Selected slot is full (BOOKING_SLOT_FULL).";
    }
    if (error.code === "SLOT_NOT_ONLINE") {
      return "Selected slot is not available online (SLOT_NOT_ONLINE).";
    }
    if (error.statusCode === 403) {
      return "You do not have permission for this action (403 FORBIDDEN).";
    }
    if (error.statusCode === 401) {
      return "Your session expired (401 UNAUTHORIZED). Please sign in again.";
    }
    if (error.code === "INVALID_STATUS_TRANSITION") {
      return "Invalid booking status transition for this action.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected API error.";
}

type DrawerAction =
  | "confirm"
  | "reject"
  | "require-follow-up"
  | "reschedule"
  | "confirm-reschedule"
  | "cancel"
  | "mark-arrived"
  | "mark-in-progress"
  | "mark-completed"
  | "mark-no-show"
  | "recalculate-pricing"
  | "discount";

export default function DashboardBookingsPage() {
  const { token, user, hasPermission } = useDashboardAuth();
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardBookingsListItem[]>([]);
  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [clientIdFilter, setClientIdFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detail, setDetail] = useState<DashboardBookingDetail | null>(null);
  const [slotsForReschedule, setSlotsForReschedule] = useState<DashboardSlot[]>([]);
  const [rescheduleSlotId, setRescheduleSlotId] = useState<string>("");
  const [discountAmount, setDiscountAmount] = useState<string>("");
  const [discountReason, setDiscountReason] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<DrawerAction | null>(null);
  const [actionError, setActionError] = useState("");

  const canRead = hasPermission("bookings.read");
  const canConfirm = hasPermission("bookings.confirm");
  const canReject = hasPermission("bookings.reject");
  const canCancel = hasPermission("bookings.cancel");
  const canReschedule = hasPermission("bookings.reschedule");
  const canProgress = hasPermission("bookings.status.progress");
  const canUpdate = hasPermission("bookings.update");
  const canDiscount = hasPermission("bookings.discount.apply");
  const canReadBranches = hasPermission("branches.read");
  function openDrawer(bookingId: string) {
    setDrawerOpen(true);
    setSelectedBookingId(bookingId);
    void loadDetail(bookingId);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDetail(null);
    setDetailError("");
    setActionError("");
  }


  const canAccessMultipleBranches = useMemo(
    () => user?.branchId === null && canReadBranches,
    [canReadBranches, user?.branchId],
  );

  async function loadList() {
    if (!token || !canRead) {
      return;
    }
    if (!branchId && canAccessMultipleBranches) {
      return;
    }
    if (!dateFrom || !dateTo) {
      return;
    }
    setState("loading");
    setError("");
    try {
      const response = await getDashboardBookings(token, {
        branchId: branchId || undefined,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        clientId: clientIdFilter || undefined,
        page,
        pageSize: 20,
      });
      setRows(response.data);
      setState(response.data.length > 0 ? "loaded" : "empty");
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  async function loadDetail(bookingId: string) {
    if (!token) {
      return;
    }
    setDetailLoading(true);
    setDetailError("");
    setActionError("");
    try {
      const response = await getDashboardBookingById(token, bookingId);
      setDetail(response);
      const slotDate = response.slot?.date ?? toDateInput(new Date());
      if (canReschedule) {
        try {
          const slotsResponse = await getDashboardSlots(token, response.branchId, {
            dateFrom: slotDate,
            dateTo: slotDate,
            page: 1,
            pageSize: 100,
          });
          setSlotsForReschedule(slotsResponse.data);
          setRescheduleSlotId(
            slotsResponse.data.find((slot) => slot.id !== response.slotId)?.id ?? "",
          );
        } catch {
          setSlotsForReschedule([]);
          setRescheduleSlotId("");
        }
      } else {
        setSlotsForReschedule([]);
        setRescheduleSlotId("");
      }
    } catch (requestError) {
      setDetailError(formatApiError(requestError));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!token || !canRead) {
      return;
    }
    if (canReadBranches) {
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
      return;
    }
    if (!branchId && user?.branchId) {
      setBranchId(user.branchId);
    }
  }, [branchId, canRead, canReadBranches, token, user?.branchId]);

  useEffect(() => {
    const today = toDateInput(new Date());
    setDateFrom(today);
    setDateTo(today);
  }, []);

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, status, dateFrom, dateTo, clientIdFilter, page, token, canRead]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDrawer();
      }
    }
    window.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscape);
    };
  }, [drawerOpen]);

  async function triggerAction(action: DrawerAction) {
    if (!token || !selectedBookingId) {
      return;
    }
    setActionLoading(action);
    setActionError("");
    try {
      if (action === "reschedule") {
        if (!rescheduleSlotId) {
          setActionError("Select a slot for reschedule.");
          return;
        }
        await postDashboardBookingAction(token, selectedBookingId, action, {
          slotId: rescheduleSlotId,
        });
      } else if (action === "discount") {
        const parsed = Number(discountAmount);
        if (!Number.isFinite(parsed) || parsed < 0) {
          setActionError("Enter a valid discount amount.");
          return;
        }
        await postDashboardBookingAction(token, selectedBookingId, action, {
          discountAmount: parsed,
          reason: discountReason || undefined,
        });
      } else {
        await postDashboardBookingAction(token, selectedBookingId, action);
      }
      await Promise.all([loadList(), loadDetail(selectedBookingId)]);
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
          <h1 className="text-2xl font-semibold text-[#1F2420]">Bookings</h1>
          <p className="mt-2 text-sm text-[#7A6A58]">
            Pending requests and booking lifecycle operations.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Status</span>
              <select
                value={status}
                onChange={(event) => {
                  setPage(1);
                  setStatus(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="">All statuses</option>
                {Object.keys(BOOKING_STATUS_STYLES).map((value) => (
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
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Branch</span>
              <select
                value={branchId}
                disabled={!canAccessMultipleBranches}
                onChange={(event) => {
                  setPage(1);
                  setBranchId(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA] disabled:text-[#7A6A58]"
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Client filter (UUID)
              </span>
              <input
                value={clientIdFilter}
                onChange={(event) => {
                  setPage(1);
                  setClientIdFilter(event.target.value.trim());
                }}
                placeholder="clientId"
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Source filter
              </span>
              <input
                disabled
                value="Not available in /dashboard/bookings query"
                className="w-full rounded-md border border-border bg-[#F5F1EA] px-3 py-2 text-[#7A6A58]"
              />
            </label>
          </div>
        </section>

        {state === "loading" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm text-sm text-[#7A6A58]">
            Loading bookings...
          </section>
        ) : null}
        {state === "error" ? (
          <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 shadow-sm text-sm text-danger">
            {error}
          </section>
        ) : null}
        {state === "empty" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm text-sm text-[#7A6A58]">
            No bookings found.
          </section>
        ) : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Booking</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 pr-3 font-medium">Branch</th>
                    <th className="py-2 pr-3 font-medium">Total</th>
                    <th className="py-2 pr-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-border/60 hover:bg-[#FFF9EE]"
                      role="button"
                      tabIndex={0}
                      onClick={() => openDrawer(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openDrawer(row.id);
                        }
                      }}
                    >
                      <td className="py-3 pr-3 font-medium text-[#1F2420]">{row.id}</td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusBadge(
                            row.status,
                          )}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.source}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.branchId}</td>
                      <td className="py-3 pr-3 text-[#1F2420]">{formatEGP(row.totalAmount)}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <article
                  key={row.id}
                  onClick={() => openDrawer(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openDrawer(row.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="rounded-lg border border-border bg-white p-4"
                >
                  <p className="text-sm font-semibold text-[#1F2420]">{row.id}</p>
                  <p className="mt-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusBadge(
                        row.status,
                      )}`}
                    >
                      {row.status}
                    </span>
                  </p>
                  <p className="mt-2 text-xs text-[#7A6A58]">{row.source}</p>
                  <p className="mt-1 text-xs text-[#1F2420]">{formatEGP(row.totalAmount)}</p>
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
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close booking details drawer"
              onClick={closeDrawer}
            />
            <aside
              className="relative z-10 h-full w-full overflow-y-auto border-l border-border bg-[#FFFDF9] p-4 shadow-xl sm:max-w-2xl sm:p-5"
              role="dialog"
              aria-modal="true"
              aria-label="Booking details"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#1F2420]">Booking details</h2>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded border border-border bg-white px-3 py-1 text-sm"
                >
                  Close
                </button>
              </div>

              {detailLoading ? <p className="text-sm text-[#7A6A58]">Loading detail...</p> : null}
              {detailError ? (
                <p className="rounded-md border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                  {detailError}
                </p>
              ) : null}

              {detail ? (
                <div className="space-y-5">
                  <section className="rounded-lg border border-border bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[#1F2420]">{detail.id}</p>
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusBadge(
                          detail.status,
                        )}`}
                      >
                        {detail.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[#7A6A58]">Source: {detail.source}</p>
                    <p className="mt-1 text-sm text-[#7A6A58]">Branch: {detail.branchId}</p>
                    <p className="mt-1 text-sm text-[#7A6A58]">
                      Slot:{" "}
                      {detail.slot
                        ? `${detail.slot.date} ${detail.slot.startTime}-${detail.slot.endTime}`
                        : detail.slotId}
                    </p>
                    <p className="mt-1 text-sm text-[#7A6A58]">
                      Client: {detail.client?.fullName ?? "-"}{" "}
                      {detail.client?.phone ? `(${detail.client.phone})` : ""}
                    </p>
                  </section>

                  <section className="rounded-lg border border-border bg-white p-4">
                    <h3 className="text-sm font-semibold text-[#1F2420]">Items</h3>
                    {detail.items.length === 0 ? (
                      <p className="mt-2 text-sm text-[#7A6A58]">No items found.</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {detail.items.map((item) => (
                          <li key={item.id} className="rounded border border-border p-3">
                            <p className="text-sm font-medium text-[#1F2420]">
                              {item.nameSnapshot}
                            </p>
                            <p className="mt-1 text-xs text-[#7A6A58]">
                              {item.itemType} • Qty {item.quantity} •{" "}
                              {formatEGP(item.priceSnapshot)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="rounded-lg border border-border bg-white p-4">
                    <h3 className="text-sm font-semibold text-[#1F2420]">Totals</h3>
                    <div className="mt-3 space-y-1 text-sm text-[#1F2420]">
                      <p>Subtotal: {formatEGP(detail.subtotal)}</p>
                      <p>Discount: {formatEGP(detail.discountAmount)}</p>
                      <p>VAT ({(detail.vatRate * 100).toFixed(0)}%): {formatEGP(detail.vatAmount)}</p>
                      <p className="font-semibold">Total: {formatEGP(detail.totalAmount)}</p>
                      <p>Paid: {formatEGP(detail.paidAmount)}</p>
                      <p>Remaining: {formatEGP(detail.remainingAmount)}</p>
                    </div>
                  </section>

                  <section className="rounded-lg border border-border bg-white p-4">
                    <h3 className="text-sm font-semibold text-[#1F2420]">Notes</h3>
                    <p className="mt-2 text-sm text-[#7A6A58]">
                      Client notes: {detail.clientNotes || "-"}
                    </p>
                    <p className="mt-1 text-sm text-[#7A6A58]">
                      Admin notes: {detail.adminNotes || "-"}
                    </p>
                  </section>

                  <section className="rounded-lg border border-border bg-white p-4">
                    <h3 className="text-sm font-semibold text-[#1F2420]">Lifecycle actions</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canConfirm ? (
                        <button
                          type="button"
                          onClick={() => void triggerAction("confirm")}
                          disabled={actionLoading !== null}
                          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                        >
                          Confirm
                        </button>
                      ) : null}
                      {canReject ? (
                        <button
                          type="button"
                          onClick={() => void triggerAction("reject")}
                          disabled={actionLoading !== null}
                          className="rounded border border-border bg-white px-3 py-1.5 text-xs font-medium"
                        >
                          Reject
                        </button>
                      ) : null}
                      {canProgress ? (
                        <button
                          type="button"
                          onClick={() => void triggerAction("require-follow-up")}
                          disabled={actionLoading !== null}
                          className="rounded border border-border bg-white px-3 py-1.5 text-xs font-medium"
                        >
                          Requires Follow-up
                        </button>
                      ) : null}
                      {canCancel ? (
                        <button
                          type="button"
                          onClick={() => void triggerAction("cancel")}
                          disabled={actionLoading !== null}
                          className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-1.5 text-xs font-medium text-danger"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canProgress ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void triggerAction("mark-arrived")}
                            disabled={actionLoading !== null}
                            className="rounded border border-border bg-white px-3 py-1.5 text-xs"
                          >
                            Mark Arrived
                          </button>
                          <button
                            type="button"
                            onClick={() => void triggerAction("mark-in-progress")}
                            disabled={actionLoading !== null}
                            className="rounded border border-border bg-white px-3 py-1.5 text-xs"
                          >
                            Mark In Progress
                          </button>
                          <button
                            type="button"
                            onClick={() => void triggerAction("mark-completed")}
                            disabled={actionLoading !== null}
                            className="rounded border border-border bg-white px-3 py-1.5 text-xs"
                          >
                            Mark Completed
                          </button>
                          <button
                            type="button"
                            onClick={() => void triggerAction("mark-no-show")}
                            disabled={actionLoading !== null}
                            className="rounded border border-border bg-white px-3 py-1.5 text-xs"
                          >
                            Mark No-show
                          </button>
                        </>
                      ) : null}
                    </div>

                    {canReschedule ? (
                      <div className="mt-4 rounded border border-border p-3">
                        <p className="text-xs font-semibold text-[#1F2420]">Reschedule</p>
                        <select
                          value={rescheduleSlotId}
                          onChange={(event) => setRescheduleSlotId(event.target.value)}
                          className="mt-2 w-full rounded border border-border bg-white px-3 py-2 text-sm"
                        >
                          <option value="">Select new slot</option>
                          {slotsForReschedule
                            .filter((slot) => slot.id !== detail.slotId)
                            .map((slot) => (
                              <option key={slot.id} value={slot.id}>
                                {slot.date} {slot.startTime}-{slot.endTime} ({slot.status})
                              </option>
                            ))}
                        </select>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void triggerAction("reschedule")}
                            disabled={actionLoading !== null}
                            className="rounded border border-border bg-white px-3 py-1.5 text-xs"
                          >
                            Reschedule
                          </button>
                          {canConfirm ? (
                            <button
                              type="button"
                              onClick={() => void triggerAction("confirm-reschedule")}
                              disabled={actionLoading !== null}
                              className="rounded border border-border bg-white px-3 py-1.5 text-xs"
                            >
                              Confirm Reschedule
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 rounded border border-border p-3">
                      <p className="text-xs font-semibold text-[#1F2420]">Pricing actions</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {canUpdate ? (
                          <button
                            type="button"
                            onClick={() => void triggerAction("recalculate-pricing")}
                            disabled={actionLoading !== null}
                            className="rounded border border-border bg-white px-3 py-1.5 text-xs"
                          >
                            Recalculate Pricing
                          </button>
                        ) : null}
                      </div>
                      {canDiscount ? (
                        <div className="mt-3 space-y-2">
                          <input
                            type="number"
                            min={0}
                            value={discountAmount}
                            onChange={(event) => setDiscountAmount(event.target.value)}
                            placeholder="Discount amount"
                            className="w-full rounded border border-border bg-white px-3 py-2 text-sm"
                          />
                          <input
                            value={discountReason}
                            onChange={(event) => setDiscountReason(event.target.value)}
                            placeholder="Reason (optional)"
                            className="w-full rounded border border-border bg-white px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => void triggerAction("discount")}
                            disabled={actionLoading !== null}
                            className="rounded border border-border bg-white px-3 py-1.5 text-xs"
                          >
                            Apply Discount
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 rounded border border-border p-3">
                      <p className="text-xs font-semibold text-[#1F2420]">WhatsApp</p>
                      <button
                        type="button"
                        disabled
                        className="mt-2 rounded border border-border bg-[#F5F1EA] px-3 py-1.5 text-xs text-[#7A6A58]"
                      >
                        Send WhatsApp (template key selection pending, fallback placeholder)
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
