 "use client";

import {
  getDashboardReportsOverview,
  type DashboardReportsOverviewResponse,
} from "@rouby/api-client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "empty" | "error";

function formatCount(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : "0";
}

function formatEGP(value: unknown): string {
  if (typeof value !== "number") {
    return "EGP 0.00";
  }
  return `EGP ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSlotLabel(appointment: {
  slot?: { date?: string; startTime?: string; endTime?: string } | null;
}): string {
  const date = appointment.slot?.date ?? "";
  const start = appointment.slot?.startTime ?? "";
  const end = appointment.slot?.endTime ?? "";
  if (!date && !start && !end) {
    return "Time unavailable";
  }
  return `${date} ${start}${end ? ` - ${end}` : ""}`.trim();
}

export default function DashboardHomePage() {
  const { status, token, hasPermission } = useDashboardAuth();
  const [data, setData] = useState<DashboardReportsOverviewResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const canViewReports = hasPermission("reports.view");
  const canViewFinancial = hasPermission("reports.view_financial");

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    if (!canViewReports) {
      setLoadState("empty");
      return;
    }
    if (!token) {
      setLoadState("error");
      setErrorMessage("Missing dashboard token. Please sign in again.");
      return;
    }

    setLoadState("loading");
    setErrorMessage("");
    getDashboardReportsOverview(token)
      .then((response) => {
        setData(response);
        const hasAnyContent =
          typeof response.todayBookings === "number" ||
          typeof response.pendingBookings === "number" ||
          typeof response.confirmedBookings === "number" ||
          typeof response.completedBookings === "number" ||
          typeof response.cancelledBookings === "number" ||
          typeof response.noShowBookings === "number" ||
          (Array.isArray(response.upcomingAppointments) &&
            response.upcomingAppointments.length > 0) ||
          (Array.isArray(response.recentActivity) &&
            response.recentActivity.length > 0);
        setLoadState(hasAnyContent ? "loaded" : "empty");
      })
      .catch((error: unknown) => {
        setLoadState("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to load dashboard overview.",
        );
      });
  }, [canViewReports, status, token]);

  const quickLinks = useMemo(
    () =>
      [
        {
          href: "/dashboard/bookings",
          label: "Open bookings",
          permission: "bookings.read",
        },
        {
          href: "/dashboard/calendar",
          label: "Open calendar",
          permission: "bookings.read",
        },
        {
          href: "/dashboard/slots",
          label: "Manage slots",
          permission: "slots.read",
        },
        {
          href: "/dashboard/reports",
          label: "View reports",
          permission: "reports.view",
        },
      ].filter((item) => hasPermission(item.permission)),
    [hasPermission],
  );

  const financialCardValue = data?.todayRevenue;
  const showFinancialCard =
    canViewFinancial && typeof financialCardValue === "number";

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#1F2420]">Overview</h1>
        <p className="mt-2 text-sm text-[#7A6A58]">
          Live operational dashboard for reception and management workflows.
        </p>
      </header>

      {!canViewReports ? (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-[#7A6A58]">
            You do not have permission to view overview reports.
          </p>
        </section>
      ) : null}

      {canViewReports && loadState === "loading" ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <article
              key={`kpi-skeleton-${index}`}
              className="animate-pulse rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="h-3 w-24 rounded bg-[#E6DCCB]" />
              <div className="mt-4 h-8 w-20 rounded bg-[#E6DCCB]" />
            </article>
          ))}
        </section>
      ) : null}

      {canViewReports && loadState === "error" ? (
        <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 shadow-sm">
          <p className="text-sm text-danger">{errorMessage}</p>
        </section>
      ) : null}

      {canViewReports && loadState === "empty" ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-sm text-[#7A6A58]">
            No overview data is available for this period yet.
          </p>
        </section>
      ) : null}

      {canViewReports && loadState === "loaded" ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.1em] text-[#7A6A58]">
                Today bookings
              </p>
              <p className="mt-3 text-3xl font-semibold text-[#1F2420]">
                {formatCount(data?.todayBookings)}
              </p>
            </article>
            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.1em] text-[#7A6A58]">
                Pending bookings
              </p>
              <p className="mt-3 text-3xl font-semibold text-[#1F2420]">
                {formatCount(data?.pendingBookings)}
              </p>
            </article>
            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.1em] text-[#7A6A58]">
                Confirmed bookings
              </p>
              <p className="mt-3 text-3xl font-semibold text-[#1F2420]">
                {formatCount(data?.confirmedBookings)}
              </p>
            </article>
            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.1em] text-[#7A6A58]">
                Completed bookings
              </p>
              <p className="mt-3 text-3xl font-semibold text-[#1F2420]">
                {formatCount(data?.completedBookings)}
              </p>
            </article>
            {showFinancialCard ? (
              <article className="rounded-xl border border-border bg-card p-5 shadow-sm md:col-span-2 xl:col-span-1">
                <p className="text-xs uppercase tracking-[0.1em] text-[#7A6A58]">
                  Revenue today
                </p>
                <p className="mt-3 text-3xl font-semibold text-[#1F2420]">
                  {formatEGP(financialCardValue)}
                </p>
              </article>
            ) : null}
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-[#1F2420]">
                Booking status summary
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-[#1F2420]">
                <li className="flex items-center justify-between">
                  <span className="text-[#7A6A58]">Pending</span>
                  <span className="font-semibold">
                    {formatCount(data?.pendingBookings)}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-[#7A6A58]">Confirmed</span>
                  <span className="font-semibold">
                    {formatCount(data?.confirmedBookings)}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-[#7A6A58]">Completed</span>
                  <span className="font-semibold">
                    {formatCount(data?.completedBookings)}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-[#7A6A58]">Cancelled</span>
                  <span className="font-semibold">
                    {formatCount(data?.cancelledBookings)}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-[#7A6A58]">No-show</span>
                  <span className="font-semibold">
                    {formatCount(data?.noShowBookings)}
                  </span>
                </li>
              </ul>
            </article>

            <article className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
              <h2 className="text-sm font-semibold text-[#1F2420]">
                Upcoming appointments
              </h2>
              {Array.isArray(data?.upcomingAppointments) &&
              data.upcomingAppointments.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {data.upcomingAppointments.slice(0, 6).map((appointment) => (
                    <li
                      key={appointment.id}
                      className="rounded-lg border border-border bg-white p-3"
                    >
                      <p className="text-sm font-medium text-[#1F2420]">
                        {appointment.client?.fullName ?? "Client"}
                      </p>
                      <p className="mt-1 text-xs text-[#7A6A58]">
                        {formatSlotLabel(appointment)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-[#7A6A58]">
                  No upcoming appointments in this range.
                </p>
              )}
            </article>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-[#1F2420]">Recent activity</h2>
              {Array.isArray(data?.recentActivity) &&
              data.recentActivity.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {data.recentActivity.slice(0, 6).map((activity, index) => (
                    <li
                      key={activity.id ?? `${activity.action ?? "activity"}-${index}`}
                      className="rounded-lg border border-border bg-white p-3"
                    >
                      <p className="text-sm font-medium text-[#1F2420]">
                        {activity.action ?? "System activity"}
                      </p>
                      <p className="mt-1 text-xs text-[#7A6A58]">
                        {(activity.module ?? "General") +
                          (activity.createdAt ? ` • ${activity.createdAt}` : "")}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-[#7A6A58]">
                  No recent activity available.
                </p>
              )}
            </article>

            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-[#1F2420]">Quick links</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {quickLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium text-[#1F2420] hover:border-[#B9974A]"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </article>
          </section>
        </>
      ) : null}
    </section>
  );
}
