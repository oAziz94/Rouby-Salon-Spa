"use client";

import {
  ApiClientError,
  getDashboardBookings,
  type DashboardBookingsListItem,
} from "@rouby/api-client";
import { cairoTodayYmd, formatDayLabel, formatWallClock12h, formatWallClockRange12h } from "@rouby/wall-clock";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { bookingStatusLabel } from "@/lib/labels";

export type BookingsScheduleMode = "day" | "week";

const INACTIVE = new Set(["CANCELLED", "REJECTED", "NO_SHOW"]);

const STATUS_TONE: Record<string, string> = {
  PENDING: "border-[#E8D4A0] bg-[#FFF9ED] text-[#6B5420]",
  CONFIRMED: "border-[#0E342B]/25 bg-[#E8F2EE] text-[#0E342B]",
  RESCHEDULED: "border-[#B9974A]/45 bg-[#FBF6E8] text-[#5C4A18]",
  ARRIVED: "border-[#B9974A]/45 bg-[#FBF6E8] text-[#5C4A18]",
  IN_PROGRESS: "border-[#0E342B]/20 bg-[#E4EFE6] text-[#1A4D2E]",
  COMPLETED: "border-[#0E342B]/30 bg-[#DCEAE0] text-[#0E342B]",
};

function statusTone(status: string): string {
  return STATUS_TONE[status] ?? "border-[#E8E0D4] bg-[#F4F1EC] text-[#5E574C]";
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayName(ymd: string): string {
  return new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function monthDay(ymd: string): string {
  return new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function slotKey(row: DashboardBookingsListItem): string {
  return `${row.slot?.date ?? "9999-12-31"}T${row.slot?.startTime ?? "99:99"}`;
}

/** Every booking in a date range (the list endpoint pages at 100). */
async function loadRange(
  token: string,
  branchId: string,
  dateFrom: string,
  dateTo: string,
): Promise<DashboardBookingsListItem[]> {
  const all: DashboardBookingsListItem[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const res = await getDashboardBookings(token, {
      branchId: branchId || undefined,
      dateFrom,
      dateTo,
      page,
      pageSize: 100,
    });
    all.push(...res.data);
    if (all.length >= (res.meta?.totalItems ?? 0) || res.data.length === 0) break;
  }
  return all.sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
}

type Props = {
  token: string;
  branchId: string;
  mode: BookingsScheduleMode;
  onModeChange: (mode: BookingsScheduleMode) => void;
  onOpen: (bookingId: string) => void;
  /** YYYY-MM-DD to open on (links from the overview); today when absent. */
  initialDay?: string;
  /** Changes whenever the parent may have changed a booking (drawer closed, booking created). */
  reloadSignal: string | number;
};

/**
 * Bookings as a working schedule: one day ordered by time, or seven days at a glance.
 * Requests waiting for a decision sit on top whatever day is shown.
 */
export function BookingsSchedule({ token, branchId, mode, onModeChange, onOpen, initialDay, reloadSignal }: Props) {
  const today = cairoTodayYmd();
  const [day, setDay] = useState(() => (initialDay && /^\d{4}-\d{2}-\d{2}$/.test(initialDay) ? initialDay : today));
  const [rows, setRows] = useState<DashboardBookingsListItem[]>([]);
  const [pending, setPending] = useState<DashboardBookingsListItem[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const rangeEnd = mode === "week" ? addDays(day, 6) : day;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [range, waiting] = await Promise.all([
        loadRange(token, branchId, day, rangeEnd),
        getDashboardBookings(token, {
          branchId: branchId || undefined,
          status: "PENDING",
          dateFrom: today,
          page: 1,
          pageSize: 50,
        }),
      ]);
      setRows(range);
      setPending([...waiting.data].sort((a, b) => slotKey(a).localeCompare(slotKey(b))));
      setPendingTotal(waiting.meta?.totalItems ?? waiting.data.length);
    } catch (e) {
      setError(e instanceof ApiClientError || e instanceof Error ? e.message : "Could not load bookings.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, branchId, day, rangeEnd, today]);

  useEffect(() => {
    void load();
  }, [load, reloadSignal]);

  const visible = useMemo(
    () => (showInactive ? rows : rows.filter((r) => !INACTIVE.has(r.status))),
    [rows, showInactive],
  );
  const hiddenCount = rows.length - rows.filter((r) => !INACTIVE.has(r.status)).length;

  const byTime = useMemo(() => {
    const groups = new Map<string, DashboardBookingsListItem[]>();
    for (const r of visible) {
      const key = r.slot?.startTime ?? "";
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(day, i)), [day]);
  const step = mode === "week" ? 7 : 1;

  return (
    <div className="space-y-4">
      {pendingTotal > 0 ? (
        <section className="rounded-2xl border border-[#E8D4A0] bg-[#FFF9ED] p-4 shadow-sm">
          <p className="text-sm font-semibold text-[#6B5420]">
            {pendingTotal} request{pendingTotal === 1 ? "" : "s"} waiting for confirmation
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pending.slice(0, 12).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpen(r.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8D4A0] bg-white px-3 py-1.5 text-xs font-medium text-[#1F2420] shadow-sm transition hover:border-[#B9974A]"
              >
                {(r.staffWarnings?.length ?? 0) > 0 ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-[#B26A2A]" aria-label="Staff issue" />
                ) : null}
                {r.client?.fullName ?? "Client"} · {formatDayLabel(r.slot?.date)}
                {r.slot?.startTime ? ` · ${formatWallClock12h(r.slot.startTime)}` : ""}
              </button>
            ))}
            {pendingTotal > 12 ? (
              <span className="self-center text-xs text-[#6B5420]">+{pendingTotal - 12} more in the List tab</span>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0EBE3] pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDay(addDays(day, -step))}
              className="rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] p-2 text-[#1F2420] shadow-sm hover:border-[#B9974A]/45"
              aria-label={mode === "week" ? "Previous week" : "Previous day"}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDay(today)}
              className="rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2 text-xs font-semibold text-[#062A2D] shadow-sm hover:border-[#B9974A]/45"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDay(addDays(day, step))}
              className="rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] p-2 text-[#1F2420] shadow-sm hover:border-[#B9974A]/45"
              aria-label={mode === "week" ? "Next week" : "Next day"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2 text-sm text-[#1F2420] shadow-sm"
              aria-label="Go to date"
            />
            <p className="text-sm font-semibold text-[#1F2420]">
              {mode === "week"
                ? `${formatDayLabel(day)} – ${formatDayLabel(rangeEnd)}`
                : `${day === today ? "Today · " : ""}${formatDayLabel(day)}`}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#7A6A58]">
            <span>
              {visible.length} booking{visible.length === 1 ? "" : "s"}
            </span>
            {hiddenCount > 0 ? (
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Show {hiddenCount} cancelled / no-show
              </label>
            ) : null}
          </div>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 py-8 text-sm text-[#7A6A58]">
            <Loader2 className="h-4 w-4 animate-spin text-[#B9974A]" aria-hidden /> Loading…
          </p>
        ) : error ? (
          <p className="py-6 text-sm text-[#8B4428]">{error}</p>
        ) : mode === "day" ? (
          byTime.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#7A6A58]">No bookings on this day.</p>
          ) : (
            <ol className="divide-y divide-[#F7F4EE]">
              {byTime.map(([time, list]) => (
                <li key={time || "none"} className="flex gap-4 py-3">
                  <p className="w-20 shrink-0 pt-2 text-sm font-semibold tabular-nums text-[#062A2D]">
                    {time ? formatWallClock12h(time) : "No time"}
                  </p>
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((r) => (
                      <BookingCard key={r.id} row={r} onOpen={onOpen} />
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {weekDays.map((d) => {
              const list = visible.filter((r) => r.slot?.date === d);
              const waiting = list.filter((r) => r.status === "PENDING").length;
              const issues = list.filter((r) => (r.staffWarnings?.length ?? 0) > 0).length;
              return (
                <div
                  key={d}
                  className={`rounded-xl border p-3 ${d === today ? "border-[#B9974A]/60 bg-[#FBF6E8]" : "border-[#E8E0D4]/80 bg-[#FFFCF7]"}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setDay(d);
                      onModeChange("day");
                    }}
                    className="w-full text-left"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">{weekdayName(d)}</p>
                    <p className="text-sm font-semibold text-[#1F2420]">{monthDay(d)}</p>
                    <p className="mt-1 text-xs text-[#5E574C]">
                      {list.length} booking{list.length === 1 ? "" : "s"}
                      {waiting > 0 ? ` · ${waiting} pending` : ""}
                    </p>
                    {issues > 0 ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#B26A2A]">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {issues} staff issue{issues === 1 ? "" : "s"}
                      </p>
                    ) : null}
                  </button>
                  <ul className="mt-2 space-y-1">
                    {list.slice(0, 8).map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => onOpen(r.id)}
                          className={`w-full truncate rounded-lg border px-2 py-1 text-left text-[11px] ${statusTone(r.status)}`}
                          title={`${r.client?.fullName ?? ""} — ${r.servicesSummary ?? ""}`}
                        >
                          {r.slot?.startTime ? formatWallClock12h(r.slot.startTime) : ""} {r.client?.fullName ?? "Client"}
                        </button>
                      </li>
                    ))}
                    {list.length > 8 ? <li className="text-[11px] text-[#7A6A58]">+{list.length - 8} more</li> : null}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function BookingCard({ row, onOpen }: { row: DashboardBookingsListItem; onOpen: (id: string) => void }) {
  const warnings = row.staffWarnings ?? [];
  return (
    <button
      type="button"
      onClick={() => onOpen(row.id)}
      className={`rounded-xl border p-3 text-left shadow-sm transition hover:shadow ${statusTone(row.status)} ${INACTIVE.has(row.status) ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-[#1F2420]">{row.client?.fullName ?? "Client"}</p>
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide">{bookingStatusLabel(row.status)}</span>
      </div>
      <p className="mt-0.5 text-xs tabular-nums text-[#5E574C]">
        {row.slot ? formatWallClockRange12h(row.slot.startTime, row.slot.endTime) : ""}
        {row.client?.phone ? ` · ${row.client.phone}` : ""}
      </p>
      <p className="mt-1 line-clamp-2 text-xs text-[#1F2420]">{row.servicesSummary ?? "—"}</p>
      {warnings.length > 0 ? (
        <p className="mt-2 flex items-start gap-1 text-[11px] font-medium text-[#B26A2A]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{warnings.join(" · ")}</span>
        </p>
      ) : null}
    </button>
  );
}
