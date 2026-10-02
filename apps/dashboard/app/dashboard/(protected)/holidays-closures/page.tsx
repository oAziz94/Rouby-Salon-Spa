"use client";

import {
  ApiClientError,
  createDashboardClosure,
  deleteDashboardClosure,
  ensureDashboardSlotHorizon,
  getDashboardBranches,
  getDashboardClosures,
  previewDashboardClosure,
  type DashboardBranch,
  type DashboardBranchClosure,
  type DashboardClosureAffectedBooking,
  type DashboardSlotHorizonStatus,
} from "@rouby/api-client";
import { cairoTodayYmd, formatWallClock12h } from "@rouby/wall-clock";
import { AlertTriangle, CalendarOff, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useSystemDialog } from "@/components/system-dialog-provider";
import { useDashboardAuth } from "@/lib/dashboard-auth";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? ymd : DAY_FORMAT.format(d);
}

function formatRange(start: string, end: string): string {
  return start === end ? formatDay(start) : `${formatDay(start)} → ${formatDay(end)}`;
}

function dayCount(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00.000Z`).getTime();
  const b = new Date(`${end}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

function AffectedList({ bookings }: { bookings: DashboardClosureAffectedBooking[] }) {
  if (bookings.length === 0) return null;
  return (
    <ul className="mt-2 divide-y divide-[#F0E3DA] rounded-xl border border-[#F0E3DA] bg-white text-sm">
      {bookings.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span className="min-w-0">
            <span className="font-medium text-[#1F2420]">{b.client?.fullName ?? "Client"}</span>
            {b.client?.phone ? <span className="text-[#7A6A58]"> · {b.client.phone}</span> : null}
          </span>
          <span className="flex items-center gap-3 text-xs text-[#7A6A58]">
            {formatDay(b.slot.date)} · {formatWallClock12h(b.slot.startTime)}
            <Link
              href={`/dashboard/bookings?bookingId=${b.id}`}
              className="font-semibold text-[#062A2D] underline"
            >
              Open
            </Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function HolidaysClosuresPage() {
  const { token, hasPermission, user } = useDashboardAuth();
  const { confirm } = useSystemDialog();
  const canManage = hasPermission("slots.status.manage");
  const canFill = hasPermission("slots.create");
  const canReadBranches = hasPermission("branches.read");

  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [closures, setClosures] = useState<DashboardBranchClosure[]>([]);
  const [horizon, setHorizon] = useState<DashboardSlotHorizonStatus | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [filling, setFilling] = useState(false);

  const today = cairoTodayYmd();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token || !canReadBranches) return;
    let cancelled = false;
    void getDashboardBranches(token)
      .then((b) => {
        if (!cancelled) setBranches(Array.isArray(b) ? b : []);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, canReadBranches]);

  useEffect(() => {
    if (branchId) return;
    if (user?.branchId) {
      setBranchId(user.branchId);
      return;
    }
    if (branches[0]?.id) setBranchId(branches[0].id);
  }, [user?.branchId, branches, branchId]);

  const load = useCallback(async () => {
    if (!token || !branchId) return;
    setError("");
    try {
      const res = await getDashboardClosures(token, branchId, { includePast: showPast });
      setClosures(res.data);
      setHorizon(res.horizon);
      setPhase("ready");
    } catch (e) {
      setError(formatApiError(e));
      setPhase("error");
    }
  }, [token, branchId, showPast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !branchId || !canManage) return;
    setFormError("");
    setNotice("");
    if (!reason.trim()) {
      setFormError("Give the closure a name, for example “Eid al-Fitr”.");
      return;
    }
    if (endDate < startDate) {
      setFormError("The last day cannot be before the first day.");
      return;
    }
    const payload = { startDate, endDate, reason: reason.trim() };
    setSaving(true);
    try {
      const preview = await previewDashboardClosure(token, branchId, payload);
      const days = dayCount(startDate, endDate);
      const lines = [
        `${days} day${days === 1 ? "" : "s"}: ${formatRange(startDate, endDate)}.`,
        `${preview.openSlotCount} open time slot${preview.openSlotCount === 1 ? "" : "s"} will be closed and hidden from online booking.`,
        preview.affectedBookings.length > 0
          ? `${preview.affectedBookings.length} client appointment${preview.affectedBookings.length === 1 ? " is" : "s are"} already booked on these days. They are NOT cancelled automatically — you will get the list to call and reschedule.`
          : "No client appointments are booked on these days.",
      ];
      const ok = await confirm({
        title: `Close for “${payload.reason}”?`,
        message: lines.join("\n\n"),
        confirmLabel: "Close these days",
        tone: preview.affectedBookings.length > 0 ? "danger" : "default",
      });
      if (!ok) return;
      const created = await createDashboardClosure(token, branchId, payload);
      setReason("");
      setNotice(
        created.affectedBookings.length > 0
          ? `Closure saved. ${created.affectedBookings.length} appointment(s) need rescheduling — listed below.`
          : "Closure saved.",
      );
      await load();
    } catch (e) {
      setFormError(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }

  async function onRemove(closure: DashboardBranchClosure) {
    if (!token || !branchId) return;
    const ok = await confirm({
      title: "Reopen these days?",
      message: `Remove “${closure.reason}” (${formatRange(closure.startDate, closure.endDate)})? Its time slots are reopened and become bookable again.`,
      confirmLabel: "Reopen",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(closure.id);
    setNotice("");
    try {
      const res = await deleteDashboardClosure(token, branchId, closure.id);
      setNotice(
        `Closure removed: ${res.reopenedSlots} slot(s) reopened, ${res.createdSlots} new slot(s) added.`,
      );
      await load();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusyId("");
    }
  }

  async function onFillHorizon() {
    if (!token || !branchId) return;
    setFilling(true);
    setNotice("");
    setError("");
    try {
      const res = await ensureDashboardSlotHorizon(token, branchId);
      setHorizon(res.status);
      setNotice(
        res.createdCount > 0
          ? `${res.createdCount} slot(s) added through ${formatDay(res.dateTo)}.`
          : "Slots are already filled through the horizon.",
      );
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setFilling(false);
    }
  }

  const needsReschedule = closures
    .filter((c) => c.state !== "PAST")
    .reduce((n, c) => n + c.affectedBookings.length, 0);

  return (
    <PermissionGuard permission="slots.read">
      <section className="space-y-6">
        <header className="rounded-2xl border border-[#E8E0D4] bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Holidays &amp; Closures</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#7A6A58]">
                Days the salon takes no appointments. Closed days disappear from online booking and
                no new time slots are created for them. Walk-ins are not affected.
              </p>
            </div>
            {branches.length > 1 ? (
              <label className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                Branch
                <select
                  value={branchId}
                  onChange={(e) => {
                    setPhase("loading");
                    setBranchId(e.target.value);
                  }}
                  className="mt-1 block rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm font-normal normal-case text-[#1F2420]"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </header>

        {horizon ? (
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm ${
              !horizon.autoGenerationConfigured || horizon.low
                ? "border-amber-200 bg-amber-50/80"
                : "border-[#E8E0D4] bg-white"
            }`}
          >
            <div className="flex items-start gap-2 text-sm">
              {!horizon.autoGenerationConfigured || horizon.low ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
              ) : null}
              <div>
                <p className="font-semibold text-[#1F2420]">
                  {horizon.lastSlotDate
                    ? `Clients can book through ${formatDay(horizon.lastSlotDate)} (${horizon.daysAhead} day${horizon.daysAhead === 1 ? "" : "s"} ahead)`
                    : "There are no bookable time slots from today onwards"}
                </p>
                <p className="mt-0.5 text-xs text-[#7A6A58]">
                  {horizon.autoGenerationConfigured ? (
                    <>
                      New days are added automatically every night, {horizon.horizonDays} days ahead, from the{" "}
                      <Link href="/dashboard/settings/slots" className="underline">
                        slot defaults
                      </Link>
                      .
                    </>
                  ) : (
                    <>
                      Automatic slots are off until the working days and hours are saved in{" "}
                      <Link href="/dashboard/settings/slots" className="font-semibold underline">
                        slot defaults
                      </Link>
                      .
                    </>
                  )}
                </p>
              </div>
            </div>
            {canFill && horizon.autoGenerationConfigured ? (
              <button
                type="button"
                onClick={() => void onFillHorizon()}
                disabled={filling}
                className="inline-flex items-center gap-2 rounded-xl border border-[#D8CBB8] bg-white px-3 py-2 text-xs font-semibold text-[#1F2420] shadow-sm hover:border-[#B9974A]/60 disabled:opacity-50"
              >
                {filling ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                Fill missing days now
              </button>
            ) : null}
          </div>
        ) : null}

        {notice ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] px-4 py-3 text-sm text-[#8B4428]">{error}</p>
        ) : null}

        {canManage ? (
          <form onSubmit={(e) => void onSubmit(e)} className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[#1F2420]">
              <Plus className="h-4 w-4 text-[#B9974A]" aria-hidden />
              Add a closure
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
              <label className="text-xs font-medium text-[#7A6A58]">
                First day
                <input
                  type="date"
                  value={startDate}
                  min={today}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (endDate < e.target.value) setEndDate(e.target.value);
                  }}
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2 text-sm text-[#1F2420]"
                />
              </label>
              <label className="text-xs font-medium text-[#7A6A58]">
                Last day
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2 text-sm text-[#1F2420]"
                />
              </label>
              <label className="text-xs font-medium text-[#7A6A58]">
                Name / reason
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Eid al-Fitr, renovation, staff training"
                  maxLength={120}
                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2 text-sm text-[#1F2420]"
                />
              </label>
              <button
                type="submit"
                disabled={saving || !branchId}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] shadow-sm hover:bg-[#0A3F35] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarOff className="h-4 w-4" aria-hidden />}
                Review &amp; close
              </button>
            </div>
            {formError ? <p className="mt-3 text-sm text-[#8B4428]">{formError}</p> : null}
          </form>
        ) : null}

        <div className="rounded-2xl border border-[#E8E0D4] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[#1F2420]">
              {showPast ? "All closures" : "Current & upcoming closures"}
              {needsReschedule > 0 ? (
                <span className="ml-2 rounded-full bg-[#FFF1EC] px-2 py-0.5 text-[0.7rem] font-semibold text-[#8B4428]">
                  {needsReschedule} appointment{needsReschedule === 1 ? "" : "s"} to reschedule
                </span>
              ) : null}
            </h2>
            <label className="flex items-center gap-2 text-xs text-[#7A6A58]">
              <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
              Show past
            </label>
          </div>

          {phase === "loading" ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-[#7A6A58]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading…
            </p>
          ) : null}
          {phase === "ready" && closures.length === 0 ? (
            <p className="mt-4 text-sm text-[#7A6A58]">
              No closures planned. The salon is open on every working day.
            </p>
          ) : null}

          <ul className="mt-4 space-y-3">
            {closures.map((c) => {
              const days = dayCount(c.startDate, c.endDate);
              return (
                <li key={c.id} className="rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#1F2420]">
                        {c.reason}
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                            c.state === "ACTIVE"
                              ? "bg-[#FFF1EC] text-[#8B4428]"
                              : c.state === "UPCOMING"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-[#F0EBE3] text-[#7A6A58]"
                          }`}
                        >
                          {c.state === "ACTIVE" ? "Closed now" : c.state === "UPCOMING" ? "Upcoming" : "Past"}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-[#7A6A58]">
                        {formatRange(c.startDate, c.endDate)} · {days} day{days === 1 ? "" : "s"} · {c.closedSlotCount} slot
                        {c.closedSlotCount === 1 ? "" : "s"} closed
                      </p>
                    </div>
                    {canManage && c.state !== "PAST" ? (
                      <button
                        type="button"
                        onClick={() => void onRemove(c)}
                        disabled={busyId === c.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#E7B9A4]/80 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#8B4428] hover:bg-[#FFF1EC] disabled:opacity-50"
                      >
                        {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                        Reopen
                      </button>
                    ) : null}
                  </div>
                  {c.state !== "PAST" && c.affectedBookings.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#8B4428]">
                        Appointments to call and reschedule ({c.affectedBookings.length})
                      </p>
                      <AffectedList bookings={c.affectedBookings} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </PermissionGuard>
  );
}
