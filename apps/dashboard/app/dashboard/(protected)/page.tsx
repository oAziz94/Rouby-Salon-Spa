"use client";

import {
  ApiClientError,
  getDashboardBookings,
  getDashboardClients,
  getDashboardReportsOverview,
  type DashboardClient,
  type DashboardOverviewAppointment,
  type DashboardReportsOverviewResponse,
} from "@rouby/api-client";
import { formatWallClock12h, formatWallClockRange12h } from "@rouby/wall-clock";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Hourglass,
  LayoutGrid,
  Plus,
  Sparkles,
  Star,
} from "lucide-react";
import { useDashboardAuth } from "@/lib/dashboard-auth";
import { useDashboardShellFeed } from "@/lib/dashboard-shell-feed-context";

type LoadState = "loading" | "loaded" | "empty" | "error";

type TrendPoint = { label: string; value: number };

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
  const time =
    start && end
      ? formatWallClockRange12h(start, end, " - ")
      : start
        ? formatWallClock12h(start)
        : "";
  return `${date} ${time}`.trim();
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) {
    return "?";
  }
  if (p.length === 1) {
    return p[0]!.slice(0, 2).toUpperCase();
  }
  return `${p[0]!.charAt(0)}${p[p.length - 1]!.charAt(0)}`.toUpperCase();
}

