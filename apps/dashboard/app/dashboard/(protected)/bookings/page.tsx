"use client";

import {
  ApiClientError,
  deleteDashboardBookingItem,
  getDashboardBookingById,
  getDashboardBookings,
  getDashboardBranches,
  getDashboardSlots,
  getDashboardStaffAvailability,
  postDashboardBookingAction,
  postDashboardBookingQueueCheckIn,
  postDashboardCreateBookingChangeRequest,
  postDashboardBookingServiceItemStart,
  postDashboardBookingServiceItemComplete,
  type DashboardBookingDetail,
  type DashboardBookingsListItem,
  type DashboardBranch,
  type DashboardListMeta,
  type DashboardSlot,
  type DashboardStaffAvailabilityResponse,
} from "@rouby/api-client";
import { cairoTodayYmd, formatDateTimeAmPm, formatWallClock12h, formatWallClockRange12h } from "@rouby/wall-clock";
import {
  AlertCircle,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  ListTodo,
  Loader2,
  MapPin,
  Plus,
  Receipt,
  Sparkles,
  StickyNote,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { DashboardCreateBookingDialog } from "@/components/dashboard-create-booking-dialog";
import { useSystemDialog } from "@/components/system-dialog-provider";
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
    if (error.code === "QUEUE_ACTIVE_FOR_BOOKING") {
      return "An active queue entry already exists for this booking.";
    }
    if (error.code === "BOOKING_NOT_ELIGIBLE_FOR_QUEUE") {
      return "This booking status cannot be checked in to the queue.";
    }
    if (error.code === "BOOKING_LAST_ITEM") {
      return "A booking must keep at least one item — cancel the booking instead.";
    }
    if (error.code === "INVOICE_FINALIZED_BLOCKS_ITEMS") {
      return "Cannot change items after the invoice has been finalized.";
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
  if (row.source === "WALK_IN") {
    return `Walk-in · ${formatDateTimeAmPm(row.createdAt)}`;
  }
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

function formatAppointmentFromDetail(detail: DashboardBookingDetail): string {
  if (detail.source === "WALK_IN") {
    return `Walk-in · ${formatDateTimeAmPm(detail.createdAt)}`;
  }
  if (detail.slot) {
    return `${detail.slot.date} · ${formatWallClockRange12h(detail.slot.startTime, detail.slot.endTime)}`;
  }
  return `Slot ID: ${detail.slotId}`;
}

function listRowClientLabel(row: DashboardBookingsListItem): string {
  const name = row.client?.fullName?.trim();
  if (name) {
    return name;
  }
  return "Unknown client";
}

const TERMINAL_BOOKING_STATUSES = ["CANCELLED", "REJECTED", "COMPLETED", "NO_SHOW"] as const;

function isTerminalBookingStatus(status: string): boolean {
  return TERMINAL_BOOKING_STATUSES.includes(status as (typeof TERMINAL_BOOKING_STATUSES)[number]);
}

function canDirectlyChangeBooking(status: string): boolean {
  return !isTerminalBookingStatus(status) && status !== "IN_PROGRESS";
}

type DrawerAction =
  | "confirm"
  | "reject"
  | "reschedule"
  | "confirm-reschedule"
  | "cancel"
  | "mark-arrived"
  | "mark-in-progress"
  | "mark-no-show"
  | "recalculate-pricing"
  | "discount";

const primaryActionClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#062A2D] px-3.5 py-2 text-xs font-semibold text-[#F6F2EA] shadow-sm transition hover:bg-[#0A3F35] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryActionClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E8E0D4] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45 hover:text-[#062A2D] disabled:cursor-not-allowed disabled:opacity-50";
const dangerOutlineClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E7B9A4]/90 bg-[#FFF9F6] px-3.5 py-2 text-xs font-semibold text-[#8B4428] shadow-sm transition hover:bg-[#FFF1EC] disabled:cursor-not-allowed disabled:opacity-50";

/** True once the appointment's slot start (Cairo wall clock) is now or in the past. */
function slotStartHasPassed(slot?: { date?: string | null; startTime?: string | null } | null): boolean {
  if (!slot?.date || !slot.startTime) return true;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const nowKey = `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}`;
  return `${slot.date.slice(0, 10)}T${slot.startTime.slice(0, 8)}` <= nowKey;
}

export default function DashboardBookingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, user, hasPermission } = useDashboardAuth();
  const { confirm } = useSystemDialog();
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
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [staffChangeType, setStaffChangeType] = useState<"" | "CANCEL" | "RESCHEDULE">("");
  const [staffChangeReason, setStaffChangeReason] = useState("");
  const [staffChangeDate, setStaffChangeDate] = useState("");
  const [staffChangeSlots, setStaffChangeSlots] = useState<DashboardSlot[]>([]);
  const [staffChangeSlotId, setStaffChangeSlotId] = useState("");
  const [staffChangeSlotsLoading, setStaffChangeSlotsLoading] = useState(false);
  const [staffChangeSubmitting, setStaffChangeSubmitting] = useState(false);
  const [staffChangeError, setStaffChangeError] = useState("");
  const [staffChangeSuccess, setStaffChangeSuccess] = useState("");
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string>("");

  const [lineStartItemId, setLineStartItemId] = useState<string | null>(null);
  const [lineStartStaffOptions, setLineStartStaffOptions] = useState<
    DashboardStaffAvailabilityResponse["staff"]
  >([]);
  const [lineStartStaffPick, setLineStartStaffPick] = useState("");
  const [lineStartLoading, setLineStartLoading] = useState(false);
  const [lineStartSubmitting, setLineStartSubmitting] = useState(false);
  const [lineStartError, setLineStartError] = useState("");
  const [lineCompleteBusyId, setLineCompleteBusyId] = useState<string | null>(null);

  const canRead = hasPermission("bookings.read");
  const canConfirm = hasPermission("bookings.confirm");
  const canReject = hasPermission("bookings.reject");
  const canCancel = hasPermission("bookings.cancel");
  const canReschedule = hasPermission("bookings.reschedule");
  const canProgress = hasPermission("bookings.status.progress");
  const canQueueManage = hasPermission("queue.manage");
  const canUpdate = hasPermission("bookings.update");
  const canDiscount = hasPermission("bookings.discount.apply");
  const canReadBranches = hasPermission("branches.read");
  const canCreateBooking = hasPermission("bookings.create");
  const canStartServiceLine = hasPermission("bookingServiceItems.start");
  const canCompleteServiceLine = hasPermission("bookingServiceItems.complete");

  const drawerCanRequestDecision = detail?.status === "PENDING";
  // Spec v2 §1: Arrived / In progress / Completed are derived from the visit (check-in, start, close).
  // Spec v2 §6: No-show is offered only once the appointment start time has passed.
  const drawerCanMarkNoShow = detail
    ? ["PENDING", "CONFIRMED", "RESCHEDULED", "ARRIVED"].includes(detail.status) &&
      slotStartHasPassed(detail.slot)
    : false;
  const drawerCanDirectChange = detail ? canDirectlyChangeBooking(detail.status) : false;
  const drawerCanQueueCheckIn =
    detail != null &&
    canQueueManage &&
    canProgress &&
    ["CONFIRMED", "RESCHEDULED", "ARRIVED"].includes(detail.status);
  const drawerHasPrimaryActions =
    detail != null &&
    ((canConfirm && drawerCanRequestDecision) ||
      (canReject && drawerCanRequestDecision) ||
      (canProgress && drawerCanMarkNoShow) ||
      drawerCanQueueCheckIn);

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
    setSelectedBookingId("");
    setDetail(null);
    setDetailError("");
    setActionError("");
    setCheckInLoading(false);
    setRemovingItemId("");
    setLineStartItemId(null);
    setLineStartStaffOptions([]);
    setLineStartStaffPick("");
    setLineStartLoading(false);
    setLineStartSubmitting(false);
    setLineStartError("");
    setLineCompleteBusyId(null);
    setStaffChangeType("");
    setStaffChangeReason("");
    setStaffChangeDate("");
    setStaffChangeSlots([]);
    setStaffChangeSlotId("");
    setStaffChangeError("");
    setStaffChangeSuccess("");
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
      const slotDate = response.slot?.date ?? cairoTodayYmd();
      setStaffChangeType("");
      setStaffChangeReason("");
      setStaffChangeDate(slotDate);
      setStaffChangeSlotId("");
      setStaffChangeError("");
      setStaffChangeSuccess("");
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

  function catalogServiceIdForLine(it: DashboardBookingDetail["items"][number]): string | null {
    return it.catalogServiceId ?? it.serviceId;
  }

  function isBookableServiceLine(it: DashboardBookingDetail["items"][number]): boolean {
    return it.itemType === "SERVICE" || it.itemType === "SERVICE_VARIANT";
  }

  useEffect(() => {
    if (!lineStartItemId || !token || !detail) {
      return;
    }
    const it = detail.items.find((i) => i.id === lineStartItemId);
    if (!it || !isBookableServiceLine(it)) {
      setLineStartStaffOptions([]);
      return;
    }
    const sid = catalogServiceIdForLine(it);
    if (!sid) {
      setLineStartStaffOptions([]);
      setLineStartError("Cannot resolve a catalog service for this line.");
      return;
    }
    let cancelled = false;
    setLineStartLoading(true);
    setLineStartError("");
    const dateStr = detail.slot?.date ?? cairoTodayYmd();
    void getDashboardStaffAvailability(token, {
      branchId: detail.branchId,
      serviceId: sid,
      date: dateStr,
    })
      .then((res: DashboardStaffAvailabilityResponse) => {
        if (cancelled) return;
        setLineStartStaffOptions(res.staff);
        const pick =
          res.staff.find((s) => s.status === "AVAILABLE")?.staffProfileId ??
          res.staff.find((s) => s.status === "BUSY")?.staffProfileId ??
          "";
        setLineStartStaffPick(pick);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLineStartError(formatApiError(e));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLineStartLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [lineStartItemId, token, detail]);

  async function submitLineStartService(): Promise<void> {
    if (!token || !selectedBookingId || !lineStartItemId || !lineStartStaffPick) {
      return;
    }
    setLineStartSubmitting(true);
    setLineStartError("");
    try {
      await postDashboardBookingServiceItemStart(token, selectedBookingId, lineStartItemId, {
        staffProfileId: lineStartStaffPick,
      });
      setLineStartItemId(null);
      await loadDetail(selectedBookingId);
    } catch (e) {
      setLineStartError(formatApiError(e));
    } finally {
      setLineStartSubmitting(false);
    }
  }

  async function completeBookingLine(itemId: string): Promise<void> {
    if (!token || !selectedBookingId) {
      return;
    }
    setLineCompleteBusyId(itemId);
    setActionError("");
    try {
      await postDashboardBookingServiceItemComplete(token, selectedBookingId, itemId);
      await loadDetail(selectedBookingId);
    } catch (e) {
      setActionError(formatApiError(e));
    } finally {
      setLineCompleteBusyId(null);
    }
  }

  const loadDetailRef = useRef(loadDetail);
  loadDetailRef.current = loadDetail;

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
    if (!token || !drawerOpen || !detail || staffChangeType !== "RESCHEDULE") {
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(staffChangeDate)) {
      return;
    }
    let cancelled = false;
    setStaffChangeSlotsLoading(true);
    void getDashboardSlots(token, detail.branchId, {
      dateFrom: staffChangeDate,
      dateTo: staffChangeDate,
      page: 1,
      pageSize: 100,
    })
      .then((res) => {
        if (!cancelled) {
          setStaffChangeSlots(res.data);
          const firstOther = res.data.find((s) => s.id !== detail.slotId)?.id ?? "";
          setStaffChangeSlotId((prev) => {
            if (prev && res.data.some((s) => s.id === prev && s.id !== detail.slotId)) {
              return prev;
            }
            return firstOther;
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStaffChangeSlots([]);
          setStaffChangeSlotId("");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStaffChangeSlotsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, drawerOpen, detail, staffChangeType, staffChangeDate]);

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

  useEffect(() => {
    if (!token || !canRead) {
      return;
    }
    const raw = searchParams.get("bookingId")?.trim() ?? "";
    if (!raw || raw.length < 32) {
      return;
    }
    setDrawerOpen(true);
    setSelectedBookingId(raw);
    void loadDetailRef.current(raw);
    router.replace("/dashboard/bookings", { scroll: false });
  }, [canRead, router, searchParams, token]);

  async function submitStaffChangeRequest() {
    if (!token || !selectedBookingId || !staffChangeType) {
      return;
    }
    setStaffChangeSubmitting(true);
    setStaffChangeError("");
    setStaffChangeSuccess("");
    try {
      if (staffChangeType === "RESCHEDULE") {
        if (!staffChangeSlotId) {
          setStaffChangeError("Select a target slot for reschedule.");
          return;
        }
        await postDashboardCreateBookingChangeRequest(token, selectedBookingId, {
          requestType: "RESCHEDULE",
          requestedSlotId: staffChangeSlotId,
          reason: staffChangeReason.trim() || undefined,
        });
      } else {
        await postDashboardCreateBookingChangeRequest(token, selectedBookingId, {
          requestType: "CANCEL",
          reason: staffChangeReason.trim() || undefined,
        });
      }
      setStaffChangeSuccess(
        "Request recorded. A user with cancel or reschedule permission can approve it from Change Requests.",
      );
      setStaffChangeType("");
      setStaffChangeReason("");
      await loadList();
    } catch (requestError) {
      setStaffChangeError(formatApiError(requestError));
    } finally {
      setStaffChangeSubmitting(false);
    }
  }

  async function removeItem(itemId: string, itemName: string) {
    if (!token || !detail) {
      return;
    }
    const confirmed = await confirm({
      title: "Remove line item?",
      message: `Remove “${itemName}” from this booking? Pricing will be recalculated automatically.`,
      tone: "danger",
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
    });
    if (!confirmed) {
      return;
    }
    setRemovingItemId(itemId);
    setActionError("");
    try {
      await deleteDashboardBookingItem(token, detail.id, itemId);
      await Promise.all([loadList(), loadDetail(detail.id)]);
    } catch (requestError) {
      setActionError(formatApiError(requestError));
    } finally {
      setRemovingItemId("");
    }
  }

  async function checkInToQueue() {
    if (!token || !detail) {
      return;
    }
    setCheckInLoading(true);
    setActionError("");
    try {
      await postDashboardBookingQueueCheckIn(token, detail.id);
      await loadDetail(detail.id);
      await loadList();
    } catch (requestError) {
      setActionError(formatApiError(requestError));
    } finally {
      setCheckInLoading(false);
    }
  }

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
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-[#1F2420] md:text-3xl">Bookings</h1>
                  <Sparkles className="h-5 w-5 text-[#B9974A]" strokeWidth={1.75} aria-hidden />
                </div>
                {canCreateBooking ? (
                  <button
                    type="button"
                    onClick={() => setCreateDialogOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] shadow-sm transition hover:bg-[#0A3F35]"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    New booking
                  </button>
                ) : null}
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
                    const nextFrom = event.target.value;
                    setDateFrom(nextFrom);
                    if (nextFrom && dateTo && dateTo < nextFrom) {
                      setDateTo(nextFrom);
                    }
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
                  min={dateFrom || undefined}
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
                {detail ? (
                  <div className="mt-4 rounded-2xl border border-[#E8E0D4]/80 bg-[#FFFCF7] p-3">
                    <div className="grid gap-2 text-xs text-[#5E574C] sm:grid-cols-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#1F2420]">{detail.client?.fullName ?? "Unknown client"}</p>
                        <p className="mt-0.5 truncate">{detail.client?.phone ?? "No phone"}</p>
                      </div>
                      <div className="min-w-0 sm:text-right">
                        <p className="font-semibold text-[#1F2420]">{formatAppointmentFromDetail(detail)}</p>
                        <p className="mt-0.5 truncate">{branchNameById.get(detail.branchId) ?? detail.branchId}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#F0EBE3] pt-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7A6A58]">Remaining</p>
                        <p className="text-base font-semibold tabular-nums text-[#8B4428]">
                          {formatEGP(detail.remainingAmount)}
                        </p>
                      </div>
                      {drawerHasPrimaryActions ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          {canConfirm && drawerCanRequestDecision ? (
                            <button
                              type="button"
                              onClick={() => void triggerAction("confirm")}
                              disabled={actionLoading !== null}
                              className={primaryActionClass}
                            >
                              Confirm
                            </button>
                          ) : null}
                          {drawerCanQueueCheckIn ? (
                            <button
                              type="button"
                              onClick={() => void checkInToQueue()}
                              disabled={checkInLoading || actionLoading !== null || Boolean(detail.activeQueueEntryId)}
                              className={secondaryActionClass}
                            >
                              {checkInLoading ? "Checking in..." : detail.activeQueueEntryId ? "In queue" : "Check in"}
                            </button>
                          ) : null}
                          {canReject && drawerCanRequestDecision ? (
                            <button
                              type="button"
                              onClick={() => void triggerAction("reject")}
                              disabled={actionLoading !== null}
                              className={dangerOutlineClass}
                            >
                              Reject
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
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
                        Booking summary
                      </div>
                      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                        <div className="min-w-0 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3">
                          <p className="text-xs font-semibold text-[#7A6A58]">Client</p>
                          <p className="mt-1 truncate font-semibold text-[#1F2420]">
                            {detail.client?.fullName ?? "—"}
                          </p>
                          <p className="mt-1 truncate text-[#5E574C]">{detail.client?.phone ?? "Phone: —"}</p>
                          {detail.client?.email ? (
                            <p className="mt-1 truncate text-xs text-[#7A6A58]">{detail.client.email}</p>
                          ) : null}
                        </div>
                        <div className="min-w-0 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3">
                          <p className="text-xs font-semibold text-[#7A6A58]">Appointment</p>
                          <p className="mt-1 font-semibold text-[#1F2420]">{formatAppointmentFromDetail(detail)}</p>
                          <p className="mt-1 truncate text-[#5E574C]">
                            {branchNameById.get(detail.branchId) ?? detail.branchId}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-[#7A6A58]">
                        Created {formatDateTimeAmPm(detail.createdAt)} · Updated{" "}
                        {formatDateTimeAmPm(detail.updatedAt)}
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
                        (() => {
                          const removeBlockedByStatus = isTerminalBookingStatus(detail.status);
                          const removeBlockedByInvoice = Boolean(detail.finalizedInvoice);
                          const removeBlockedByLastItem = detail.items.length <= 1;
                          const canRemoveAny =
                            canUpdate && !removeBlockedByStatus && !removeBlockedByInvoice && !removeBlockedByLastItem;
                          return (
                            <>
                              <ul className="mt-3 space-y-2">
                                {detail.items.map((item) => {
                                  const lineSt = item.lineStatus ?? "PENDING";
                                  const sid = catalogServiceIdForLine(item);
                                  const showLineOps =
                                    isBookableServiceLine(item) &&
                                    Boolean(sid) &&
                                    !isTerminalBookingStatus(detail.status);
                                  return (
                                    <li
                                      key={item.id}
                                      className="flex flex-col gap-2 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] px-3 py-2.5"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium text-[#1F2420]">{item.nameSnapshot}</p>
                                          <p className="mt-1 text-xs text-[#7A6A58]">
                                            {item.itemType} · Qty {item.quantity} · {formatEGP(item.priceSnapshot)} ·{" "}
                                            {item.durationMinutesSnapshot} min
                                          </p>
                                          {showLineOps ? (
                                            <p className="mt-1 text-xs text-[#5C5348]">
                                              <span className="font-medium">Line status:</span> {lineSt}
                                              {item.staffDisplayName ? (
                                                <>
                                                  {" "}
                                                  · <span className="font-medium">Staff:</span> {item.staffDisplayName}
                                                </>
                                              ) : null}
                                              {item.startedAt ? (
                                                <>
                                                  {" "}
                                                  · Started {formatDateTimeAmPm(item.startedAt)}
                                                </>
                                              ) : null}
                                              {item.completedAt ? (
                                                <>
                                                  {" "}
                                                  · Completed {formatDateTimeAmPm(item.completedAt)}
                                                </>
                                              ) : null}
                                            </p>
                                          ) : null}
                                        </div>
                                        {canUpdate ? (
                                          <button
                                            type="button"
                                            aria-label={`Remove ${item.nameSnapshot}`}
                                            onClick={() => void removeItem(item.id, item.nameSnapshot)}
                                            disabled={
                                              !canRemoveAny ||
                                              removingItemId === item.id ||
                                              removingItemId !== "" ||
                                              actionLoading !== null
                                            }
                                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#E7B9A4]/80 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#8B4428] shadow-sm transition hover:bg-[#FFF1EC] disabled:cursor-not-allowed disabled:opacity-40"
                                          >
                                            {removingItemId === item.id ? (
                                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                            ) : (
                                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                            )}
                                            Remove
                                          </button>
                                        ) : null}
                                      </div>
                                      {showLineOps ? (
                                        <div className="flex flex-wrap gap-2 border-t border-[#F0EBE3] pt-2">
                                          {lineSt === "PENDING" && canStartServiceLine ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setLineStartError("");
                                                setLineStartItemId(item.id);
                                              }}
                                              className="inline-flex items-center rounded-lg border border-[#062A2D]/30 bg-[#EEF6F3] px-2.5 py-1.5 text-[11px] font-semibold text-[#0A3F35] hover:bg-[#E2F0EC]"
                                            >
                                              Start service
                                            </button>
                                          ) : null}
                                          {lineSt === "IN_PROGRESS" && canCompleteServiceLine ? (
                                            <button
                                              type="button"
                                              onClick={() => void completeBookingLine(item.id)}
                                              disabled={lineCompleteBusyId === item.id}
                                              className="inline-flex items-center rounded-lg bg-[#062A2D] px-2.5 py-1.5 text-[11px] font-semibold text-[#F6F2EA] disabled:opacity-50"
                                            >
                                              {lineCompleteBusyId === item.id ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                              ) : null}
                                              Complete service
                                            </button>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                              {canUpdate && !canRemoveAny ? (
                                <p className="mt-2 text-[11px] leading-relaxed text-[#B5A896]">
                                  {removeBlockedByStatus
                                    ? "Items are locked: this booking is in a terminal status."
                                    : removeBlockedByInvoice
                                      ? "Items are locked: a finalized invoice exists for this booking."
                                      : "At least one item must remain — cancel the booking instead of removing the last item."}
                                </p>
                              ) : null}
                            </>
                          );
                        })()
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
                        {detail.discountAmount > 0 && detail.discountReason ? (
                          <div className="rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] px-3 py-2">
                            <dt className="text-xs font-medium text-[#7A6A58]">Discount reason</dt>
                            <dd className="mt-1 text-sm leading-relaxed text-[#1F2420]">
                              {detail.discountReason}
                            </dd>
                          </div>
                        ) : null}
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
                      {detail.finalizedInvoice ? (
                        <div className="mt-3 border-t border-[#F0EBE3] pt-3">
                          <p className="text-xs text-[#7A6A58]">
                            Finalized invoice:{" "}
                            <span className="font-semibold text-[#1F2420]">
                              {detail.finalizedInvoice.invoiceNumber}
                            </span>
                          </p>
                          <Link
                            href={`/dashboard/invoices/${detail.finalizedInvoice.id}/receipt`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center rounded-xl border border-[#062A2D]/35 bg-white px-3 py-1.5 text-xs font-semibold text-[#062A2D] shadow-sm transition hover:bg-[#F7FBFA]"
                          >
                            Print Receipt
                          </Link>
                        </div>
                      ) : null}
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

                    {canUpdate ? (
                      <section className="rounded-2xl border border-[#E8E0D4]/70 bg-white p-4 shadow-sm ring-1 ring-[#F7F4EE]/80">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                          <ListTodo className="h-4 w-4 text-[#B9974A]" aria-hidden />
                          Request cancellation / reschedule
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-[#B5A896]">
                          Use this when reception needs approval before changing the booking. It appears on{" "}
                          <Link
                            href="/dashboard/booking-change-requests"
                            className="font-semibold text-[#062A2D] underline-offset-2 hover:underline"
                          >
                            Change Requests
                          </Link>{" "}
                          until someone with the right permission approves it.
                        </p>
                        <label className="mt-3 block text-xs font-medium text-[#7A6A58]">Request type</label>
                        <select
                          value={staffChangeType}
                          onChange={(e) =>
                            setStaffChangeType(e.target.value as "" | "CANCEL" | "RESCHEDULE")
                          }
                          className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
                        >
                          <option value="">Choose…</option>
                          <option value="CANCEL">Cancellation</option>
                          <option value="RESCHEDULE">Reschedule</option>
                        </select>
                        {staffChangeType === "RESCHEDULE" ? (
                          <div className="mt-3 space-y-2">
                            <label className="block text-xs font-medium text-[#7A6A58]">Target date</label>
                            <input
                              type="date"
                              value={staffChangeDate}
                              onChange={(e) => setStaffChangeDate(e.target.value)}
                              className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-[#B9974A]/50"
                            />
                            <label className="block text-xs font-medium text-[#7A6A58]">Target slot</label>
                            <select
                              value={staffChangeSlotId}
                              onChange={(e) => setStaffChangeSlotId(e.target.value)}
                              disabled={staffChangeSlotsLoading || staffChangeSlots.length === 0}
                              className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-[#B9974A]/50 disabled:opacity-60"
                            >
                              <option value="">
                                {staffChangeSlotsLoading
                                  ? "Loading…"
                                  : staffChangeSlots.length === 0
                                    ? "No slots"
                                    : "Select slot"}
                              </option>
                              {staffChangeSlots
                                .filter((s) => s.id !== detail.slotId)
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.date}{" "}
                                    {formatWallClockRange12h(s.startTime, s.endTime, " – ")} ({s.status})
                                  </option>
                                ))}
                            </select>
                          </div>
                        ) : null}
                        <label className="mt-3 block text-xs font-medium text-[#7A6A58]">
                          Reason / notes (optional)
                        </label>
                        <textarea
                          value={staffChangeReason}
                          onChange={(e) => setStaffChangeReason(e.target.value)}
                          rows={2}
                          className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-[#B9974A]/50"
                        />
                        <button
                          type="button"
                          disabled={
                            staffChangeSubmitting ||
                            !staffChangeType ||
                            (staffChangeType === "RESCHEDULE" && !staffChangeSlotId)
                          }
                          onClick={() => void submitStaffChangeRequest()}
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2 text-sm font-semibold text-[#062A2D] shadow-sm transition hover:border-[#B9974A]/45 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {staffChangeSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : null}
                          Submit change request
                        </button>
                        {staffChangeError ? (
                          <p className="mt-2 flex gap-2 text-sm text-[#8B4428]">
                            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                            {staffChangeError}
                          </p>
                        ) : null}
                        {staffChangeSuccess ? (
                          <p className="mt-2 rounded-xl border border-[#0E342B]/20 bg-[#E8F2EE] px-3 py-2 text-sm text-[#0E342B]">
                            {staffChangeSuccess}
                          </p>
                        ) : null}
                      </section>
                    ) : null}

                    <section className="rounded-2xl border border-[#E8E0D4]/70 bg-white p-4 shadow-sm ring-1 ring-[#F7F4EE]/80">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        More actions
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-[#B5A896]">
                        Secondary actions for this booking. The top of the drawer keeps the next most likely action
                        visible.
                      </p>

                      {(canConfirm || canReject) && drawerCanRequestDecision ? (
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
                                className={dangerOutlineClass}
                              >
                                Reject
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {canProgress && drawerCanMarkNoShow ? (
                        <div className="mt-3 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3">
                          <p className="text-xs font-semibold text-[#1F2420]">Appointment progress</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {drawerCanMarkNoShow ? (
                              <button
                                type="button"
                                onClick={() => void triggerAction("mark-no-show")}
                                disabled={actionLoading !== null}
                                className={dangerOutlineClass}
                              >
                                No-show
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {detail && drawerCanQueueCheckIn ? (
                        <div className="mt-3 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3">
                          <p className="text-xs font-semibold text-[#1F2420]">Queue</p>
                          <p className="mt-1 text-[0.7rem] leading-relaxed text-[#B5A896]">
                            Adds this booking to the operational queue. Confirmed or rescheduled bookings are also
                            marked arrived when applicable.
                          </p>
                          <div className="mt-2 flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => void checkInToQueue()}
                              disabled={
                                checkInLoading ||
                                actionLoading !== null ||
                                Boolean(detail.activeQueueEntryId)
                              }
                              className={secondaryActionClass}
                            >
                              {checkInLoading ? "Checking in…" : "Check in to Queue"}
                            </button>
                            {detail.activeQueueEntryId ? (
                              <p className="text-[0.7rem] text-[#7A6A58]">
                                Already in queue — complete or cancel the visit from{" "}
                                <Link href="/dashboard/queue" className="font-semibold underline underline-offset-2">
                                  Queue
                                </Link>
                                .
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {(canReschedule || canCancel) && drawerCanDirectChange ? (
                        <div className="mt-3 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3">
                          <p className="text-xs font-semibold text-[#1F2420]">Apply booking change now</p>
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
                                  disabled={actionLoading !== null || !rescheduleSlotId}
                                  className={secondaryActionClass}
                                >
                                  Reschedule
                                </button>
                                {canConfirm && detail.status === "RESCHEDULED" ? (
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

              {lineStartItemId && detail ? (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[#062A2D]/35 p-4 backdrop-blur-[1px]">
                  <div
                    className="w-full max-w-md rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7] p-5 shadow-xl"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Assign staff to start service"
                  >
                    <h3 className="text-base font-semibold text-[#062A2D]">Start service line</h3>
                    <p className="mt-1 text-xs text-[#7A6A58]">
                      {detail.items.find((i) => i.id === lineStartItemId)?.nameSnapshot ?? "Service"}
                    </p>
                    {lineStartLoading ? (
                      <p className="mt-4 flex items-center gap-2 text-sm text-[#7A6A58]">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Loading qualified staff…
                      </p>
                    ) : null}
                    <label className="mt-4 block text-xs font-medium text-[#7A6A58]">
                      Staff member
                      <select
                        className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm"
                        value={lineStartStaffPick}
                        onChange={(e) => setLineStartStaffPick(e.target.value)}
                      >
                        <option value="">Select…</option>
                        {lineStartStaffOptions.map((s) => (
                          <option key={s.staffProfileId} value={s.staffProfileId}>
                            {s.displayName} ({s.status}
                            {s.reason ? ` — ${s.reason}` : ""})
                          </option>
                        ))}
                      </select>
                    </label>
                    {lineStartError ? (
                      <p className="mt-3 flex gap-2 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-3 py-2 text-xs text-[#8B4428]">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                        {lineStartError}
                      </p>
                    ) : null}
                    <div className="mt-5 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setLineStartItemId(null)}
                        className="rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm font-semibold text-[#1F2420]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={lineStartSubmitting || lineStartLoading || !lineStartStaffPick}
                        onClick={() => void submitLineStartService()}
                        className="rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] disabled:opacity-50"
                      >
                        {lineStartSubmitting ? "Starting…" : "Start with selected staff"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        ) : null}

        {token && canCreateBooking ? (
          <DashboardCreateBookingDialog
            open={createDialogOpen}
            onClose={() => setCreateDialogOpen(false)}
            token={token}
            branches={branches}
            initialBranchId={branchId || user?.branchId || branches[0]?.id || ""}
            branchSelectDisabled={!canAccessMultipleBranches}
            onCreated={(created) => {
              setCreateDialogOpen(false);
              void loadList();
              openDrawer(created.id);
            }}
          />
        ) : null}
      </section>
    </PermissionGuard>
  );
}
