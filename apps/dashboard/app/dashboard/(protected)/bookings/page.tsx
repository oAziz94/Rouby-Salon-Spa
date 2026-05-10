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
  type DashboardListMeta,
  type DashboardSlot,
} from "@rouby/api-client";
import { formatDateTimeAmPm, formatWallClock12h, formatWallClockRange12h } from "@rouby/wall-clock";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Loader2,
  MapPin,
  Receipt,
  Sparkles,
  StickyNote,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type PageState = "loading" | "loaded" | "empty" | "error";

const BOOKING_STATUS_ORDER = [
  "PENDING",
  "CONFIRMED",
  "RESCHEDULED",
  "ARRIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
  "NO_SHOW",
] as const;

const BOOKING_STATUS_STYLES: Record<string, string> = {
  PENDING:
    "border border-[#E8D4A0]/80 bg-[#FFF9ED] text-[#6B5420] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]",
  CONFIRMED:
    "border border-[#0E342B]/25 bg-[#E8F2EE] text-[#0E342B] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
  RESCHEDULED:
    "border border-[#B8D4EA]/90 bg-[#EEF6FC] text-[#1E4A6E] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
  ARRIVED:
    "border border-[#B9974A]/45 bg-[#FBF6E8] text-[#5C4A18] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
  IN_PROGRESS:
    "border border-[#0E342B]/20 bg-[#E4EFE6] text-[#1A4D2E] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
  COMPLETED:
    "border border-[#0E342B]/30 bg-[#DCEAE0] text-[#0E342B] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
  CANCELLED:
    "border border-[#E8E0D4] bg-[#F4F1EC] text-[#5E574C] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
  REJECTED:
    "border border-[#E7B9A4]/80 bg-[#FFF1EC] text-[#8B4428] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
  NO_SHOW:
    "border border-[#E7B9A4]/70 bg-[#FCEEE8] text-[#7A3A28] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
};

function statusBadge(status: string): string {
  return BOOKING_STATUS_STYLES[status] ?? "border border-[#E8E0D4] bg-[#F8F4EC] text-[#4A3C2F]";
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: "Pending",
    CONFIRMED: "Confirmed",
    RESCHEDULED: "Rescheduled",
    ARRIVED: "Arrived",
    IN_PROGRESS: "In progress",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    REJECTED: "Rejected",
    NO_SHOW: "No-show",
  };
  return map[status] ?? status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
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

function formatBookingRef(id: string): string {
  const tail = id.replace(/-/g, "").slice(-8).toUpperCase();
  return `RB-${tail}`;
}

function summarizeBookingItems(detail: DashboardBookingDetail): string {
  if (detail.items.length === 0) {
    return "No line items";
  }
  const first = detail.items[0]?.nameSnapshot ?? "Item";
  if (detail.items.length === 1) {
    return first;
  }
  return `${first} +${detail.items.length - 1} more`;
}

function formatAppointmentFromListRow(row: DashboardBookingsListItem): string {
  if (!row.slot?.date) {
    return "—";
  }
  const { date, startTime, endTime } = row.slot;
  if (startTime && endTime) {
    return `${date} · ${formatWallClockRange12h(startTime, endTime)}`;
  }
  if (startTime) {
    return `${date} · ${formatWallClock12h(startTime)}`;
  }
  return date;
}

function listRowClientLabel(row: DashboardBookingsListItem): string {
  const name = row.client?.fullName?.trim();
  if (name) {
    return name;
  }
  return "Unknown client";
}

type DrawerAction =
  | "confirm"
  | "reject"
  | "reschedule"
  | "confirm-reschedule"
  | "cancel"
  | "mark-arrived"
  | "mark-in-progress"
  | "mark-completed"
  | "mark-no-show"
  | "recalculate-pricing"
  | "discount";

const primaryActionClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#062A2D] px-3.5 py-2 text-xs font-semibold text-[#F6F2EA] shadow-sm transition hover:bg-[#0A3F35] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryActionClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E8E0D4] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45 hover:text-[#062A2D] disabled:cursor-not-allowed disabled:opacity-50";
const dangerOutlineClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E7B9A4]/90 bg-[#FFF9F6] px-3.5 py-2 text-xs font-semibold text-[#8B4428] shadow-sm transition hover:bg-[#FFF1EC] disabled:cursor-not-allowed disabled:opacity-50";

export default function DashboardBookingsPage() {
  const { token, user, hasPermission } = useDashboardAuth();
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardBookingsListItem[]>([]);
  const [listMeta, setListMeta] = useState<DashboardListMeta | null>(null);
  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
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

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of branches) {
      map.set(b.id, b.name);
    }
    return map;
  }, [branches]);

  const pageStats = useMemo(() => {
    if (rows.length === 0) {
      return null;
    }
    const pageTotal = rows.reduce((sum, r) => sum + r.totalAmount, 0);
    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    return { count: rows.length, pageTotal, byStatus };
  }, [rows]);

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

  const loadList = useCallback(async () => {
    if (!token || !canRead) {
      return;
    }
    if (!branchId && canAccessMultipleBranches) {
      return;
    }
    setState("loading");
    setError("");
    setListMeta(null);
    try {
      const response = await getDashboardBookings(token, {
        branchId: branchId || undefined,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: searchApplied || undefined,
        page,
        pageSize: 20,
      });
      setRows(response.data);
      setListMeta(response.meta);
      setState(response.data.length > 0 ? "loaded" : "empty");
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }, [
    branchId,
    canAccessMultipleBranches,
    canRead,
    dateFrom,
    dateTo,
    page,
    searchApplied,
    status,
    token,
  ]);

  const prevSearchAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchApplied(searchInput.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (prevSearchAppliedRef.current === null) {
      prevSearchAppliedRef.current = searchApplied;
      return;
    }
    if (prevSearchAppliedRef.current !== searchApplied) {
      prevSearchAppliedRef.current = searchApplied;
      setPage(1);
    }
  }, [searchApplied]);

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
  }, [loadList]);

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

  const hasNextPage = listMeta?.hasNextPage ?? false;

  function clearFilters() {
    const today = toDateInput(new Date());
    setSearchInput("");
    setSearchApplied("");
    setStatus("");
    setDateFrom(today);
    setDateTo(today);
    setPage(1);
    if (canAccessMultipleBranches) {
      setBranchId(user?.branchId ?? branches[0]?.id ?? "");
    } else if (user?.branchId) {
      setBranchId(user.branchId);
    }
  }

  return (
    <PermissionGuard permission="bookings.read">
      <section className="space-y-6 md:space-y-8">
        <header className="rounded-2xl bg-white/90 p-6 shadow-[0_8px_30px_rgba(31,36,32,0.05)] ring-1 ring-[#E8E0D4]/70 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-[#1F2420] md:text-3xl">Bookings</h1>
                <Sparkles className="h-5 w-5 text-[#B9974A]" strokeWidth={1.75} aria-hidden />
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#7A6A58] md:text-base">
                Manage appointment requests, confirmations, arrivals, and completion.
              </p>
            </div>
          </div>

          {state === "loaded" && pageStats ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-[#E8E0D4]/80 bg-[#FFFCF7] p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">On this page</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-[#1F2420]">{pageStats.count}</p>
                <p className="mt-0.5 text-xs text-[#7A6A58]">Bookings listed</p>
              </div>
              <div className="rounded-xl border border-[#E8E0D4]/80 bg-[#FFFCF7] p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">Page total</p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-[#1F2420] md:text-2xl">
                  {formatEGP(pageStats.pageTotal)}
                </p>
                <p className="mt-0.5 text-xs text-[#7A6A58]">Sum of totals in view</p>
              </div>
              <div className="rounded-xl border border-[#E8E0D4]/80 bg-[#FFFCF7] p-4 shadow-sm sm:col-span-2 lg:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">Status mix (this page)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(pageStats.byStatus).map(([st, n]) => (
                    <span
                      key={st}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(st)}`}
                    >
                      {statusLabel(st)}
                      <span className="tabular-nums opacity-80">{n}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </header>

        <section className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#F0EBE3] pb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#1F2420]">Filters</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#7A6A58]">
                Search clients and bookings, then narrow by appointment window, branch, or status. Dates filter by
                appointment slot day (optional).
              </p>
            </div>
            <button
              type="button"
              onClick={() => clearFilters()}
              className="shrink-0 rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-4 py-2 text-xs font-semibold text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45 hover:text-[#062A2D]"
            >
              Clear filters
            </button>
          </div>
          <div className="mt-5 flex flex-col gap-4">
            <label className="block w-full">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                Search
              </span>
              <input
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                }}
                placeholder="Search by client name, phone, or booking reference"
                className="w-full rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none transition placeholder:text-[#B5A896] focus:border-[#B9974A]/50"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                  Status
                </span>
                <select
                  value={status}
                  onChange={(event) => {
                    setPage(1);
                    setStatus(event.target.value);
                  }}
                  className="w-full rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none transition focus:border-[#B9974A]/50"
                >
                  <option value="">All statuses</option>
                  {BOOKING_STATUS_ORDER.map((value) => (
                    <option key={value} value={value}>
                      {statusLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                  Date from
                </span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => {
                    setPage(1);
                    setDateFrom(event.target.value);
                  }}
                  className="w-full rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none transition focus:border-[#B9974A]/50"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                  Date to
                </span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => {
                    setPage(1);
                    setDateTo(event.target.value);
                  }}
                  className="w-full rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none transition focus:border-[#B9974A]/50"
                />
              </label>
              <label className="block sm:col-span-2 xl:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                  Branch
                </span>
                <select
                  value={branchId}
                  disabled={!canAccessMultipleBranches}
                  onChange={(event) => {
                    setPage(1);
                    setBranchId(event.target.value);
                  }}
                  className="w-full rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none transition focus:border-[#B9974A]/50 disabled:cursor-not-allowed disabled:bg-[#F5F1EA] disabled:text-[#7A6A58]"
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
          </div>
        </section>

        {state === "loading" ? (
          <section className="rounded-2xl bg-white p-6 shadow-[0_8px_30px_rgba(31,36,32,0.04)] ring-1 ring-[#E8E0D4]/50 md:p-8">
            <div className="flex items-center gap-3 text-sm text-[#7A6A58]">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#B9974A]" aria-hidden />
              <span>Loading bookings for the selected filters…</span>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={`sk-${i}`}
                  className="animate-pulse rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-4"
                >
                  <div className="h-3 w-1/3 rounded bg-[#E6DCCB]/80" />
                  <div className="mt-3 h-4 w-2/3 rounded bg-[#E6DCCB]/70" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-[#E6DCCB]/60" />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {state === "error" ? (
          <section className="rounded-2xl bg-[#FFF1EC] p-5 shadow-sm ring-1 ring-[#E7B9A4]/60 md:p-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-[#8B4428]" aria-hidden />
              <p className="text-sm leading-relaxed text-[#8B4428]">{error}</p>
            </div>
          </section>
        ) : null}

        {state === "empty" ? (
          <section className="rounded-2xl bg-white p-8 text-center shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#062A2D]/10 text-[#062A2D]">
              <CalendarClock className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="mt-4 text-base font-semibold text-[#1F2420]">No bookings match these filters</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#7A6A58]">
              Try changing the search, date range, branch, or status.
            </p>
            <button
              type="button"
              onClick={() => clearFilters()}
              className="mt-6 inline-flex items-center justify-center rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-5 py-2.5 text-sm font-semibold text-[#062A2D] shadow-sm transition hover:border-[#B9974A]/45"
            >
              Clear filters
            </button>
          </section>
        ) : null}

        {state === "loaded" ? (
          <section className="rounded-2xl bg-white shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[960px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                    <th className="border-b border-[#F0EBE3] px-5 py-3.5">Reference</th>
                    <th className="border-b border-[#F0EBE3] px-3 py-3.5">Client</th>
                    <th className="border-b border-[#F0EBE3] px-3 py-3.5">Phone</th>
                    <th className="border-b border-[#F0EBE3] px-3 py-3.5">Appointment</th>
                    <th className="border-b border-[#F0EBE3] px-3 py-3.5">Services</th>
                    <th className="border-b border-[#F0EBE3] px-3 py-3.5">Branch</th>
                    <th className="border-b border-[#F0EBE3] px-3 py-3.5">Source</th>
                    <th className="border-b border-[#F0EBE3] px-3 py-3.5 text-right">Total</th>
                    <th className="border-b border-[#F0EBE3] px-3 py-3.5">Status</th>
                    <th className="border-b border-[#F0EBE3] px-5 py-3.5 text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer text-[#1F2420] transition hover:bg-[#FFFCF7]"
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
                      <td className="border-b border-[#F7F4EE] px-5 py-4">
                        <p className="font-mono text-xs font-semibold tracking-wide text-[#062A2D]">
                          {formatBookingRef(row.id)}
                        </p>
                        <p className="mt-1 text-[11px] text-[#B5A896]">Booked {formatDateTimeAmPm(row.createdAt)}</p>
                      </td>
                      <td className="border-b border-[#F7F4EE] px-3 py-4">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#062A2D]/10 text-[#062A2D]">
                            <UserRound className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                          </span>
                          <p className="font-medium leading-snug">{listRowClientLabel(row)}</p>
                        </div>
                      </td>
                      <td className="border-b border-[#F7F4EE] px-3 py-4 text-[#5E574C] tabular-nums">
                        {row.client?.phone?.trim() ? row.client.phone : "—"}
                      </td>
                      <td className="border-b border-[#F7F4EE] px-3 py-4 text-[#5E574C]">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[#B9974A]" aria-hidden />
                          {formatAppointmentFromListRow(row)}
                        </span>
                      </td>
                      <td className="max-w-[200px] border-b border-[#F7F4EE] px-3 py-4 text-[#5E574C]">
                        <span className="line-clamp-2 inline-flex items-start gap-1">
                          <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B9974A]" aria-hidden />
                          {row.servicesSummary ?? "—"}
                        </span>
                      </td>
                      <td className="border-b border-[#F7F4EE] px-3 py-4">
                        <span className="inline-flex items-center gap-1.5 text-[#5E574C]">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#B9974A]" aria-hidden />
                          <span className="line-clamp-2">
                            {row.branchName ?? branchNameById.get(row.branchId) ?? "—"}
                          </span>
                        </span>
                      </td>
                      <td className="border-b border-[#F7F4EE] px-3 py-4 text-[#5E574C]">{row.source}</td>
                      <td className="border-b border-[#F7F4EE] px-3 py-4 text-right font-semibold tabular-nums">
                        {formatEGP(row.totalAmount)}
                      </td>
                      <td className="border-b border-[#F7F4EE] px-3 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(row.status)}`}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="border-b border-[#F7F4EE] px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDrawer(row.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-[#E8E0D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#062A2D] shadow-sm transition hover:border-[#B9974A]/45"
                        >
                          View
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 md:hidden">
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
                  className="cursor-pointer rounded-2xl border border-[#E8E0D4]/80 bg-[#FFFCF7] p-4 shadow-sm transition active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold tracking-wide text-[#062A2D]">
                        {formatBookingRef(row.id)}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#1F2420]">{listRowClientLabel(row)}</p>
                      <p className="mt-0.5 text-xs text-[#5E574C] tabular-nums">
                        {row.client?.phone?.trim() ? row.client.phone : "Phone —"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(row.status)}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[#7A6A58]">
                    <span className="font-medium text-[#5E574C]">Appointment:</span>{" "}
                    {formatAppointmentFromListRow(row)}
                  </p>
                  <p className="mt-1 text-xs text-[#7A6A58]">
                    <span className="font-medium text-[#5E574C]">Booked:</span> {formatDateTimeAmPm(row.createdAt)}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[#5E574C]">
                    <span className="font-medium text-[#7A6A58]">Services:</span> {row.servicesSummary ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-[#7A6A58]">
                    <span className="font-medium text-[#5E574C]">Branch:</span>{" "}
                    {row.branchName ?? branchNameById.get(row.branchId) ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-[#7A6A58]">
                    <span className="font-medium text-[#5E574C]">Source:</span> {row.source}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#F0EBE3] pt-3">
                    <p className="text-sm font-semibold tabular-nums text-[#1F2420]">{formatEGP(row.totalAmount)}</p>
                    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#062A2D]">
                      View <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </div>
                </article>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F0EBE3] px-4 py-4 md:px-5">
              <p className="text-xs text-[#7A6A58]">
                {listMeta
                  ? `Page ${listMeta.page} of ${Math.max(listMeta.totalPages, 1)} · ${listMeta.totalItems} total`
                  : `Page ${page}`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || state !== "loaded"}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  className="rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm font-medium text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!hasNextPage || state !== "loaded"}
                  onClick={() => setPage((prev) => prev + 1)}
                  className="rounded-xl border border-[#E8E0D4] bg-[#062A2D] px-4 py-2 text-sm font-medium text-[#F6F2EA] shadow-sm transition hover:bg-[#0A3F35] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {drawerOpen ? (
          <div className="fixed inset-0 z-50 flex justify-end bg-[#062A2D]/40 backdrop-blur-[2px]">
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close booking details drawer"
              onClick={closeDrawer}
            />
            <aside
              className="relative z-10 flex h-full w-full max-w-full flex-col overflow-hidden border-l border-[#E8E0D4]/90 bg-[#FFFCF7] shadow-[0_0_48px_rgba(6,42,45,0.18)] sm:max-w-lg"
              role="dialog"
              aria-modal="true"
              aria-label="Booking details"
            >
              <div className="shrink-0 border-b border-[#F0EBE3] bg-white/95 px-4 py-4 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Booking reference</p>
                    <p className="mt-1 truncate text-lg font-semibold tracking-tight text-[#1F2420]">
                      {selectedBookingId ? formatBookingRef(selectedBookingId) : "—"}
                    </p>
                    {detail ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(detail.status)}`}
                        >
                          {statusLabel(detail.status)}
                        </span>
                        <span className="rounded-full border border-[#E8E0D4] bg-[#FFFCF7] px-2.5 py-1 text-xs font-medium text-[#5E574C]">
                          {detail.source}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={closeDrawer}
                    className="shrink-0 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-xs font-semibold text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
                {detailLoading ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-[#F0EBE3] bg-white p-5 text-sm text-[#7A6A58]">
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#B9974A]" aria-hidden />
                    Loading booking details…
                  </div>
                ) : null}
                {detailError ? (
                  <div className="flex gap-3 rounded-2xl border border-[#E7B9A4]/70 bg-[#FFF1EC] p-4 text-sm text-[#8B4428]">
                    <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
                    <p>{detailError}</p>
                  </div>
                ) : null}

                {detail ? (
                  <div className="space-y-4">
                    <section className="rounded-2xl border border-[#E8E0D4]/70 bg-white p-4 shadow-sm ring-1 ring-[#F7F4EE]/80">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        <UserRound className="h-4 w-4 text-[#B9974A]" aria-hidden />
                        Client
                      </div>
                      <p className="mt-2 text-base font-semibold text-[#1F2420]">
                        {detail.client?.fullName ?? "—"}
                      </p>
                      <div className="mt-2 space-y-1 text-sm text-[#5E574C]">
                        <p>{detail.client?.phone ? `Phone: ${detail.client.phone}` : "Phone: —"}</p>
                        <p>{detail.client?.email ? `Email: ${detail.client.email}` : "Email: —"}</p>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-[#E8E0D4]/70 bg-white p-4 shadow-sm ring-1 ring-[#F7F4EE]/80">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        <CalendarClock className="h-4 w-4 text-[#B9974A]" aria-hidden />
                        Appointment
                      </div>
                      <p className="mt-2 text-sm font-medium text-[#1F2420]">
                        {detail.slot
                          ? `${detail.slot.date} · ${formatWallClockRange12h(detail.slot.startTime, detail.slot.endTime)}`
                          : `Slot ID: ${detail.slotId}`}
                      </p>
                      <p className="mt-1 text-xs text-[#7A6A58]">
                        Created {formatDateTimeAmPm(detail.createdAt)} · Updated{" "}
                        {formatDateTimeAmPm(detail.updatedAt)}
                      </p>
                    </section>

                    <section className="rounded-2xl border border-[#E8E0D4]/70 bg-white p-4 shadow-sm ring-1 ring-[#F7F4EE]/80">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        <Building2 className="h-4 w-4 text-[#B9974A]" aria-hidden />
                        Branch
                      </div>
                      <p className="mt-2 text-sm font-medium text-[#1F2420]">
                        {branchNameById.get(detail.branchId) ?? detail.branchId}
                      </p>
                    </section>

                    <section className="rounded-2xl border border-[#E8E0D4]/70 bg-white p-4 shadow-sm ring-1 ring-[#F7F4EE]/80">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        <ClipboardList className="h-4 w-4 text-[#B9974A]" aria-hidden />
                        Selected items
                      </div>
                      {detail.items.length === 0 ? (
                        <p className="mt-2 text-sm text-[#7A6A58]">No items on this booking.</p>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {detail.items.map((item) => (
                            <li
                              key={item.id}
                              className="rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] px-3 py-2.5"
                            >
                              <p className="text-sm font-medium text-[#1F2420]">{item.nameSnapshot}</p>
                              <p className="mt-1 text-xs text-[#7A6A58]">
                                {item.itemType} · Qty {item.quantity} · {formatEGP(item.priceSnapshot)} ·{" "}
                                {item.durationMinutesSnapshot} min
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-2 text-xs text-[#B5A896]">Summary: {summarizeBookingItems(detail)}</p>
                    </section>

                    <section className="rounded-2xl border border-[#E8E0D4]/70 bg-white p-4 shadow-sm ring-1 ring-[#F7F4EE]/80">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        <Receipt className="h-4 w-4 text-[#B9974A]" aria-hidden />
                        Pricing summary
                      </div>
                      <dl className="mt-3 space-y-2 text-sm text-[#1F2420]">
                        <div className="flex justify-between gap-4">
                          <dt className="text-[#7A6A58]">Subtotal</dt>
                          <dd className="font-medium tabular-nums">{formatEGP(detail.subtotal)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-[#7A6A58]">Discount</dt>
                          <dd className="font-medium tabular-nums">{formatEGP(detail.discountAmount)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-[#7A6A58]">VAT ({(detail.vatRate * 100).toFixed(0)}%)</dt>
                          <dd className="font-medium tabular-nums">{formatEGP(detail.vatAmount)}</dd>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-[#F0EBE3] pt-2 text-base font-semibold">
                          <dt>Total</dt>
                          <dd className="tabular-nums">{formatEGP(detail.totalAmount)}</dd>
                        </div>
                        {detail.appliedPromoCode ? (
                          <div className="flex justify-between gap-4 text-sm">
                            <dt className="text-[#7A6A58]">Promo code</dt>
                            <dd className="font-medium text-[#1F2420]">{detail.appliedPromoCode}</dd>
                          </div>
                        ) : null}
                        <div className="flex justify-between gap-4 text-sm">
                          <dt className="text-[#7A6A58]">Paid</dt>
                          <dd className="font-medium tabular-nums text-[#0E342B]">{formatEGP(detail.paidAmount)}</dd>
                        </div>
                        <div className="flex justify-between gap-4 text-sm">
                          <dt className="text-[#7A6A58]">Remaining</dt>
                          <dd className="font-medium tabular-nums text-[#8B4428]">
                            {formatEGP(detail.remainingAmount)}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    <section className="rounded-2xl border border-[#E8E0D4]/70 bg-white p-4 shadow-sm ring-1 ring-[#F7F4EE]/80">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        <StickyNote className="h-4 w-4 text-[#B9974A]" aria-hidden />
                        Notes
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-[#5E574C]">
                        <span className="font-medium text-[#1F2420]">Client:</span> {detail.clientNotes || "—"}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-[#5E574C]">
                        <span className="font-medium text-[#1F2420]">Internal:</span> {detail.adminNotes || "—"}
                      </p>
                    </section>

                    <section className="rounded-2xl border border-[#E8E0D4]/70 bg-white p-4 shadow-sm ring-1 ring-[#F7F4EE]/80">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        Lifecycle actions
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-[#B5A896]">
                        Actions stay the same as before; they are grouped for faster scanning. The API still enforces
                        valid transitions.
                      </p>

                      {canConfirm || canReject ? (
                        <div className="mt-4 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3">
                          <p className="text-xs font-semibold text-[#1F2420]">Request handling</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {canConfirm ? (
                              <button
                                type="button"
                                onClick={() => void triggerAction("confirm")}
                                disabled={actionLoading !== null}
                                className={primaryActionClass}
                              >
                                Confirm
                              </button>
                            ) : null}
                            {canReject ? (
                              <button
                                type="button"
                                onClick={() => void triggerAction("reject")}
                                disabled={actionLoading !== null}
                                className={secondaryActionClass}
                              >
                                Reject
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {canProgress ? (
                        <div className="mt-3 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3">
                          <p className="text-xs font-semibold text-[#1F2420]">Appointment progress</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void triggerAction("mark-arrived")}
                              disabled={actionLoading !== null}
                              className={secondaryActionClass}
                            >
                              Arrived
                            </button>
                            <button
                              type="button"
                              onClick={() => void triggerAction("mark-in-progress")}
                              disabled={actionLoading !== null}
                              className={secondaryActionClass}
                            >
                              In progress
                            </button>
                            <button
                              type="button"
                              onClick={() => void triggerAction("mark-completed")}
                              disabled={actionLoading !== null}
                              className={primaryActionClass}
                            >
                              Completed
                            </button>
                            <button
                              type="button"
                              onClick={() => void triggerAction("mark-no-show")}
                              disabled={actionLoading !== null}
                              className={dangerOutlineClass}
                            >
                              No-show
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {canReschedule || canCancel ? (
                        <div className="mt-3 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3">
                          <p className="text-xs font-semibold text-[#1F2420]">Changes</p>
                          {canReschedule ? (
                            <div className="mt-2 space-y-2">
                              <label className="block text-xs font-medium text-[#7A6A58]">New slot</label>
                              <select
                                value={rescheduleSlotId}
                                onChange={(event) => setRescheduleSlotId(event.target.value)}
                                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
                              >
                                <option value="">Select new slot</option>
                                {slotsForReschedule
                                  .filter((slot) => slot.id !== detail.slotId)
                                  .map((slot) => (
                                    <option key={slot.id} value={slot.id}>
                                      {slot.date} {formatWallClockRange12h(slot.startTime, slot.endTime, " – ")} ({slot.status})
                                    </option>
                                  ))}
                              </select>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void triggerAction("reschedule")}
                                  disabled={actionLoading !== null}
                                  className={secondaryActionClass}
                                >
                                  Reschedule
                                </button>
                                {canConfirm ? (
                                  <button
                                    type="button"
                                    onClick={() => void triggerAction("confirm-reschedule")}
                                    disabled={actionLoading !== null}
                                    className={secondaryActionClass}
                                  >
                                    Confirm reschedule
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                          {canCancel ? (
                            <div className={canReschedule ? "mt-3 border-t border-[#F0EBE3] pt-3" : "mt-2"}>
                              <button
                                type="button"
                                onClick={() => void triggerAction("cancel")}
                                disabled={actionLoading !== null}
                                className={dangerOutlineClass}
                              >
                                Cancel booking
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {canUpdate || canDiscount ? (
                        <div className="mt-3 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3">
                          <p className="text-xs font-semibold text-[#1F2420]">Pricing</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {canUpdate ? (
                              <button
                                type="button"
                                onClick={() => void triggerAction("recalculate-pricing")}
                                disabled={actionLoading !== null}
                                className={secondaryActionClass}
                              >
                                Recalculate
                              </button>
                            ) : null}
                          </div>
                          {canDiscount ? (
                            <div className="mt-3 space-y-2 border-t border-[#F0EBE3] pt-3">
                              <input
                                type="number"
                                min={0}
                                value={discountAmount}
                                onChange={(event) => setDiscountAmount(event.target.value)}
                                placeholder="Discount amount"
                                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-[#B9974A]/50"
                              />
                              <input
                                value={discountReason}
                                onChange={(event) => setDiscountReason(event.target.value)}
                                placeholder="Reason (optional)"
                                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-[#B9974A]/50"
                              />
                              <button
                                type="button"
                                onClick={() => void triggerAction("discount")}
                                disabled={actionLoading !== null}
                                className={primaryActionClass}
                              >
                                Apply discount
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {actionError ? (
                        <p className="mt-4 flex gap-2 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-3 py-2 text-sm text-[#8B4428]">
                          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                          {actionError}
                        </p>
                      ) : null}
                    </section>
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