function startOfWeekMonday(reference: Date): Date {
  const d = new Date(reference);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayPill(d: Date): { day: string; mon: string } {
  return {
    day: String(d.getDate()),
    mon: d.toLocaleString("en-US", { month: "short" }),
  };
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchLastSevenDayBookingCountsBySlotDate(
  token: string,
): Promise<TrendPoint[]> {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    days.push(d);
  }
  const results = await Promise.all(
    days.map(async (d) => {
      const key = formatLocalYmd(d);
      const res = await getDashboardBookings(token, {
        dateFrom: key,
        dateTo: key,
        page: 1,
        pageSize: 1,
      });
      const label = d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
      const value = res.meta?.totalItems ?? 0;
      return { label, value };
    }),
  );
  return results;
}

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) {
    return "";
  }
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return iso;
  }
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) {
    return `${sec}s ago`;
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min}m ago`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 48) {
    return `${hr}h ago`;
  }
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function extractBookingTrend(
  data: DashboardReportsOverviewResponse | null,
): TrendPoint[] | null {
  if (!data) {
    return null;
  }
  const raw = data as Record<string, unknown>;
  const keys = [
    "bookingTrend",
    "bookingsTrend",
    "bookingTrendSeries",
    "dailyBookings",
    "trend",
  ];
  for (const key of keys) {
    const v = raw[key];
    if (!Array.isArray(v) || v.length === 0) {
      continue;
    }
    const mapped: TrendPoint[] = [];
    for (const item of v) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const label =
          (typeof o.date === "string" && o.date) ||
          (typeof o.label === "string" && o.label) ||
          (typeof o.day === "string" && o.day) ||
          "";
        const val = o.count ?? o.value ?? o.bookings;
        const num = typeof val === "number" ? val : Number(val);
        if (label && !Number.isNaN(num)) {
          mapped.push({ label, value: num });
        }
      }
    }
    if (mapped.length > 0) {
      return mapped;
    }
  }
  return null;
}

function MiniSparkline({ stroke }: { stroke: string }) {
  return (
    <svg
      viewBox="0 0 88 28"
      className="mt-3 h-7 w-full max-w-[7.5rem] opacity-90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M2 20 C18 8, 28 24, 44 12 S 72 22, 86 14"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function BookingTrendChart({
  series,
  fillGradientId,
  emptyCaption,
}: {
  series: TrendPoint[] | null;
  fillGradientId: string;
  emptyCaption: string;
}) {
  const w = 360;
  const h = 140;
  const pad = 12;

  if (series && series.length >= 1) {
    const max = Math.max(...series.map((p) => p.value), 1);
    const min = Math.min(...series.map((p) => p.value), 0);
    const span = max - min || 1;
    if (series.length === 1) {
      const p = series[0]!;
      const x = w / 2;
      const y = pad + (1 - (p.value - min) / span) * (h - pad * 2);
      return (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="h-44 w-full"
          role="img"
          aria-label={`Booking trend: ${p.label}, ${p.value} bookings`}
        >
          <line
            x1={pad}
            y1={h - pad}
            x2={w - pad}
            y2={h - pad}
            stroke="#E8E0D4"
            strokeWidth="1"
          />
          <circle
            cx={x}
            cy={y}
            r="7"
            fill="#B9974A"
            fillOpacity="0.22"
            stroke="#B9974A"
            strokeWidth="2"
          />
          <text x={x} y={h - pad + 18} textAnchor="middle" fill="#5C5348" fontSize="11">
            {p.label}
          </text>
        </svg>
      );
    }
    const pts = series.map((p, i) => {
      const x = pad + (i / (series.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (p.value - min) / span) * (h - pad * 2);
      return `${x},${y}`;
    });
    const line = `M ${pts.join(" L ")}`;
    const area = `M ${pad},${h - pad} L ${pts.join(" ")} L ${w - pad},${h - pad} Z`;

    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-44 w-full"
        role="img"
        aria-label="Booking trend chart"
      >
        <defs>
          <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B9974A" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#B9974A" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${fillGradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="#B9974A"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl bg-[#FFFCF7]/90 py-8 ring-1 ring-[#F0EBE3]/80"
      role="status"
    >
      <p className="max-w-sm px-4 text-center text-sm leading-relaxed text-[#7A6A58]">{emptyCaption}</p>
    </div>
  );
}

function statusChipClass(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("PENDING")) {
    return "bg-[#F3E8D4] text-[#6B553D]";
  }
  if (s.includes("CONFIRM")) {
    return "bg-[#D9F0E3] text-[#1F5A3A]";
  }
  if (s.includes("COMPLETE")) {
    return "bg-[#E8E4F7] text-[#4A3D6B]";
  }
  if (s.includes("CANCEL")) {
    return "bg-[#F5E0E0] text-[#7A2E2E]";
  }
  return "bg-[#EDE9E3] text-[#5C5348]";
}

type LooseAppointment = DashboardOverviewAppointment & {
  client?: (NonNullable<DashboardOverviewAppointment["client"]> & {
    phone?: string | null;
  }) | null;
  service?: { name?: string; title?: string } | null;
};

type DerivedTrendState = "idle" | "loading" | "ready" | "unavailable";

export default function DashboardHomePage() {
  const trendFillId = useId().replace(/:/g, "");
  const { status, token, hasPermission } = useDashboardAuth();
  const { setOverviewRecentActivity } = useDashboardShellFeed();
  const [data, setData] = useState<DashboardReportsOverviewResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [weekCursor, setWeekCursor] = useState(() => new Date());
  const [derivedTrend, setDerivedTrend] = useState<TrendPoint[] | null>(null);
  const [derivedTrendState, setDerivedTrendState] = useState<DerivedTrendState>("idle");
  const [recentClients, setRecentClients] = useState<DashboardClient[]>([]);
  const [recentClientsState, setRecentClientsState] = useState<LoadState>("loading");
  const [recentClientsError, setRecentClientsError] = useState("");

  const canViewReports = hasPermission("reports.view");
  const canViewFinancial = hasPermission("reports.view_financial");
  const canReadClients = hasPermission("clients.read");
  const canCreateClients = hasPermission("clients.create");
  const canViewClientContact = hasPermission("clients.contact.view");
  const canReadBookings = hasPermission("bookings.read");

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
          (Array.isArray(response.recentActivity) && response.recentActivity.length > 0);
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

  useEffect(() => {
    if (!canViewReports) {
      setOverviewRecentActivity([]);
      return;
    }
    if (loadState === "loaded" && data) {
      setOverviewRecentActivity(data.recentActivity ?? []);
    }
  }, [canViewReports, data, loadState, setOverviewRecentActivity]);

  useEffect(() => {
    if (status !== "authenticated" || !token || !canViewReports || loadState !== "loaded" || !data) {
      return;
    }
    const apiTrend = extractBookingTrend(data);
    if (apiTrend && apiTrend.length > 0) {
      setDerivedTrend(null);
      setDerivedTrendState("idle");
      return;
    }
    if (!canReadBookings) {
      setDerivedTrend(null);
      setDerivedTrendState("unavailable");
      return;
    }

    let cancelled = false;
    setDerivedTrendState("loading");
    setDerivedTrend(null);

    void (async () => {
      try {
        const points = await fetchLastSevenDayBookingCountsBySlotDate(token);
        if (cancelled) {
          return;
        }
        setDerivedTrend(points);
        setDerivedTrendState("ready");
      } catch {
        if (cancelled) {
          return;
        }
        setDerivedTrend(null);
        setDerivedTrendState("unavailable");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canReadBookings, canViewReports, data, loadState, status, token]);

  useEffect(() => {
    if (status !== "authenticated" || !token || !canViewReports || loadState !== "loaded") {
      return;
    }
    if (!canReadClients) {
      setRecentClientsState("empty");
      setRecentClients([]);
      setRecentClientsError("");
      return;
    }

    let cancelled = false;
    setRecentClientsState("loading");
    setRecentClientsError("");

    void getDashboardClients(token, { page: 1, pageSize: 5 })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const rows = Array.isArray(response.data) ? response.data : [];
        setRecentClients(rows);
        setRecentClientsState(rows.length > 0 ? "loaded" : "empty");
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setRecentClients([]);
        if (err instanceof ApiClientError && err.statusCode === 403) {
          setRecentClientsState("empty");
          setRecentClientsError("You do not have access to the clients list for this branch.");
        } else {
          setRecentClientsState("error");
          setRecentClientsError(
            err instanceof Error ? err.message : "Could not load recent clients.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canReadClients, canViewReports, loadState, status, token]);

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

  const apiTrendSeries = useMemo(() => extractBookingTrend(data), [data]);
  const trendSeriesForChart = useMemo(() => {
    if (apiTrendSeries && apiTrendSeries.length > 0) {
      return apiTrendSeries;
    }
    if (derivedTrendState === "ready" && derivedTrend && derivedTrend.length > 0) {
      return derivedTrend;
    }
    return null;
  }, [apiTrendSeries, derivedTrend, derivedTrendState]);

  const trendBadgeLabel = useMemo(() => {
    if (apiTrendSeries && apiTrendSeries.length > 0) {
      return "Overview series";
    }
    if (derivedTrendState === "ready" && derivedTrend && derivedTrend.length > 0) {
      return "Last 7 days (slot date)";
    }
    return null;
  }, [apiTrendSeries, derivedTrend, derivedTrendState]);

  const trendEmptyCaption = useMemo(() => {
    if (!canReadBookings) {
      return "Booking trend needs either overview time-series data or permission to read bookings so we can count the last seven days by slot date.";
    }
    if (derivedTrendState === "loading") {
      return "Loading booking counts…";
    }
    return "No booking trend is available right now (overview has no series and bookings could not be summarized for this view).";
  }, [canReadBookings, derivedTrendState]);

  const weekStart = startOfWeekMonday(weekCursor);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = new Date();

  const kpiCards = canViewReports && loadState === "loaded" && data && (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#B9974A]/12 text-[#9A7A38]">
            <CalendarDays className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </div>
          <MiniSparkline stroke="#B9974A" />
        </div>
        <p className="mt-3 text-sm font-medium text-[#7A6A58]">Today&apos;s Bookings</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-[#1F2420]">
          {formatCount(data.todayBookings)}
        </p>
        <p className="mt-1 text-xs text-[#7A6A58]">Today</p>
      </article>
      <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#C4A574]/15 text-[#8A734A]">
            <Hourglass className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </div>
          <MiniSparkline stroke="#A68B5C" />
        </div>
        <p className="mt-3 text-sm font-medium text-[#7A6A58]">Pending Bookings</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-[#1F2420]">
          {formatCount(data.pendingBookings)}
        </p>
        <p className="mt-1 text-xs text-[#7A6A58]">Awaiting confirmation</p>
      </article>
      <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1F7A4A]/12 text-[#1F7A4A]">
            <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </div>
          <MiniSparkline stroke="#2F9A62" />
        </div>
        <p className="mt-3 text-sm font-medium text-[#7A6A58]">Confirmed Bookings</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-[#1F2420]">
          {formatCount(data.confirmedBookings)}
        </p>
        <p className="mt-1 text-xs text-[#7A6A58]">Confirmed total</p>
      </article>
      <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6B5CA8]/12 text-[#5A4E8C]">
            <Star className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </div>
          <MiniSparkline stroke="#7B6DB5" />
        </div>
        <p className="mt-3 text-sm font-medium text-[#7A6A58]">Completed Bookings</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-[#1F2420]">
          {formatCount(data.completedBookings)}
        </p>
        <p className="mt-1 text-xs text-[#7A6A58]">Completed total</p>
      </article>
      {showFinancialCard ? (
        <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 sm:col-span-2 xl:col-span-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#062A2D]/10 text-[#062A2D]">
              <Sparkles className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-[#7A6A58]">Revenue today</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-[#1F2420] md:text-3xl">
            {formatEGP(financialCardValue)}
          </p>
          <p className="mt-1 text-xs text-[#7A6A58]">Financial visibility per your role</p>
        </article>
      ) : null}
    </section>
  );

  return (
    <section className="space-y-6 md:space-y-8">
      <header className="rounded-2xl bg-white/90 p-6 shadow-[0_8px_30px_rgba(31,36,32,0.05)] ring-1 ring-[#E8E0D4]/70 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-[#1F2420] md:text-3xl">
                Overview
              </h1>
              <Sparkles className="h-5 w-5 text-[#B9974A]" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#7A6A58] md:text-base">
              Welcome back! Here&apos;s what&apos;s happening at Alrouby Salon &amp; Spa.
            </p>
          </div>
          {quickLinks.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-1.5 text-xs font-medium text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45 hover:text-[#062A2D] md:text-sm"
                >
                  <LayoutGrid className="h-3.5 w-3.5 text-[#B9974A]" strokeWidth={1.75} aria-hidden />
                  {link.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {!canViewReports ? (
        <section className="rounded-2xl bg-white p-6 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-8">
          <p className="text-sm leading-relaxed text-[#7A6A58]">
            You do not have permission to view overview reports. You can still use other sections
            from the sidebar your role allows.
          </p>
        </section>
      ) : null}

      {canViewReports && loadState === "loading" ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <article
              key={`kpi-skeleton-${index}`}
              className="animate-pulse rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.04)] ring-1 ring-[#E8E0D4]/50"
            >
              <div className="h-10 w-10 rounded-xl bg-[#E6DCCB]/80" />
              <div className="mt-4 h-3 w-28 rounded bg-[#E6DCCB]/80" />
              <div className="mt-3 h-9 w-16 rounded bg-[#E6DCCB]/80" />
            </article>
          ))}
        </section>
      ) : null}

      {canViewReports && loadState === "error" ? (
        <section className="rounded-2xl bg-[#FFF1EC] p-5 shadow-sm ring-1 ring-[#E7B9A4]/60 md:p-6">
          <p className="text-sm text-danger">{errorMessage}</p>
        </section>
      ) : null}

      {canViewReports && loadState === "empty" ? (
        <section className="rounded-2xl bg-white p-6 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-8">
          <p className="text-sm leading-relaxed text-[#7A6A58]">
            No overview data is available for this period yet.
          </p>
        </section>
      ) : null}

      {canViewReports && loadState === "loaded" && data ? (
        <>
          {kpiCards}

          <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
            <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0EBE3] pb-4">
                <h2 className="text-base font-semibold text-[#1F2420]">Booking Trend</h2>
                {trendBadgeLabel ? (
                  <span className="inline-flex max-w-[14rem] items-center gap-1 rounded-full border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-1 text-xs font-medium text-[#7A6A58]">
                    <CalendarRange className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className="leading-snug">{trendBadgeLabel}</span>
                  </span>
                ) : null}
              </div>
              <div className="pt-2">
                <BookingTrendChart
                  series={trendSeriesForChart}
                  fillGradientId={trendFillId}
                  emptyCaption={trendEmptyCaption}
                />
              </div>
            </article>

            <div className="flex flex-col gap-4 lg:gap-6">
              <article className="rounded-2xl border border-dashed border-[#E4DDD0] bg-[#FFFCF7]/40 p-5 shadow-none ring-0 md:p-6">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9A8B7A]">
                      Quick Date
                    </h2>
                    <p className="mt-1 text-[0.7rem] leading-relaxed text-[#B5A896]">
                      Calendar preview only — does not change overview metrics.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 text-[#B5A896]">
                    <button
                      type="button"
                      className="rounded-lg p-1 transition hover:bg-[#F0E8DC]/80"
                      aria-label="Previous week"
                      onClick={() => setWeekCursor(addDays(weekStart, -7))}
                    >
                      <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg p-1 transition hover:bg-[#F0E8DC]/80"
                      aria-label="Next week"
                      onClick={() => setWeekCursor(addDays(weekStart, 7))}
                    >
                      <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                    <CalendarDays className="ml-1 h-4 w-4 text-[#C4B49A]" strokeWidth={1.75} aria-hidden />
                  </div>
                </div>
                <div className="flex justify-between gap-1 overflow-x-auto pb-1 opacity-90">
                  {weekDays.map((d) => {
                    const active = sameDay(d, today);
                    const { day, mon } = formatDayPill(d);
                    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                    return (
                      <div
                        key={key}
                        className={`flex min-w-[2.75rem] flex-col items-center rounded-xl px-2 py-2 text-center ${
                          active
                            ? "bg-[#B9974A]/90 text-white shadow-sm shadow-[#B9974A]/20"
                            : "text-[#7A6A58]"
                        }`}
                      >
                        <span className="text-[0.65rem] font-medium uppercase opacity-80">{mon}</span>
                        <span className="text-sm font-semibold">{day}</span>
                        {active ? (
                          <span className="mt-1 h-1 w-1 rounded-full bg-white/90" aria-hidden />
                        ) : (
                          <span className="mt-1 h-1 w-1 rounded-full bg-transparent" aria-hidden />
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="flex-1 rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[#1F2420]">Recent Clients</h2>
                  {canReadClients ? (
                    <Link
                      href="/dashboard/clients"
                      className="text-xs font-medium text-[#B9974A] hover:underline"
                    >
                      View all
                    </Link>
                  ) : null}
                </div>
                {!canReadClients ? (
                  <p className="text-sm leading-relaxed text-[#7A6A58]">
                    You do not have permission to load the clients list. Ask an administrator if you
                    need access.
                  </p>
                ) : recentClientsState === "loading" ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={`rc-sk-${i}`}
                        className="h-12 animate-pulse rounded-xl bg-[#F0EBE3]/80"
                      />
                    ))}
                  </div>
                ) : recentClientsState === "error" ? (
                  <p className="text-sm text-danger">{recentClientsError}</p>
                ) : recentClientsState === "empty" ? (
                  <div className="rounded-xl bg-[#FFFCF7]/80 py-6 text-center ring-1 ring-[#F0EBE3]/80">
                    <p className="text-sm text-[#7A6A58]">
                      {recentClientsError ||
                        "No clients returned for your branch, or the list is empty."}
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {recentClients.map((c) => {
                      const phone = typeof c.phone === "string" ? c.phone : null;
                      const email = typeof c.email === "string" ? c.email : null;
                      const contactLine =
                        canViewClientContact && (phone || email)
                          ? phone || email
                          : canViewClientContact
                            ? null
                            : "Contact details hidden for your role.";
                      return (
                        <li
                          key={c.id}
                          className="flex items-center gap-3 rounded-xl bg-[#FFFCF7]/90 px-3 py-2.5 ring-1 ring-[#F0EBE3]/80"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#062A2D]/10 text-xs font-semibold text-[#062A2D]">
                            {initials(c.fullName)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[#1F2420]">{c.fullName}</p>
                            {contactLine ? (
                              <p className="truncate text-xs text-[#7A6A58]">{contactLine}</p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {canCreateClients ? (
                  <Link
                    href="/dashboard/clients"
                    className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#D4CFC4] bg-[#FFFCF7]/80 py-3.5 text-sm font-medium text-[#5C5348] transition hover:border-[#B9974A]/40 hover:bg-[#F9F4EC]"
                  >
                    <Plus className="h-4 w-4 text-[#B9974A]" strokeWidth={1.75} aria-hidden />
                    Add New Client
                  </Link>
                ) : null}
              </article>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
            <article className="rounded-2xl bg-white shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0EBE3] px-5 py-4 md:px-6">
                <h2 className="text-base font-semibold text-[#1F2420]">Recent Bookings</h2>
                {hasPermission("bookings.read") ? (
                  <Link
                    href="/dashboard/bookings"
                    className="inline-flex items-center gap-1 text-sm font-medium text-[#B9974A] hover:underline"
                  >
                    View all
                    <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </Link>
                ) : null}
              </div>
              {Array.isArray(data.upcomingAppointments) && data.upcomingAppointments.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <thead>
                      <tr className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">
                        <th className="px-5 py-3 font-medium md:px-6">Client</th>
                        <th className="px-3 py-3 font-medium">Service</th>
                        <th className="px-3 py-3 font-medium">Date &amp; time</th>
                        <th className="px-3 py-3 font-medium">Status</th>
                        <th className="px-5 py-3 text-right font-medium md:px-6">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0EBE3]">
                      {data.upcomingAppointments.slice(0, 6).map((raw) => {
                        const appointment = raw as LooseAppointment;
                        const name = appointment.client?.fullName ?? "Client";
                        const phone = appointment.client?.phone ?? "";
                        const svc =
                          appointment.service?.name ??
                          appointment.service?.title ??
                          "—";
                        return (
                          <tr key={appointment.id} className="text-[#1F2420]">
                            <td className="px-5 py-3.5 md:px-6">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#062A2D]/10 text-xs font-semibold text-[#062A2D]">
                                  {initials(name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{name}</p>
                                  {phone ? (
                                    <p className="truncate text-xs text-[#7A6A58]">{phone}</p>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="max-w-[10rem] px-3 py-3.5">
                              <p className="truncate font-medium">{svc}</p>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3.5 text-[#5C5348]">
                              {formatSlotLabel(appointment)}
                            </td>
                            <td className="px-3 py-3.5">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusChipClass(appointment.status)}`}
                              >
                                {appointment.status}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right md:px-6">
                              {hasPermission("bookings.read") ? (
                                <Link
                                  href="/dashboard/bookings"
                                  className="inline-flex rounded-lg p-2 text-[#7A6A58] transition hover:bg-[#F5F0E8] hover:text-[#B9974A]"
                                  aria-label={`View booking for ${name}`}
                                >
                                  <Eye className="h-4 w-4" strokeWidth={1.75} />
                                </Link>
                              ) : (
                                <span className="text-[#C4B8A8]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-10 text-center md:px-6">
                  <Clock className="mx-auto h-8 w-8 text-[#B9974A]/50" strokeWidth={1.5} aria-hidden />
                  <p className="mt-3 text-sm text-[#7A6A58]">
                    No upcoming appointments in the overview range.
                  </p>
                  {hasPermission("bookings.read") ? (
                    <Link
                      href="/dashboard/bookings"
                      className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#B9974A] hover:underline"
                    >
                      Open bookings
                      <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </Link>
                  ) : null}
                </div>
              )}
            </article>

            <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-[#1F2420]">Recent Activity</h2>
                {hasPermission("audit.read") ? (
                  <Link
                    href="/dashboard/audit-logs"
                    className="text-xs font-medium text-[#B9974A] hover:underline"
                  >
                    View all
                  </Link>
                ) : null}
              </div>
              {Array.isArray(data.recentActivity) && data.recentActivity.length > 0 ? (
                <ul className="space-y-3">
                  {data.recentActivity.slice(0, 8).map((activity, index) => {
                    const mod = activity.module ?? "General";
                    const rel = formatRelativeTime(activity.createdAt);
                    const subtitle = [activity.user?.name, mod].filter(Boolean).join(" • ");
                    const palette = ["#B9974A", "#2F9A62", "#7B6DB5", "#A68B5C"] as const;
                    const color = palette[index % palette.length]!;
                    return (
                      <li
                        key={activity.id ?? `${activity.action ?? "activity"}-${index}`}
                        className="flex gap-3 rounded-xl bg-[#FFFCF7]/90 p-3 ring-1 ring-[#F0EBE3]/80"
                      >
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
                          style={{ backgroundColor: color }}
                          aria-hidden
                        >
                          <Sparkles className="h-4 w-4 opacity-95" strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#1F2420]">
                            {activity.action ?? "System activity"}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-[#7A6A58]">{subtitle}</p>
                        </div>
                        {rel ? (
                          <span className="shrink-0 text-xs text-[#9A8B7A]">{rel}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-xl bg-[#FFFCF7]/80 py-10 text-center ring-1 ring-[#F0EBE3]/80">
                  <p className="text-sm text-[#7A6A58]">No recent activity recorded.</p>
                </div>
              )}
            </article>
          </div>

          <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6">
            <h2 className="text-sm font-semibold text-[#1F2420]">Booking status summary</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {(
                [
                  ["Pending", data.pendingBookings],
                  ["Confirmed", data.confirmedBookings],
                  ["Completed", data.completedBookings],
                  ["Cancelled", data.cancelledBookings],
                  ["No-show", data.noShowBookings],
                ] as const
              ).map(([label, val]) => (
                <li
                  key={label}
                  className="flex items-center justify-between rounded-xl bg-[#FFFCF7]/90 px-4 py-3 ring-1 ring-[#F0EBE3]/80"
                >
                  <span className="text-sm text-[#7A6A58]">{label}</span>
                  <span className="text-lg font-semibold text-[#1F2420]">{formatCount(val)}</span>
                </li>
              ))}
            </ul>
          </article>
        </>
      ) : null}
    </section>
  );
}
