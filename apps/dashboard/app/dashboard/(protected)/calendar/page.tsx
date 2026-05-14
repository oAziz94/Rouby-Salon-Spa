"use client";

import {
  getDashboardBookings,
  getDashboardBranches,
  getDashboardSlots,
  type DashboardBookingsListItem,
  type DashboardBranch,
  type DashboardSlot,
  type DashboardSlotStatus,
} from "@rouby/api-client";
import { formatWallClockRange12h } from "@rouby/wall-clock";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type PageState = "loading" | "loaded" | "empty" | "error";

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

const SLOT_STATUS_STYLES: Record<DashboardSlotStatus, string> = {
  AVAILABLE: "border border-[#0E342B]/20 bg-[#E8F2EE] text-[#0E342B]",
  PENDING: "border border-[#E8D4A0]/80 bg-[#FFF9ED] text-[#6B5420]",
  FILLED: "border border-[#B9974A]/45 bg-[#FBF6E8] text-[#5C4A18]",
  BLOCKED: "border border-[#E8E0D4] bg-[#F4F1EC] text-[#5E574C]",
  CLOSED: "border border-[#D4D0C8] bg-[#EEEBE6] text-[#4A453D]",
};

function todayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isValidYmd(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, mo, da] = value.split("-").map(Number);
  const dt = new Date(y, mo - 1, da);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === da;
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, mo, da] = ymd.split("-").map(Number);
  const d = new Date(y, mo - 1, da);
  d.setDate(d.getDate() + delta);
  const yy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function bookingStatusClass(status: string): string {
  return BOOKING_STATUS_STYLES[status] ?? "border border-[#E8E0D4] bg-[#F8F4EC] text-[#4A3C2F]";
}

function slotStatusClass(status: DashboardSlotStatus): string {
  return SLOT_STATUS_STYLES[status] ?? "border border-[#E8E0D4] bg-[#F4F1EC] text-[#5E574C]";
}

