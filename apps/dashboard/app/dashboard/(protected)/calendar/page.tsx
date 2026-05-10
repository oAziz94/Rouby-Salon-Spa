"use client";

import {
  getDashboardBookings,
  getDashboardBranches,
  type DashboardBookingsListItem,
  type DashboardBranch,
} from "@rouby/api-client";
import { formatDateTimeAmPm } from "@rouby/wall-clock";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type CalendarState = "loading" | "loaded" | "empty" | "error";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-[#FFF6E6] text-[#8B6A1D]",
  CONFIRMED: "bg-[#EAF7EE] text-[#1E6A3A]",
  RESCHEDULED: "bg-[#EAF1F8] text-[#2C567A]",
  COMPLETED: "bg-[#EEF2EC] text-[#355032]",
  CANCELLED: "bg-[#F3F0EF] text-[#6A615A]",
  REJECTED: "bg-[#FBECEA] text-[#8B4428]",
  NO_SHOW: "bg-[#FCEEE8] text-[#8B4428]",
  ARRIVED: "bg-[#F5F0DF] text-[#6D5A1A]",
  IN_PROGRESS: "bg-[#E7F0E8] text-[#2E5A3A]",
};

function todayDateInput(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function statusBadge(status: string): string {
  return STATUS_STYLES[status] ?? "bg-[#F3EBDD] text-[#4A3C2F]";
}

export default function DashboardCalendarPage() {
  const { token, user, hasPermission } = useDashboardAuth();
  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [rows, setRows] = useState<DashboardBookingsListItem[]>([]);
  const [state, setState] = useState<CalendarState>("loading");
  const [error, setError] = useState<string>("");
  const [shapeFallbackMessage, setShapeFallbackMessage] = useState<string>("");

  const canReadBookings = hasPermission("bookings.read");

  const canAccessMultipleBranches = useMemo(() => {
    if (!canReadBookings) {
      return false;
    }
    return user?.branchId === null;
  }, [canReadBookings, user?.branchId]);

  useEffect(() => {
    if (!token || !canReadBookings) {
      return;
    }

    if (hasPermission("branches.read")) {
      getDashboardBranches(token)
        .then((list) => {
          setBranches(list);
          if (!branchId) {
            const fallbackBranch = user?.branchId ?? list[0]?.id ?? "";
            setBranchId(fallbackBranch);
          }
        })
        .catch(() => {
          const fallbackBranch = user?.branchId ?? "";
          if (fallbackBranch) {
            setBranchId(fallbackBranch);
          }
          setBranches([]);
        });
      return;
    }

    if (!branchId && user?.branchId) {
      setBranchId(user.branchId);
    }
  }, [
    branchId,
    canReadBookings,
    hasPermission,
    token,
    user?.branchId,
  ]);

  useEffect(() => {
    if (!date) {
      setDate(todayDateInput());
    }
  }, [date]);

  useEffect(() => {
    if (!token || !canReadBookings) {
      return;
    }

    if (!branchId && canAccessMultipleBranches) {
      return;
    }

    if (!date) {
      return;
    }

    setState("loading");
    setError("");
    setShapeFallbackMessage("");
    getDashboardBookings(token, {
      branchId: branchId || undefined,
      status: status || undefined,
      dateFrom: date,
      dateTo: date,
      page: 1,
      pageSize: 100,
    })
      .then((res) => {
        const safeRows = Array.isArray(res.data) ? res.data : [];
        const hasExpectedShape = safeRows.every(
          (row) =>
            typeof row.id === "string" &&
            typeof row.status === "string" &&
            typeof row.createdAt === "string",
        );
        if (!hasExpectedShape) {
          setShapeFallbackMessage(
            "Booking response has limited shape. Showing available fields only.",
          );
        } else if (
          safeRows.length > 0 &&
          safeRows.every((row) => !row.slotId && !row.clientId)
        ) {
          setShapeFallbackMessage(
            "Booking endpoint currently returns compact rows without slot/client details.",
          );
        }
        setRows(safeRows);
        setState(safeRows.length > 0 ? "loaded" : "empty");
      })
      .catch((requestError) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to load calendar bookings.",
        );
        setState("error");
      });
  }, [branchId, canAccessMultipleBranches, canReadBookings, date, status, token]);

  return (
    <PermissionGuard permission="bookings.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Calendar</h1>
              <p className="mt-2 text-sm text-[#7A6A58]">
                Daily booking calendar view with status filters.
              </p>
            </div>
            <Link
              href="/dashboard/slots"
              className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-[#1F2420] hover:border-[#B9974A]"
            >
              Go to slot management
            </Link>
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 outline-none focus:border-[#B9974A]"
              />
            </label>

            {canAccessMultipleBranches ? (
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Branch</span>
                <select
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 outline-none focus:border-[#B9974A]"
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
                <div className="rounded-md border border-border bg-white px-3 py-2 text-[#7A6A58]">
                  {branches.find((branch) => branch.id === branchId)?.name ??
                    "Assigned branch"}
                </div>
              </div>
            )}

            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 outline-none focus:border-[#B9974A]"
              >
                <option value="">All statuses</option>
                {Object.keys(STATUS_STYLES).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {shapeFallbackMessage ? (
          <section className="rounded-xl border border-[#E6DCCB] bg-[#FFF9EE] p-4 text-sm text-[#7A6A58] shadow-sm">
            {shapeFallbackMessage}
          </section>
        ) : null}

        {state === "loading" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-sm text-[#7A6A58]">Loading calendar bookings...</p>
          </section>
        ) : null}

        {state === "error" ? (
          <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 shadow-sm">
            <p className="text-sm text-danger">{error}</p>
          </section>
        ) : null}

        {state === "empty" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-sm text-[#7A6A58]">
              No bookings found for the selected filters.
            </p>
          </section>
        ) : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Booking ID</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Created</th>
                    <th className="py-2 pr-3 font-medium">Slot</th>
                    <th className="py-2 pr-3 font-medium">Client</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60">
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
                      <td className="py-3 pr-3 text-[#7A6A58]">{formatDateTimeAmPm(row.createdAt)}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.slotId ?? "-"}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.clientId ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <article
                  key={row.id}
                  className="rounded-lg border border-border bg-white p-4"
                >
                  <p className="text-sm font-semibold text-[#1F2420]">{row.id}</p>
                  <p className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusBadge(
                        row.status,
                      )}`}
                    >
                      {row.status}
                    </span>
                  </p>
                  <p className="mt-2 text-xs text-[#7A6A58]">Created: {formatDateTimeAmPm(row.createdAt)}</p>
                  <p className="mt-1 text-xs text-[#7A6A58]">Slot: {row.slotId ?? "-"}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
