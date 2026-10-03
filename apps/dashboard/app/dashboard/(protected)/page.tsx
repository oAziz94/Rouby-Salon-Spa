"use client";

import {
  getDashboardBranches,
  getDashboardOverviewToday,
  getDashboardReportsOverview,
  type DashboardOverviewTodayResponse,
  type DashboardBranch,
  type DashboardOverviewAttentionItem,
  type DashboardOverviewRecentBookingRow,
  type DashboardOverviewRecentClientRow,
  type DashboardOverviewSchedulePreviewItem,
  type DashboardOverviewTrendDay,
  type DashboardReportsOverviewResponse,
} from "@rouby/api-client";
import { formatWallClock12h, formatWallClockRange12h } from "@rouby/wall-clock";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  CreditCard,
  ExternalLink,
  ListOrdered,
  Plus,
  Sparkles,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { bookingStatusLabel, paymentStatusLabel } from "@/lib/labels";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { DashboardCreateBookingDialog } from "@/components/dashboard-create-booking-dialog";
import { useDashboardAuth } from "@/lib/dashboard-auth";
import { useDashboardShellFeed } from "@/lib/dashboard-shell-feed-context";

type LoadState = "loading" | "loaded" | "empty" | "error";
type TrendRange = "7" | "30" | "month";

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

function formatHumanAuditAction(action: string | undefined): string {
  if (!action) return "Activity";
  return action
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return `${p[0]!.charAt(0)}${p[p.length - 1]!.charAt(0)}`.toUpperCase();
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, mo, da] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1, da, 12, 0, 0, 0));
  t.setUTCDate(t.getUTCDate() + delta);
  const yy = t.getUTCFullYear();
  const mm = `${t.getUTCMonth() + 1}`.padStart(2, "0");
  const dd = `${t.getUTCDate()}`.padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function sourceLabel(source: string): string {
  const s = source.toLowerCase();
  if (s === "website") return "Website";
  if (s === "dashboard") return "Dashboard";
  if (s === "walk_in" || s === "walk-in") return "Walk-in";
  if (s === "phone") return "Phone";
  if (s === "whatsapp") return "WhatsApp";
  return source.replace(/_/g, " ");
}

function statusChipClass(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("PENDING")) return "bg-[#F3E8D4] text-[#6B553D]";
  if (s.includes("CONFIRM") || s.includes("RESCHEDULE")) return "bg-[#D9F0E3] text-[#1F5A3A]";
  if (s.includes("COMPLETE")) return "bg-[#E8E4F7] text-[#4A3D6B]";
  if (s.includes("CANCEL") || s.includes("REJECT")) return "bg-[#F5E0E0] text-[#7A2E2E]";
  return "bg-[#EDE9E3] text-[#5C5348]";
}

function attentionTone(sev: DashboardOverviewAttentionItem["severity"]): string {
  if (sev === "critical") return "border-[#E7B9A4]/80 bg-[#FFF1EC] text-[#5C2E20]";
  if (sev === "warning") return "border-[#E8D4A0]/90 bg-[#FFF9ED] text-[#5C4A18]";
  return "border-[#E8E0D4] bg-[#FFFCF7] text-[#5C5348]";
}

function formatScheduleTime(row: DashboardOverviewSchedulePreviewItem): string {
  return formatWallClockRange12h(row.startTime, row.endTime, " – ");
}