function formatEGP(amount: number): string {
  return `EGP ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatBookingRef(id: string): string {
  const tail = id.replace(/-/g, "").slice(-8).toUpperCase();
  return `RB-${tail}`;
}

function mergeBookingsIntoSlots(
  slots: DashboardSlot[],
  bookings: DashboardBookingsListItem[],
): {
  slotRows: Array<{ slot: DashboardSlot; bookings: DashboardBookingsListItem[] }>;
  unmatched: DashboardBookingsListItem[];
} {
  const slotIds = new Set(slots.map((s) => s.id));
  const bySlot = new Map<string, DashboardBookingsListItem[]>();
  for (const s of slots) {
    bySlot.set(s.id, []);
  }
  const unmatched: DashboardBookingsListItem[] = [];
  for (const b of bookings) {
    if (b.slotId && slotIds.has(b.slotId)) {
      bySlot.get(b.slotId)!.push(b);
    } else {
      unmatched.push(b);
    }
  }
  const slotRows = slots.map((slot) => ({
    slot,
    bookings: (bySlot.get(slot.id) ?? []).sort((a, c) =>
      (a.createdAt ?? "").localeCompare(c.createdAt ?? ""),
    ),
  }));
  return { slotRows, unmatched };
}

function groupBookingsOnlyByTime(bookings: DashboardBookingsListItem[]): Array<{
  key: string;
  label: string;
  bookings: DashboardBookingsListItem[];
}> {
  const map = new Map<string, DashboardBookingsListItem[]>();
  for (const b of bookings) {
    const start = b.slot?.startTime ?? "—";
    const end = b.slot?.endTime ?? "";
    const key = `${start}|${end}`;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(b);
  }
  return Array.from(map.entries())
    .map(([key, list]) => {
      const [start, end] = key.split("|");
      const label =
        start !== "—" && end
          ? formatWallClockRange12h(start, end)
          : start !== "—"
            ? start
            : "Time not set";
      return { key, label, bookings: list };
    })
    .sort((a, c) => a.key.localeCompare(c.key));
}

function CalendarPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { token, user, hasPermission } = useDashboardAuth();

  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [bookings, setBookings] = useState<DashboardBookingsListItem[]>([]);
  const [slots, setSlots] = useState<DashboardSlot[]>([]);
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string>("");
  const [slotsError, setSlotsError] = useState<string>("");
  const [bookingsTruncated, setBookingsTruncated] = useState(false);
  const [slotsTruncated, setSlotsTruncated] = useState(false);

  const canReadBookings = hasPermission("bookings.read");
  const canReadSlots = hasPermission("slots.read");
  const canReadBranches = hasPermission("branches.read");
  const canViewClientContact = hasPermission("clients.contact.view");

  const canAccessMultipleBranches = useMemo(
    () => user?.branchId === null && canReadBranches,
    [canReadBranches, user?.branchId],
  );

  const dateParam = searchParams.get("date");
  const selectedDate = useMemo(() => {
    if (dateParam && isValidYmd(dateParam)) {
      return dateParam;
    }
    return todayYmd();
  }, [dateParam]);

  const setSelectedDate = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (isValidYmd(next)) {
        params.set("date", next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!token || !canReadBookings) {
      return;
    }
    if (canReadBranches) {
      getDashboardBranches(token)
        .then((list) => {
          setBranches(list);
          if (!branchId) {
            setBranchId(user?.branchId ?? list[0]?.id ?? "");
          }
        })
        .catch(() => {
          const fallback = user?.branchId ?? "";
          if (fallback) {
            setBranchId(fallback);
          }
          setBranches([]);
        });
      return;
    }
    if (!branchId && user?.branchId) {
      setBranchId(user.branchId);
    }
  }, [branchId, canReadBookings, canReadBranches, token, user?.branchId]);

  const loadSchedule = useCallback(async () => {
    if (!token || !canReadBookings) {
      return;
    }
    if (!branchId && canAccessMultipleBranches) {
      setBookings([]);
      setSlots([]);
      setBookingsTruncated(false);
      setSlotsTruncated(false);
      setSlotsError("");
      setState("empty");
      return;
    }
    if (!selectedDate) {
      return;
    }

    setState("loading");
    setError("");
    setSlotsError("");

    try {
      const bookingsRes = await getDashboardBookings(token, {
        branchId: branchId || undefined,
        status: status || undefined,
        dateFrom: selectedDate,
        dateTo: selectedDate,
        page: 1,
        pageSize: 100,
      });

      const bRows = Array.isArray(bookingsRes.data) ? bookingsRes.data : [];
      setBookings(bRows);
      setBookingsTruncated(Boolean(bookingsRes.meta?.hasNextPage));

      let sRows: DashboardSlot[] = [];
      let nextSlotsTruncated = false;
      if (canReadSlots && branchId) {
        try {
          const slotsRes = await getDashboardSlots(token, branchId, {
            page: 1,
            pageSize: 100,
            dateFrom: selectedDate,
            dateTo: selectedDate,
          });
          sRows = Array.isArray(slotsRes.data) ? slotsRes.data : [];
          nextSlotsTruncated = Boolean(slotsRes.meta?.hasNextPage);
          setSlotsError("");
        } catch (slotErr) {
          setSlotsError(
            slotErr instanceof Error
              ? slotErr.message
              : "Could not load slots for this day. Bookings are still shown.",
          );
          sRows = [];
          nextSlotsTruncated = false;
        }
      }
      setSlots(sRows);
      setSlotsTruncated(nextSlotsTruncated);

      const hasAnything = bRows.length > 0 || (canReadSlots && sRows.length > 0);
      setState(hasAnything ? "loaded" : "empty");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Failed to load schedule.",
      );
      setState("error");
    }
  }, [
    branchId,
    canAccessMultipleBranches,
    canReadBookings,
    canReadSlots,
    selectedDate,
    status,
    token,
  ]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const { slotRows, unmatched } = useMemo(
    () => mergeBookingsIntoSlots(slots, bookings),
    [slots, bookings],
  );

  const bookingsOnlyGroups = useMemo(
    () => (!canReadSlots ? groupBookingsOnlyByTime(bookings) : []),
    [bookings, canReadSlots],
  );

  function goDay(delta: number): void {
    setSelectedDate(addDaysYmd(selectedDate, delta));
  }

  function goToday(): void {
    setSelectedDate(todayYmd());
  }

  const longDateLabel = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [selectedDate]);

  const isToday = selectedDate === todayYmd();

  return (
    <PermissionGuard permission="bookings.read">
      <section className="space-y-6 md:space-y-8">
        <header className="rounded-2xl bg-white/90 p-6 shadow-[0_8px_30px_rgba(31,36,32,0.05)] ring-1 ring-[#E8E0D4]/70 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-[#1F2420] md:text-3xl">
                  Calendar
                </h1>
                <Sparkles className="h-5 w-5 text-[#B9974A]" strokeWidth={1.75} aria-hidden />
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#7A6A58] md:text-base">
                Read-only daily view of slots and appointment bookings.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/slots"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-1.5 text-xs font-medium text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45 hover:text-[#062A2D] md:text-sm"
              >
                Slot management
                <ExternalLink className="h-3.5 w-3.5 opacity-70" strokeWidth={1.75} aria-hidden />
              </Link>
              <Link
                href="/dashboard/bookings"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#062A2D]/20 bg-[#062A2D] px-3 py-1.5 text-xs font-medium text-[#F6F2EA] shadow-sm transition hover:bg-[#0A3F35] md:text-sm"
              >
                Bookings
                <ExternalLink className="h-3.5 w-3.5 opacity-80" strokeWidth={1.75} aria-hidden />
              </Link>
            </div>
          </div>
        </header>

        <section className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => goDay(-1)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45"
                aria-label="Previous day"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </button>
              <button
                type="button"
                onClick={goToday}
                disabled={isToday}
                className="rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-xs font-semibold text-[#062A2D] shadow-sm transition hover:border-[#B9974A]/45 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => goDay(1)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45"
                aria-label="Next day"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </button>
              <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-[#7A6A58] sm:ml-1">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  Date
                </span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isValidYmd(v)) {
                      setSelectedDate(v);
                    }
                  }}
                  className="rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2 text-sm text-[#1F2420] outline-none transition focus:border-[#B9974A]/60"
                />
              </label>
            </div>
            <p className="text-sm font-medium text-[#1F2420] lg:text-right">{longDateLabel}</p>
          </div>

          <div className="mt-6 grid gap-4 border-t border-[#F0EBE3] pt-6 sm:grid-cols-2 lg:grid-cols-3">
            {canAccessMultipleBranches ? (
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Branch</span>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2.5 text-sm text-[#1F2420] outline-none transition focus:border-[#B9974A]/60"
                >
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Branch</span>
                <div className="rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2.5 text-[#7A6A58]">
                  {branches.find((b) => b.id === branchId)?.name ?? "Assigned branch"}
                </div>
              </div>
            )}

            <label className="text-sm sm:col-span-2 lg:col-span-1">
              <span className="mb-1 block font-medium text-[#1F2420]">Booking status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2.5 text-sm text-[#1F2420] outline-none transition focus:border-[#B9974A]/60"
              >
                <option value="">All statuses</option>
                {Object.keys(BOOKING_STATUS_STYLES).map((value) => (
                  <option key={value} value={value}>
                    {value.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {!canReadSlots ? (
          <p className="rounded-2xl border border-dashed border-[#E4DDD0] bg-[#FFFCF7]/60 px-4 py-3 text-sm text-[#7A6A58]">
            You do not have <span className="font-medium text-[#1F2420]">slots.read</span>. Showing
            bookings on a simple timeline. For slot capacity and status, ask an administrator or open{" "}
            <Link href="/dashboard/slots" className="font-medium text-[#B9974A] underline">
              Slot management
            </Link>{" "}
            if you gain access.
          </p>
        ) : slotsError ? (
          <p className="rounded-2xl border border-[#E7B9A4]/60 bg-[#FFF1EC] px-4 py-3 text-sm text-[#8B4428]">
            {slotsError}
          </p>
        ) : null}

        {(bookingsTruncated || slotsTruncated) && state !== "loading" ? (
          <p className="rounded-2xl border border-[#E6DCCB] bg-[#FFF9EE] px-4 py-3 text-sm text-[#7A6A58]">
            Results may be truncated at 100 {bookingsTruncated ? "bookings" : ""}
            {bookingsTruncated && slotsTruncated ? " and " : ""}
            {slotsTruncated ? "slots" : ""} for this day. Narrow filters or use Slots / Bookings pages
            for full lists.
          </p>
        ) : null}

        {state === "loading" && !(canAccessMultipleBranches && !branchId) ? (
          <section className="flex items-center gap-3 rounded-2xl bg-white p-8 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
            <Loader2 className="h-5 w-5 animate-spin text-[#B9974A]" aria-hidden />
            <p className="text-sm text-[#7A6A58]">Loading slots and bookings…</p>
          </section>
        ) : null}

        {state === "error" && !(canAccessMultipleBranches && !branchId) ? (
          <section className="rounded-2xl border border-[#E7B9A4]/70 bg-[#FFF1EC] p-6 shadow-sm">
            <p className="text-sm text-danger">{error}</p>
            <button
              type="button"
              onClick={() => void loadSchedule()}
              className="mt-4 rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm font-semibold text-[#062A2D] shadow-sm transition hover:border-[#B9974A]/45"
            >
              Retry
            </button>
          </section>
        ) : null}

        {canAccessMultipleBranches && !branchId ? (
          <section className="rounded-2xl bg-white p-8 text-center shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
            <p className="text-sm text-[#7A6A58]">Select a branch to load the schedule.</p>
          </section>
        ) : null}

        {!(canAccessMultipleBranches && !branchId) && state === "empty" ? (
          <section className="rounded-2xl bg-white p-8 text-center shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
            <p className="text-sm text-[#7A6A58]">No slots or bookings for this date.</p>
          </section>
        ) : null}

        {state === "loaded" && canReadSlots ? (
          <div className="space-y-4">
            {slotRows.map(({ slot, bookings: inner }) => {
              const timeLabel = formatWallClockRange12h(slot.startTime, slot.endTime);
              return (
                <article
                  key={slot.id}
                  className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60"
                >
                  <div className="flex flex-col gap-4 border-b border-[#F0EBE3] bg-gradient-to-r from-[#FFFCF7] to-white p-5 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-lg font-semibold tracking-tight text-[#1F2420]">
                        {timeLabel}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${slotStatusClass(
                            slot.status,
                          )}`}
                        >
                          {slot.status}
                        </span>
                        <span className="inline-flex rounded-full border border-[#E8E0D4] bg-white px-2.5 py-0.5 text-xs font-medium text-[#5E574C]">
                          Booked {slot.bookedCount} · Capacity {slot.capacity}
                        </span>
                        <span className="inline-flex rounded-full border border-[#E8E0D4] bg-white px-2.5 py-0.5 text-xs font-medium text-[#5E574C]">
                          Live {slot.liveBookingsCount}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            slot.isOnlineBookable
                              ? "border border-[#0E342B]/20 bg-[#E8F2EE] text-[#0E342B]"
                              : "border border-[#E8E0D4] bg-[#F4F1EC] text-[#5E574C]"
                          }`}
                        >
                          {slot.isOnlineBookable ? "Online bookable" : "Not online"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 p-5">
                    {inner.length === 0 ? (
                      <p className="rounded-xl bg-[#F6F9F7] px-4 py-3 text-sm font-medium text-[#355032]">
                        Available — no booking in this slot.
                      </p>
                    ) : (
                      inner.map((row) => (
                        <div
                          key={row.id}
                          className="rounded-xl border border-[#F0EBE3] bg-[#FFFCF7]/50 p-4 shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-[#1F2420]">
                                {row.client?.fullName?.trim() || "Client"}
                              </p>
                              {canViewClientContact && row.client?.phone?.trim() ? (
                                <p className="mt-0.5 text-xs text-[#7A6A58]">{row.client.phone}</p>
                              ) : null}
                              {!canViewClientContact ? (
                                <p className="mt-0.5 text-xs text-[#B5A896]">Phone hidden for your role.</p>
                              ) : null}
                              <p className="mt-2 text-sm text-[#5E574C]">
                                {row.servicesSummary ?? row.itemsPreview?.map((i) => i.nameSnapshot).join(", ") ?? "—"}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${bookingStatusClass(
                                  row.status,
                                )}`}
                              >
                                {row.status.replace(/_/g, " ")}
                              </span>
                              <p className="text-xs font-medium text-[#062A2D]">
                                {formatEGP(row.totalAmount)}
                              </p>
                              <Link
                                href={`/dashboard/bookings?bookingId=${row.id}`}
                                className="text-xs font-semibold text-[#B9974A] underline-offset-2 hover:underline"
                              >
                                Open booking ({formatBookingRef(row.id)})
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              );
            })}

            {unmatched.length > 0 ? (
              <section className="rounded-2xl border border-dashed border-[#D4C4A8] bg-[#FFFCF7]/80 p-6 shadow-sm">
                <h2 className="text-base font-semibold text-[#1F2420]">
                  Bookings without slot details
                </h2>
                <p className="mt-1 text-sm text-[#7A6A58]">
                  These bookings could not be matched to a loaded slot (missing slot id, deleted
                  slot, or outside the first 100 slots returned).
                </p>
                <ul className="mt-4 space-y-3">
                  {unmatched.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-xl border border-[#E8E0D4] bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[#1F2420]">
                            {row.client?.fullName?.trim() || "Client"}
                          </p>
                          <p className="text-xs text-[#7A6A58]">
                            {row.slot
                              ? formatWallClockRange12h(row.slot.startTime, row.slot.endTime)
                              : "Time —"}
                          </p>
                        </div>
                        <Link
                          href={`/dashboard/bookings?bookingId=${row.id}`}
                          className="text-xs font-semibold text-[#B9974A] underline-offset-2 hover:underline"
                        >
                          Open booking
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        {state === "loaded" && !canReadSlots ? (
          <div className="space-y-4">
            {bookingsOnlyGroups.map((g) => (
              <article
                key={g.key}
                className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60"
              >
                <h2 className="text-base font-semibold text-[#1F2420]">{g.label}</h2>
                <ul className="mt-3 space-y-3">
                  {g.bookings.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-xl border border-[#F0EBE3] bg-[#FFFCF7]/50 p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-[#1F2420]">
                            {row.client?.fullName?.trim() || "Client"}
                          </p>
                          {canViewClientContact && row.client?.phone?.trim() ? (
                            <p className="mt-0.5 text-xs text-[#7A6A58]">{row.client.phone}</p>
                          ) : null}
                          <p className="mt-2 text-sm text-[#5E574C]">{row.servicesSummary ?? "—"}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${bookingStatusClass(
                              row.status,
                            )}`}
                          >
                            {row.status.replace(/_/g, " ")}
                          </span>
                          <p className="text-xs font-medium text-[#062A2D]">{formatEGP(row.totalAmount)}</p>
                          <Link
                            href={`/dashboard/bookings?bookingId=${row.id}`}
                            className="text-xs font-semibold text-[#B9974A] underline-offset-2 hover:underline"
                          >
                            Open booking
                          </Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </PermissionGuard>
  );
}

function CalendarFallback() {
  return (
    <section className="flex min-h-[40vh] items-center justify-center rounded-2xl bg-white/90 p-8 shadow-[0_8px_30px_rgba(31,36,32,0.05)] ring-1 ring-[#E8E0D4]/70">
      <div className="flex items-center gap-3 text-[#7A6A58]">
        <Loader2 className="h-5 w-5 animate-spin text-[#B9974A]" aria-hidden />
        <p className="text-sm">Loading calendar…</p>
      </div>
    </section>
  );
}

export default function DashboardCalendarPage() {
  return (
    <Suspense fallback={<CalendarFallback />}>
      <CalendarPageInner />
    </Suspense>
  );
}