function CompactTrendChart({
  series,
  rangeLabel,
  fillId,
}: {
  series: DashboardOverviewTrendDay[];
  rangeLabel: string;
  fillId: string;
}) {
  const w = 320;
  const h = 96;
  const pad = 10;
  if (!series.length) {
    return (
      <div className="flex h-28 items-center justify-center rounded-xl bg-[#FFFCF7]/90 text-sm text-[#7A6A58] ring-1 ring-[#F0EBE3]/80">
        No trend data for this range.
      </div>
    );
  }
  const max = Math.max(
    ...series.map((p) => Math.max(p.total, p.completed, p.cancelled, p.noShow)),
    1,
  );
  const pts = series.map((p, i) => {
    const x = pad + (i / Math.max(series.length - 1, 1)) * (w - pad * 2);
    const yTot = pad + (1 - p.total / max) * (h - pad * 2);
    const yDone = pad + (1 - p.completed / max) * (h - pad * 2);
    const yCan = pad + (1 - p.cancelled / max) * (h - pad * 2);
    const yNs = pad + (1 - p.noShow / max) * (h - pad * 2);
    return { x, yTot, yDone, yCan, yNs, p };
  });
  const lineTot = `M ${pts.map((t) => `${t.x},${t.yTot}`).join(" L ")}`;
  const lineDone = `M ${pts.map((t) => `${t.x},${t.yDone}`).join(" L ")}`;
  const lineCan = `M ${pts.map((t) => `${t.x},${t.yCan}`).join(" L ")}`;
  const lineNs = `M ${pts.map((t) => `${t.x},${t.yNs}`).join(" L ")}`;
  const area = `M ${pad},${h - pad} L ${pts.map((t) => `${t.x},${t.yTot}`).join(" ")} L ${w - pad},${h - pad} Z`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-[0.65rem] text-[#7A6A58]">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#B9974A]" aria-hidden />
          Total
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#1F7A4A]" aria-hidden />
          Done
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#9A7A38]" aria-hidden />
          Cancelled
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#7A6DB5]" aria-hidden />
          No-show
        </span>
        <span className="ml-auto text-[0.6rem] uppercase tracking-wide text-[#B5A896]">{rangeLabel}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" role="img" aria-label="Booking trend">
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B9974A" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#B9974A" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${fillId})`} />
        <path d={lineTot} fill="none" stroke="#B9974A" strokeWidth="2" strokeLinecap="round" />
        <path
          d={lineDone}
          fill="none"
          stroke="#1F7A4A"
          strokeWidth="1.25"
          strokeLinecap="round"
          opacity={0.85}
        />
        <path
          d={lineCan}
          fill="none"
          stroke="#9A7A38"
          strokeWidth="1.25"
          strokeLinecap="round"
          opacity={0.75}
        />
        <path
          d={lineNs}
          fill="none"
          stroke="#7A6DB5"
          strokeWidth="1.25"
          strokeLinecap="round"
          opacity={0.75}
        />
        {pts.map((t, i) => (
          <circle key={`${t.p.date}-${i}`} cx={t.x} cy={t.yTot} r="2.5" fill="#B9974A" />
        ))}
      </svg>
    </div>
  );
}

export default function DashboardHomePage() {
  const trendFillId = useId().replace(/:/g, "");
  const { status, token, hasPermission, user } = useDashboardAuth();
  const router = useRouter();
  const { setOverviewRecentActivity, setOverviewUpcomingAppointments } = useDashboardShellFeed();
  const [data, setData] = useState<DashboardReportsOverviewResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [weekStartYmd, setWeekStartYmd] = useState<string | null>(null);
  const [trendRange, setTrendRange] = useState<TrendRange>("7");
  const [createOpen, setCreateOpen] = useState(false);
  const [branches, setBranches] = useState<DashboardBranch[]>([]);

  const canViewReports = hasPermission("reports.view");
  const canViewFinancial = hasPermission("reports.view_financial");
  const canReadBookings = hasPermission("bookings.read");
  const canCreateBooking = hasPermission("bookings.create");
  const canViewClientContact = hasPermission("clients.contact.view");
  const canReadClients = hasPermission("clients.read");
  const canReadQueue = hasPermission("queue.read");

  // Front-desk roles have no reports: their working screen is the Queue.
  useEffect(() => {
    if (status === "authenticated" && !canViewReports && canReadQueue) {
      router.replace("/dashboard/queue");
    }
  }, [canReadQueue, canViewReports, router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!canCreateBooking || !token) return;
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
  }, [canCreateBooking, status, token]);

  useEffect(() => {
    if (status !== "authenticated") return;
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
        if (response.meta?.quickWeekStartYmd) {
          setWeekStartYmd(response.meta.quickWeekStartYmd);
        }
        setLoadState("loaded");
      })
      .catch((error: unknown) => {
        setLoadState("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load dashboard overview.",
        );
      });
  }, [canViewReports, status, token]);

  useEffect(() => {
    if (!canViewReports) {
      setOverviewRecentActivity([]);
      setOverviewUpcomingAppointments([]);
      return;
    }
    if (loadState === "loaded" && data) {
      setOverviewRecentActivity(data.recentActivity ?? []);
      setOverviewUpcomingAppointments(data.upcomingAppointments ?? []);
    }
  }, [canViewReports, data, loadState, setOverviewRecentActivity, setOverviewUpcomingAppointments]);

  const todayYmd = data?.meta?.todayYmd ?? null;
  const effectiveWeekStart = weekStartYmd ?? todayYmd;
  const weekDays = useMemo(() => {
    if (!effectiveWeekStart) return [];
    return Array.from({ length: 7 }, (_, i) => addDaysYmd(effectiveWeekStart, i));
  }, [effectiveWeekStart]);

  const trendSeries = useMemo((): DashboardOverviewTrendDay[] => {
    if (!data?.trends) return [];
    if (trendRange === "7") return data.trends.last7Days ?? [];
    if (trendRange === "30") return data.trends.last30Days ?? [];
    return data.trends.monthToDate ?? [];
  }, [data, trendRange]);

  const cairoHeaderDate = useMemo(() => {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Cairo",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date());
  }, []);

  const initialBranchId = useMemo(() => {
    if (user?.branchId) return user.branchId;
    return branches[0]?.id ?? "";
  }, [branches, user?.branchId]);

  const paidVsUnpaidBar = useMemo(() => {
    const r = data?.revenue;
    if (!r || !canViewFinancial) return null;
    const paid = r.paidThisMonth;
    const unpaid = r.unpaidInvoicesTotal;
    const sum = paid + unpaid;
    if (sum <= 0) return null;
    const pct = Math.round((paid / sum) * 100);
    return { pct };
  }, [canViewFinancial, data?.revenue]);

  if (!canViewReports) {
    if (canReadQueue) {
      return null; // redirecting to the Queue
    }
    return <FrontDeskToday token={token} canReadBookings={canReadBookings} />;
  }

  if (loadState === "loading") {
    return (
      <section className="space-y-6">
        <div className="animate-pulse rounded-2xl bg-white p-8 shadow-sm ring-1 ring-[#E8E0D4]/50">
          <div className="h-8 w-64 rounded bg-[#E6DCCB]/80" />
          <div className="mt-4 h-4 w-full max-w-xl rounded bg-[#E6DCCB]/60" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`sk-${i}`}
              className="animate-pulse rounded-2xl bg-white p-5 ring-1 ring-[#E8E0D4]/50"
            >
              <div className="h-10 w-10 rounded-xl bg-[#E6DCCB]/80" />
              <div className="mt-4 h-3 w-28 rounded bg-[#E6DCCB]/80" />
              <div className="mt-3 h-8 w-16 rounded bg-[#E6DCCB]/80" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section className="rounded-2xl bg-[#FFF1EC] p-5 shadow-sm ring-1 ring-[#E7B9A4]/60 md:p-6">
        <p className="text-sm text-danger">{errorMessage}</p>
      </section>
    );
  }

  if (loadState !== "loaded" || !data) {
    return null;
  }

  const tb = data.today?.bookings;
  const attention = data.attention ?? [];
  const schedule = data.schedulePreview ?? [];
  const queue = data.queue;
  const revenue = data.revenue;
  const recentBookings = data.recentBookings ?? [];
  const recentClients = data.recentClients;
  const health = data.websiteHealth;

  return (
    <section className="space-y-6 md:space-y-8">
      <SlotHorizonBanner token={token} />
      <header className="rounded-2xl bg-white/90 p-6 shadow-[0_8px_30px_rgba(31,36,32,0.05)] ring-1 ring-[#E8E0D4]/70 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9A8B7A]">Command center</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#1F2420] md:text-3xl">
              Today at Alrouby Salon &amp; Spa
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#7A6A58] md:text-base">
              <CalendarDays className="h-4 w-4 shrink-0 text-[#B9974A]" strokeWidth={1.75} aria-hidden />
              <span>{cairoHeaderDate}</span>
              <span className="text-[#B5A896]">·</span>
              <span className="text-xs text-[#9A8B7A]">Africa/Cairo</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreateBooking && branches.length > 0 ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E0D4] bg-[#062A2D] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-[#0E342B] md:text-sm"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                New Booking
              </button>
            ) : null}
            {hasPermission("queue.read") ? (
              <Link
                href="/dashboard/queue"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-1.5 text-xs font-medium text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45 md:text-sm"
              >
                <Plus className="h-3.5 w-3.5 text-[#B9974A]" strokeWidth={1.75} aria-hidden />
                Add Walk-in
              </Link>
            ) : null}
            {canReadBookings ? (
              <Link
                href="/dashboard/bookings"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-1.5 text-xs font-medium text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45 md:text-sm"
              >
                <CalendarRange className="h-3.5 w-3.5 text-[#B9974A]" strokeWidth={1.75} aria-hidden />
                Open Calendar
              </Link>
            ) : null}
            {hasPermission("queue.read") ? (
              <Link
                href="/dashboard/queue"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-1.5 text-xs font-medium text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45 md:text-sm"
              >
                <ListOrdered className="h-3.5 w-3.5 text-[#B9974A]" strokeWidth={1.75} aria-hidden />
                Open Queue
              </Link>
            ) : null}
            {hasPermission("invoices.create_finalize") ? (
              <Link
                href="/dashboard/invoices"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-1.5 text-xs font-medium text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45 md:text-sm"
              >
                <CreditCard className="h-3.5 w-3.5 text-[#B9974A]" strokeWidth={1.75} aria-hidden />
                Create Invoice
              </Link>
            ) : null}
            {hasPermission("cashDrawer.read") ? (
              <Link
                href="/dashboard/cash-drawer"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-1.5 text-xs font-medium text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45 md:text-sm"
              >
                <Wallet className="h-3.5 w-3.5 text-[#B9974A]" strokeWidth={1.75} aria-hidden />
                Cash drawer
              </Link>
            ) : null}
            {hasPermission("dailyClosing.read") ? (
              <Link
                href={todayYmd ? `/dashboard/daily-closing?date=${todayYmd}` : "/dashboard/daily-closing"}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-1.5 text-xs font-medium text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45 md:text-sm"
              >
                <ClipboardCheck className="h-3.5 w-3.5 text-[#B9974A]" strokeWidth={1.75} aria-hidden />
                Daily Closing
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9A8B7A]">Today&apos;s bookings</p>
          <p className="mt-2 text-3xl font-semibold text-[#1F2420]">{formatCount(tb?.total ?? data.todayBookings)}</p>
          <ul className="mt-3 space-y-1.5 text-xs text-[#7A6A58]">
            <li className="flex justify-between gap-2">
              <span>Confirmed</span>
              <span className="font-medium text-[#1F2420]">{formatCount(tb?.confirmed ?? data.confirmedBookings)}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span>Pending</span>
              <span className="font-medium text-[#1F2420]">{formatCount(tb?.pending ?? data.pendingBookings)}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span>Completed</span>
              <span className="font-medium text-[#1F2420]">{formatCount(tb?.completed ?? data.completedBookings)}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span>Cancelled</span>
              <span className="font-medium text-[#1F2420]">{formatCount(tb?.cancelled ?? data.cancelledBookings)}</span>
            </li>
          </ul>
          {canReadBookings && todayYmd ? (
            <Link
              href={`/dashboard/bookings?dateFrom=${todayYmd}&dateTo=${todayYmd}`}
              className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#B9974A] hover:underline"
            >
              View today&apos;s bookings
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </Link>
          ) : null}
        </article>

        <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9A8B7A]">Queue now</p>
          {queue ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-[#FFFCF7] px-3 py-2 ring-1 ring-[#F0EBE3]/80">
                  <p className="text-[0.65rem] uppercase text-[#9A8B7A]">Waiting</p>
                  <p className="text-xl font-semibold text-[#1F2420]">{formatCount(queue.waitingNow)}</p>
                </div>
                <div className="rounded-xl bg-[#FFFCF7] px-3 py-2 ring-1 ring-[#F0EBE3]/80">
                  <p className="text-[0.65rem] uppercase text-[#9A8B7A]">In service</p>
                  <p className="text-xl font-semibold text-[#1F2420]">{formatCount(queue.inServiceNow)}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-[#7A6A58]">
                Avg wait {queue.avgWaitMinutes != null ? `${queue.avgWaitMinutes} min` : "—"} · Longest{" "}
                {queue.longestWaitMinutes != null ? `${queue.longestWaitMinutes} min` : "—"}
                {queue.longestWaitingClientName ? ` (${queue.longestWaitingClientName})` : ""}
              </p>
              <Link
                href="/dashboard/queue"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#B9974A] hover:underline"
              >
                Open queue
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              </Link>
            </>
          ) : (
            <p className="mt-3 text-sm text-[#7A6A58]">Queue metrics require queue access for your role.</p>
          )}
        </article>

        <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9A8B7A]">Today&apos;s revenue</p>
          {revenue && canViewFinancial ? (
            <>
              <p className="mt-2 text-2xl font-semibold text-[#1F2420]">{formatEGP(revenue.paidToday)}</p>
              <p className="mt-1 text-xs text-[#7A6A58]">Paid today</p>
              <ul className="mt-3 space-y-1 text-xs text-[#7A6A58]">
                <li className="flex justify-between gap-2">
                  <span>Unpaid (today&apos;s visits)</span>
                  <span className="font-medium text-[#1F2420]">{formatEGP(revenue.unpaidToday)}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>Refunds</span>
                  <span className="font-medium text-[#1F2420]">{formatEGP(revenue.refundsToday)}</span>
                </li>
              </ul>
              <Link
                href="/dashboard/payments"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#B9974A] hover:underline"
              >
                Payments
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              </Link>
            </>
          ) : (
            <p className="mt-3 text-sm text-[#7A6A58]">Revenue summary is limited to financial roles.</p>
          )}
        </article>

        <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9A8B7A]">Completion rate</p>
          <p className="mt-2 text-3xl font-semibold text-[#1F2420]">
            {typeof tb?.completionRate === "number"
              ? `${Math.round(tb.completionRate * 100)}%`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-[#7A6A58]">Completed ÷ total bookings today (slot date)</p>
        </article>
      </section>

      {attention.length > 0 ? (
        <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[#B9974A]" strokeWidth={1.75} aria-hidden />
            <h2 className="text-base font-semibold text-[#1F2420]">Needs attention</h2>
          </div>
          <ul className="space-y-2">
            {attention.map((item, idx) => (
              <li key={`${item.title}-${idx}`}>
                <Link
                  href={item.href}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm transition hover:opacity-95 ${attentionTone(item.severity)}`}
                >
                  <span className="font-medium">{item.title}</span>
                  {typeof item.count === "number" ? (
                    <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-[#1F2420]">
                      {item.count}
                    </span>
                  ) : (
                    <ExternalLink className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#F0EBE3] pb-4">
            <h2 className="text-base font-semibold text-[#1F2420]">Today&apos;s schedule</h2>
            {canReadBookings && todayYmd ? (
              <Link
                href={`/dashboard/bookings?date=${todayYmd}`}
                className="text-xs font-medium text-[#B9974A] hover:underline"
              >
                Open in calendar
              </Link>
            ) : null}
          </div>
          {!canReadBookings ? (
            <p className="text-sm text-[#7A6A58]">Booking schedule requires bookings access.</p>
          ) : schedule.length === 0 ? (
            <div className="rounded-xl bg-[#FFFCF7]/90 py-10 text-center ring-1 ring-[#F0EBE3]/80">
              <Clock className="mx-auto h-8 w-8 text-[#B9974A]/50" strokeWidth={1.5} aria-hidden />
              <p className="mt-3 text-sm text-[#7A6A58]">No bookings on today&apos;s slot calendar.</p>
            </div>
          ) : (
            <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {schedule.map((row) => (
                <li key={row.bookingId}>
                  <Link
                    href={`/dashboard/bookings?date=${row.slotDate}`}
                    className="flex flex-col gap-1 rounded-xl bg-[#FFFCF7]/90 px-3 py-3 ring-1 ring-[#F0EBE3]/80 transition hover:ring-[#B9974A]/35 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#9A8B7A]">
                        {formatScheduleTime(row)}
                      </p>
                      <p className="truncate font-medium text-[#1F2420]">{row.clientName ?? "Walk-in / unassigned"}</p>
                      <p className="truncate text-sm text-[#7A6A58]">{row.serviceSummary}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${statusChipClass(row.status)}`}>
                        {bookingStatusLabel(row.status)}
                      </span>
                      {row.paymentStatus ? (
                        <span className="text-[0.65rem] text-[#7A6A58]">Pay: {paymentStatusLabel(row.paymentStatus)}</span>
                      ) : null}
                      <span className="text-[0.65rem] text-[#9A8B7A]">{sourceLabel(row.source)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>

        <div className="flex flex-col gap-4">
          <article className="rounded-2xl border border-dashed border-[#E4DDD0] bg-[#FFFCF7]/40 p-5 md:p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9A8B7A]">Quick date</h2>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-[#B5A896]">Jump to a day in Cairo time.</p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 text-[#B5A896]">
                <button
                  type="button"
                  className="rounded-lg p-1 transition hover:bg-[#F0E8DC]/80"
                  aria-label="Previous week"
                  onClick={() => effectiveWeekStart && setWeekStartYmd(addDaysYmd(effectiveWeekStart, -7))}
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-1 transition hover:bg-[#F0E8DC]/80"
                  aria-label="Next week"
                  onClick={() => effectiveWeekStart && setWeekStartYmd(addDaysYmd(effectiveWeekStart, 7))}
                >
                  <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <CalendarDays className="ml-1 h-4 w-4 text-[#C4B49A]" strokeWidth={1.75} aria-hidden />
              </div>
            </div>
            <div className="flex justify-between gap-1 overflow-x-auto pb-1">
              {weekDays.map((ymd) => {
                const active = todayYmd != null && ymd === todayYmd;
                const d = new Date(`${ymd}T12:00:00.000Z`);
                const mon = d.toLocaleString("en-US", { month: "short" });
                const dayNum = ymd.slice(8, 10).replace(/^0/, "");
                return (
                  <Link
                    key={ymd}
                    href={`/dashboard/bookings?date=${ymd}`}
                    className={`flex min-w-[2.75rem] flex-col items-center rounded-xl px-2 py-2 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B9974A] ${
                      active
                        ? "bg-[#B9974A]/90 text-white shadow-sm shadow-[#B9974A]/20 ring-2 ring-[#B9974A]/40"
                        : "text-[#7A6A58] ring-1 ring-transparent hover:bg-[#F0E8DC]/90 hover:ring-[#E8E0D4]/80"
                    }`}
                    aria-label={`Open calendar for ${ymd}`}
                  >
                    <span className="text-[0.65rem] font-medium uppercase opacity-80">{mon}</span>
                    <span className="text-sm font-semibold">{dayNum}</span>
                  </Link>
                );
              })}
            </div>
          </article>

          <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[#1F2420]">Booking trend</h2>
              <div className="flex gap-1 rounded-full bg-[#FFFCF7] p-0.5 ring-1 ring-[#F0EBE3]/80">
                {(
                  [
                    ["7", "7d"],
                    ["30", "30d"],
                    ["month", "Month"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTrendRange(v)}
                    className={`rounded-full px-2.5 py-1 text-[0.65rem] font-medium transition ${
                      trendRange === v ? "bg-[#B9974A] text-white shadow-sm" : "text-[#7A6A58] hover:bg-[#F5F0E8]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <CompactTrendChart
              series={trendSeries}
              rangeLabel={trendRange === "7" ? "Last 7 days" : trendRange === "30" ? "Last 30 days" : "This month"}
              fillId={trendFillId}
            />
          </article>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {revenue && canViewFinancial ? (
          <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6">
            <h2 className="text-base font-semibold text-[#1F2420]">Revenue snapshot</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-[#FFFCF7]/90 px-3 py-2 ring-1 ring-[#F0EBE3]/80">
                <dt className="text-xs text-[#7A6A58]">Paid today</dt>
                <dd className="text-lg font-semibold text-[#1F2420]">{formatEGP(revenue.paidToday)}</dd>
              </div>
              <div className="rounded-xl bg-[#FFFCF7]/90 px-3 py-2 ring-1 ring-[#F0EBE3]/80">
                <dt className="text-xs text-[#7A6A58]">Paid this week</dt>
                <dd className="text-lg font-semibold text-[#1F2420]">{formatEGP(revenue.paidThisWeek)}</dd>
              </div>
              <div className="rounded-xl bg-[#FFFCF7]/90 px-3 py-2 ring-1 ring-[#F0EBE3]/80">
                <dt className="text-xs text-[#7A6A58]">Paid this month</dt>
                <dd className="text-lg font-semibold text-[#1F2420]">{formatEGP(revenue.paidThisMonth)}</dd>
              </div>
              <div className="rounded-xl bg-[#FFFCF7]/90 px-3 py-2 ring-1 ring-[#F0EBE3]/80">
                <dt className="text-xs text-[#7A6A58]">Unpaid invoices</dt>
                <dd className="text-lg font-semibold text-[#1F2420]">{formatEGP(revenue.unpaidInvoicesTotal)}</dd>
              </div>
              <div className="rounded-xl bg-[#FFFCF7]/90 px-3 py-2 ring-1 ring-[#F0EBE3]/80 sm:col-span-2">
                <dt className="text-xs text-[#7A6A58]">Avg booking value (month-to-date)</dt>
                <dd className="text-lg font-semibold text-[#1F2420]">{formatEGP(revenue.averageBookingValueMonth)}</dd>
              </div>
            </dl>
            {paidVsUnpaidBar ? (
              <div className="mt-4">
                <p className="text-xs text-[#7A6A58]">Paid vs outstanding (month)</p>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#F0EBE3]">
                  <div
                    className="bg-[#1F7A4A]"
                    style={{ width: `${paidVsUnpaidBar.pct}%` }}
                    title={`Paid ~${paidVsUnpaidBar.pct}%`}
                  />
                </div>
              </div>
            ) : null}
            <Link
              href="/dashboard/invoices"
              className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#B9974A] hover:underline"
            >
              Invoices
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </Link>
          </article>
        ) : null}

        {queue ? (
          <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6">
            <h2 className="text-base font-semibold text-[#1F2420]">Queue performance</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-[#FFFCF7]/90 px-3 py-2 ring-1 ring-[#F0EBE3]/80">
                <dt className="text-xs text-[#7A6A58]">Walk-ins today</dt>
                <dd className="text-lg font-semibold text-[#1F2420]">{formatCount(queue.walkInsToday)}</dd>
              </div>
              <div className="rounded-xl bg-[#FFFCF7]/90 px-3 py-2 ring-1 ring-[#F0EBE3]/80">
                <dt className="text-xs text-[#7A6A58]">Served today</dt>
                <dd className="text-lg font-semibold text-[#1F2420]">{formatCount(queue.servedToday)}</dd>
              </div>
              <div className="rounded-xl bg-[#FFFCF7]/90 px-3 py-2 ring-1 ring-[#F0EBE3]/80">
                <dt className="text-xs text-[#7A6A58]">Waiting now</dt>
                <dd className="text-lg font-semibold text-[#1F2420]">{formatCount(queue.waitingNow)}</dd>
              </div>
              <div className="rounded-xl bg-[#FFFCF7]/90 px-3 py-2 ring-1 ring-[#F0EBE3]/80">
                <dt className="text-xs text-[#7A6A58]">In service</dt>
                <dd className="text-lg font-semibold text-[#1F2420]">{formatCount(queue.inServiceNow)}</dd>
              </div>
            </dl>
            <Link
              href="/dashboard/queue"
              className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#B9974A] hover:underline"
            >
              Queue board
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </Link>
          </article>
        ) : null}
      </div>

        {data?.staffToday?.supported ? (
          <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#1F2420]">Staff today</h2>
              <div className="flex flex-wrap gap-2 text-xs text-[#7A6A58]">
                <span>Scheduled: {formatCount(data.staffToday.scheduledStaffToday)}</span>
                <span>·</span>
                <span>Available: {formatCount(data.staffToday.availableNow)}</span>
                <span>·</span>
                <span>Busy: {formatCount(data.staffToday.busyNow)}</span>
                <span>·</span>
                <span>Off: {formatCount(data.staffToday.offToday)}</span>
              </div>
            </div>
            {(data.staffToday.staffToday?.length ?? 0) === 0 ? (
              <p className="text-sm text-[#7A6A58]">
                No active staff profiles for this branch yet. Configure staff in Staff Schedule.
              </p>
            ) : (
              <ul className="divide-y divide-[#F0EBE3]">
                {(data.staffToday.staffToday ?? []).map((s) => (
                  <li key={s.staffProfileId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-medium text-[#1F2420]">{s.displayName}</p>
                      <p className="text-xs text-[#7A6A58]">
                        {s.status === "busy"
                          ? "Busy"
                          : s.status === "available"
                            ? (s.processingNow ?? 0) > 0
                              ? "Free while a client's colour processes"
                              : "Available"
                            : "Off"}{" "}
                        · {formatCount(s.servicesCompletedToday)} completed today
                        {typeof s.workloadPercent === "number"
                          ? ` · ${s.workloadPercent}% workload`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${
                        s.status === "busy"
                          ? "bg-[#E8F2EE] text-[#0E342B]"
                          : s.status === "available"
                            ? "bg-[#FBF6E8] text-[#5C4A18]"
                            : "bg-[#F4F1EC] text-[#5E574C]"
                      }`}
                    >
                      {s.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/dashboard/staff-schedule"
              className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#B9974A] hover:underline"
            >
              Staff schedule
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </Link>
          </article>
        ) : (
          <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#1F2420]">Staff today</h2>
            </div>
            <p className="text-sm text-[#7A6A58]">
              Staff insights require the <span className="font-medium">staff.read</span> permission.
            </p>
          </article>
        )}

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl bg-white shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0EBE3] px-5 py-4 md:px-6">
            <h2 className="text-base font-semibold text-[#1F2420]">Recent bookings</h2>
            {canReadBookings ? (
              <Link
                href="/dashboard/bookings"
                className="inline-flex items-center gap-1 text-sm font-medium text-[#B9974A] hover:underline"
              >
                View all
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </Link>
            ) : null}
          </div>
          {!canReadBookings ? (
            <p className="px-5 py-8 text-sm text-[#7A6A58] md:px-6">You do not have access to booking details.</p>
          ) : recentBookings.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[#7A6A58] md:px-6">No recent bookings.</p>
          ) : (
            <ul className="divide-y divide-[#F0EBE3]">
              {recentBookings.map((b: DashboardOverviewRecentBookingRow) => (
                <li key={b.bookingId} className="px-5 py-3 md:px-6">
                  <Link
                    href={`/dashboard/bookings?date=${b.slotDate}`}
                    className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-[#9A8B7A]">
                        {b.slotDate} · {formatWallClock12h(b.startTime)}
                      </p>
                      <p className="font-medium text-[#1F2420]">{b.clientName ?? "Client"}</p>
                      <p className="truncate text-sm text-[#7A6A58]">{b.serviceSummary}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${statusChipClass(b.status)}`}>
                        {b.status}
                      </span>
                      {b.paymentStatus ? (
                        <span className="text-[0.65rem] text-[#7A6A58]">{b.paymentStatus}</span>
                      ) : null}
                      <span className="text-[0.65rem] text-[#9A8B7A]">{sourceLabel(b.source)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#1F2420]">Recent clients</h2>
            {canReadClients ? (
              <Link href="/dashboard/clients" className="text-xs font-medium text-[#B9974A] hover:underline">
                View all
              </Link>
            ) : null}
          </div>
          {!canReadClients || !recentClients ? (
            <p className="text-sm text-[#7A6A58]">Client insights require clients access.</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2 text-xs text-[#7A6A58]">
                <span className="rounded-full bg-[#FFFCF7] px-2 py-1 ring-1 ring-[#F0EBE3]/80">
                  New this week:{" "}
                  <strong className="text-[#1F2420]">{formatCount(recentClients.newClientsThisWeek)}</strong>
                </span>
                <span className="rounded-full bg-[#FFFCF7] px-2 py-1 ring-1 ring-[#F0EBE3]/80">
                  Returning today:{" "}
                  <strong className="text-[#1F2420]">{formatCount(recentClients.returningClientsToday)}</strong>
                </span>
              </div>
              <ul className="space-y-2">
                {recentClients.rows.map((c: DashboardOverviewRecentClientRow) => {
                  const contact = canViewClientContact
                    ? c.phone || c.email || null
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
                        <Link href={`/dashboard/clients/${c.id}`} className="truncate text-sm font-medium text-[#1F2420] hover:underline">
                          {c.fullName}
                        </Link>
                        {contact ? <p className="truncate text-xs text-[#7A6A58]">{contact}</p> : null}
                        <p className="text-[0.65rem] text-[#9A8B7A]">
                          Visits {formatCount(c.totalVisits)}
                          {c.lastVisitDate ? ` · Last visit ${c.lastVisitDate}` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </article>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6">
          <h2 className="text-base font-semibold text-[#1F2420]">Website health</h2>
          {health &&
          (health.activeTestimonials != null ||
            health.galleryImageCount != null ||
            health.servicesMissingImages != null) ? (
            <ul className="mt-4 space-y-2 text-sm text-[#7A6A58]">
              {health.activeTestimonials != null ? (
                <li className="flex justify-between gap-2">
                  <Link href="/dashboard/reviews" className="hover:text-[#B9974A]">
                    Active testimonials
                  </Link>
                  <span className="font-semibold text-[#1F2420]">{formatCount(health.activeTestimonials)}</span>
                </li>
              ) : null}
              {health.galleryImageCount != null ? (
                <li className="flex justify-between gap-2">
                  <Link href="/dashboard/gallery" className="hover:text-[#B9974A]">
                    Gallery images
                  </Link>
                  <span className="font-semibold text-[#1F2420]">{formatCount(health.galleryImageCount)}</span>
                </li>
              ) : null}
              {health.servicesMissingImages != null ? (
                <li className="flex justify-between gap-2">
                  <Link href="/dashboard/services" className="hover:text-[#B9974A]">
                    Services missing images
                  </Link>
                  <span className="font-semibold text-[#1F2420]">{formatCount(health.servicesMissingImages)}</span>
                </li>
              ) : null}
              {health.packagesMissingImages != null ? (
                <li className="flex justify-between gap-2">
                  <Link href="/dashboard/packages" className="hover:text-[#B9974A]">
                    Packages missing images
                  </Link>
                  <span className="font-semibold text-[#1F2420]">{formatCount(health.packagesMissingImages)}</span>
                </li>
              ) : null}
              {health.publishedWebsiteSections != null ? (
                <li className="flex justify-between gap-2">
                  <Link href="/dashboard/website-content" className="hover:text-[#B9974A]">
                    Published sections
                  </Link>
                  <span className="font-semibold text-[#1F2420]">{formatCount(health.publishedWebsiteSections)}</span>
                </li>
              ) : null}
              {health.draftWebsiteSections != null ? (
                <li className="flex justify-between gap-2">
                  <Link href="/dashboard/website-content" className="hover:text-[#B9974A]">
                    Draft sections
                  </Link>
                  <span className="font-semibold text-[#1F2420]">{formatCount(health.draftWebsiteSections)}</span>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-[#7A6A58]">
              Content metrics need gallery, website, services, or reviews access.
            </p>
          )}
        </article>

        <article className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[#1F2420]">Recent activity</h2>
            {hasPermission("audit.read") ? (
              <Link href="/dashboard/audit-logs" className="text-xs font-medium text-[#B9974A] hover:underline">
                View all
              </Link>
            ) : null}
          </div>
          {Array.isArray(data.recentActivity) && data.recentActivity.length > 0 ? (
            <ul className="space-y-3">
              {data.recentActivity.slice(0, 8).map((activity, index) => {
                const rel = formatRelativeTime(activity.createdAt);
                const actor = activity.user?.name?.trim();
                const subtitle = [actor, activity.module].filter(Boolean).join(" · ");
                return (
                  <li
                    key={activity.id ?? `${activity.action ?? "a"}-${index}`}
                    className="flex gap-3 rounded-xl bg-[#FFFCF7]/90 p-3 ring-1 ring-[#F0EBE3]/80"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#B9974A]/20 text-[#7A5F2A]"
                      aria-hidden
                    >
                      <Sparkles className="h-4 w-4" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#1F2420]">{formatHumanAuditAction(activity.action)}</p>
                      <p className="mt-0.5 truncate text-xs text-[#7A6A58]">{subtitle}</p>
                    </div>
                    {rel ? <span className="shrink-0 text-xs text-[#9A8B7A]">{rel}</span> : null}
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

      {token && canCreateBooking && branches.length > 0 ? (
        <DashboardCreateBookingDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          token={token}
          branches={branches}
          initialBranchId={initialBranchId || branches[0]!.id}
          branchSelectDisabled={branches.length === 1}
          onCreated={() => setCreateOpen(false)}
        />
      ) : null}
    </section>
  );
}

/** Amber banner when clients can book fewer than 7 days ahead (slots are running out). */
function SlotHorizonBanner({ token }: { token: string | null }) {
  const [horizon, setHorizon] = useState<DashboardOverviewTodayResponse["slotHorizon"] | null>(null);
  const [notifications, setNotifications] = useState<DashboardOverviewTodayResponse["notifications"] | null>(
    null,
  );
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getDashboardOverviewToday(token)
      .then((d) => {
        if (cancelled) return;
        setHorizon(d.slotHorizon ?? null);
        setNotifications(d.notifications ?? null);
      })
      .catch(() => {
        /* the banner is best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);
  const whatsappBanner =
    notifications && (notifications.down || notifications.failed24h > 0) ? (
      <div
        className={`rounded-2xl border px-5 py-4 text-sm shadow-sm ${
          notifications.down
            ? "border-red-200 bg-red-50/90 text-red-950"
            : "border-amber-200 bg-amber-50/90 text-amber-950"
        }`}
      >
        <span className="font-semibold">
          {notifications.down
            ? `WhatsApp messages are not going out: ${notifications.failed24h} failed in the last 24 hours and none were delivered.`
            : `${notifications.failed24h} WhatsApp message${notifications.failed24h === 1 ? "" : "s"} failed in the last 24 hours.`}
        </span>{" "}
        {notifications.down
          ? "Clients are not receiving confirmations, reminders or login codes. Check the Wapilot token and that the salon phone is connected."
          : "Check the numbers and retry from the log."}{" "}
        <Link href="/dashboard/notification-logs" className="font-semibold underline">
          Notification logs
        </Link>
      </div>
    ) : null;
  if (!horizon?.low) return whatsappBanner;
  return (
    <>
    {whatsappBanner}
    <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm text-amber-950 shadow-sm">
      <span className="font-semibold">
        {horizon.lastSlotDate
          ? `Online booking is only open for the next ${Math.max(horizon.daysAhead, 0)} day${horizon.daysAhead === 1 ? "" : "s"}.`
          : "There are no bookable time slots — clients cannot book online."}
      </span>{" "}
      Time slots are normally added automatically 28 days ahead.{" "}
      <Link href="/dashboard/holidays-closures" className="font-semibold underline">
        Check slots &amp; closures
      </Link>
    </div>
    </>
  );
}

function FrontDeskToday({ token, canReadBookings }: { token: string | null; canReadBookings: boolean }) {
  const [data, setData] = useState<DashboardOverviewTodayResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getDashboardOverviewToday(token)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError("We couldn't load today's summary. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);
  const tiles = data
    ? [
        ["Expected", data.queue.expected],
        ["Waiting", data.queue.waiting],
        ["In service", data.queue.inService],
        ["Completed", data.queue.completed],
      ]
    : [];
  return (
    <section className="rounded-2xl bg-white p-6 shadow-[0_8px_30px_rgba(31,36,32,0.06)] ring-1 ring-[#E8E0D4]/60 md:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#B9974A]">Today</p>
      <h2 className="mt-1 text-xl font-semibold text-[#062A2D]">Front desk summary</h2>
      {error ? <p className="mt-3 text-sm text-[#8B4428]">{error}</p> : null}
      {data ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-[#E8E0D4] bg-[#FBF8F2] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-[#1F2420]">{value}</p>
            </div>
          ))}
        </div>
      ) : !error ? (
        <p className="mt-3 text-sm text-[#7A6A58]">Loading…</p>
      ) : null}
      {canReadBookings ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/dashboard/bookings" className="rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA]">
            Open calendar
          </Link>
          <Link href="/dashboard/bookings" className="rounded-xl border border-[#D8CBB8] bg-white px-4 py-2 text-sm font-semibold text-[#1F2420]">
            Bookings
          </Link>
        </div>
      ) : null}
    </section>
  );
}
