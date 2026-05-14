"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Bell, ChevronDown, LogOut, Sparkles, UserRound, X } from "lucide-react";
import { getDashboardReportsOverview } from "@rouby/api-client";
import {
  DASHBOARD_NAV_GROUPS,
  type DashboardNavGroup,
  type DashboardNavItem,
} from "@/lib/dashboard-nav";
import { useDashboardAuth } from "@/lib/dashboard-auth";
import { useDashboardShellFeed } from "@/lib/dashboard-shell-feed-context";

const RING_ACTIONS = new Set(["booking.created", "booking_change_request.created"]);
const ONE_HOUR_MS = 60 * 60 * 1000;
const NOTIFICATION_READ_KEYS_STORAGE = "dashboard.notification.read.keys.v1";

type DashboardNotification = {
  key: string;
  title: string;
  body: string;
  whenLabel: string;
  sortTs: number;
  href: string;
};

function parseIsoDateTime(date: string | undefined, time: string | undefined): number | null {
  if (!date || !time) {
    return null;
  }

  const normalizedDate = date.includes("T") ? date.slice(0, 10) : date;
  let normalizedTime = time.trim();
  if (normalizedTime.includes("T")) {
    const parsedTime = Date.parse(normalizedTime);
    if (!Number.isNaN(parsedTime)) {
      normalizedTime = new Date(parsedTime).toISOString().slice(11, 19);
    }
  }
  if (normalizedTime.includes(".")) {
    normalizedTime = normalizedTime.split(".")[0] ?? normalizedTime;
  }
  if (normalizedTime.endsWith("Z")) {
    normalizedTime = normalizedTime.slice(0, -1);
  }
  if (normalizedTime.includes("+")) {
    normalizedTime = normalizedTime.split("+")[0] ?? normalizedTime;
  }
  const value = Date.parse(`${normalizedDate}T${normalizedTime}`);
  return Number.isNaN(value) ? null : value;
}

function formatTimeUntil(ts: number): string {
  const diffMs = ts - Date.now();
  if (diffMs <= 0) {
    return "starting now";
  }
  const min = Math.floor(diffMs / (1000 * 60));
  if (min < 60) {
    return `in ${min}m`;
  }
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return rem > 0 ? `in ${hr}h ${rem}m` : `in ${hr}h`;
}

function formatSlotStartLabel(date: string | undefined, time: string | undefined): string {
  const ts = parseIsoDateTime(date, time);
  if (ts === null) {
    return "within 1 hour";
  }
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function uniqueByKey(items: DashboardNotification[]): DashboardNotification[] {
  const seen = new Set<string>();
  const result: DashboardNotification[] = [];
  for (const item of items) {
    if (seen.has(item.key)) {
      continue;
    }
    seen.add(item.key);
    result.push(item);
  }
  return result;
}

function isDashboardNavActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/$/, "") || "/";
  const base = href.replace(/\/$/, "") || "/";
  if (base === "/dashboard") {
    return path === "/dashboard";
  }
  return path === base || path.startsWith(`${base}/`);
}

function initialsFromName(name: string | undefined | null): string {
  if (!name?.trim()) {
    return "—";
  }
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

function useDismissOnOutsideAndEscape(
  open: boolean,
  setOpen: (v: boolean) => void,
  containerRef: React.RefObject<HTMLElement | null | undefined>,
) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const el = containerRef.current;
      if (el && !el.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, setOpen, containerRef]);
}

function filterNavGroups(
  groups: DashboardNavGroup[],
  hasPermission: (p?: string) => boolean,
): DashboardNavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const perm = item.permission;
        if (!perm) {
          return true;
        }
        if (Array.isArray(perm)) {
          return perm.some((key) => hasPermission(key));
        }
        return hasPermission(perm);
      }),
    }))
    .filter((group) => group.items.length > 0);
}

function SidebarNavGroups({
  pathname,
  groups,
  onNavigate,
}: {
  pathname: string;
  groups: DashboardNavGroup[];
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="mb-2 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#B9974A]/75">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isDashboardNavActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                      active
                        ? "bg-[#B9974A]/18 text-[#F6F2EA] shadow-inner shadow-black/10"
                        : "text-[#E8E2D6]/90 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <Icon
                      className={`h-[1.125rem] w-[1.125rem] shrink-0 ${active ? "text-[#B9974A]" : "text-[#B9974A]/75"}`}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 break-words leading-snug">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) {
    return "";
  }
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return "";
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

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { hasPermission, user, logout, status, token } = useDashboardAuth();
  const {
    recentActivity,
    upcomingAppointments,
    setOverviewRecentActivity,
    setOverviewUpcomingAppointments,
  } = useDashboardShellFeed();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set());

  const profileWrapRef = useRef<HTMLDivElement>(null);
  const notifWrapRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const profileMenuId = useId();
  const notifMenuId = useId();

  useDismissOnOutsideAndEscape(profileOpen, setProfileOpen, profileWrapRef);
  useDismissOnOutsideAndEscape(notifOpen, setNotifOpen, notifWrapRef);

  const navGroups = useMemo(
    () => filterNavGroups(DASHBOARD_NAV_GROUPS, hasPermission),
    [hasPermission],
  );

  const flatNavItems = useMemo(
    () => navGroups.flatMap((g) => g.items) as DashboardNavItem[],
    [navGroups],
  );

  const currentNavLabel = useMemo(
    () =>
      flatNavItems.find((item) => isDashboardNavActive(pathname, item.href))?.label ??
      "Operations",
    [flatNavItems, pathname],
  );
  const userInitials = initialsFromName(user?.name);
  const isOverviewRoute = pathname.replace(/\/$/, "") === "/dashboard";

  const canSalonSettings =
    hasPermission("settings.system.read") || hasPermission("settings.read");
  const canViewReports = hasPermission("reports.view");
  const notifications = useMemo(() => {
    const fromActivity: DashboardNotification[] = recentActivity
      .filter((activity) => RING_ACTIONS.has((activity.action ?? "").toLowerCase()))
      .map((activity, index) => {
        const action = (activity.action ?? "").toLowerCase();
        const createdTs = Date.parse(activity.createdAt ?? "");
        const sortTs = Number.isNaN(createdTs) ? Date.now() - index : createdTs;
        const actor = activity.user?.name ? `${activity.user.name} ` : "";
        if (action === "booking_change_request.created") {
          return {
            key: `activity:${activity.id ?? `${action}:${activity.createdAt ?? index}`}`,
            title: "Change request submitted",
            body: `${actor}submitted a booking change request.`.trim(),
            whenLabel: formatRelativeTime(activity.createdAt),
            sortTs,
            href: "/dashboard/booking-change-requests",
          };
        }
        return {
          key: `activity:${activity.id ?? `${action}:${activity.createdAt ?? index}`}`,
          title: "New booking received",
          body: `${actor}created a new booking.`.trim(),
          whenLabel: formatRelativeTime(activity.createdAt),
          sortTs,
          href: "/dashboard/bookings",
        };
      });

    const now = Date.now();
    const fromUpcoming: DashboardNotification[] = upcomingAppointments
      .map((booking, index) => {
        const startTs = parseIsoDateTime(booking.slot?.date, booking.slot?.startTime);
        if (startTs === null) {
          return null;
        }
        const diff = startTs - now;
        if (diff < 0 || diff > ONE_HOUR_MS) {
          return null;
        }
        const clientName = booking.client?.fullName ?? "A client";
        const bookingKey = booking.id || `${booking.slot?.date ?? "d"}:${booking.slot?.startTime ?? "t"}:${index}`;
        return {
          key: `upcoming:${bookingKey}:${booking.slot?.date ?? ""}:${booking.slot?.startTime ?? ""}`,
          title: "Upcoming booking soon",
          body: `${clientName}'s booking starts ${formatTimeUntil(startTs)} (${formatSlotStartLabel(booking.slot?.date, booking.slot?.startTime)}).`,
          whenLabel: formatTimeUntil(startTs),
          sortTs: startTs,
          href: "/dashboard/bookings",
        } satisfies DashboardNotification;
      })
      .filter((item): item is DashboardNotification => item !== null);

    return uniqueByKey([...fromActivity, ...fromUpcoming])
      .sort((a, b) => b.sortTs - a.sortTs)
      .slice(0, 12);
  }, [recentActivity, upcomingAppointments]);

  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !readKeys.has(item.key)),
    [notifications, readKeys],
  );
  const hasNotifDot = unreadNotifications.length > 0;

  useEffect(() => {
    if (status !== "authenticated" || !token || !canViewReports) {
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const data = await getDashboardReportsOverview(token);
        if (cancelled) {
          return;
        }
        setOverviewRecentActivity(data.recentActivity ?? []);
        setOverviewUpcomingAppointments(data.upcomingAppointments ?? []);
      } catch {
        // Keep previous notification state if polling fails.
      }
    };

    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    canViewReports,
    setOverviewRecentActivity,
    setOverviewUpcomingAppointments,
    status,
    token,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(NOTIFICATION_READ_KEYS_STORAGE);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }
      const keys = parsed.filter((v): v is string => typeof v === "string");
      setReadKeys(new Set(keys));
    } catch {
      // ignore malformed local storage and continue with empty read set
    }
  }, []);

  const markNotificationsAsRead = useCallback((keys: string[]) => {
    if (keys.length === 0 || typeof window === "undefined") {
      return;
    }
    setReadKeys((prev) => {
      const merged = new Set(prev);
      for (const key of keys) {
        merged.add(key);
      }
      const compact = Array.from(merged).slice(-500);
      window.localStorage.setItem(NOTIFICATION_READ_KEYS_STORAGE, JSON.stringify(compact));
      return new Set(compact);
    });
  }, []);

  const openProfile = useCallback(() => {
    setNotifOpen(false);
    setProfileOpen((o) => !o);
  }, []);

  const openNotif = useCallback(() => {
    setProfileOpen(false);
    setNotifOpen((open) => {
      const next = !open;
      if (next) {
        markNotificationsAsRead(notifications.map((item) => item.key));
      }
      return next;
    });
  }, [markNotificationsAsRead, notifications]);

  useEffect(() => {
    setMobileNavOpen(false);
    setProfileOpen(false);
    setNotifOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!profileOpen) {
      return;
    }
    const t = window.setTimeout(() => {
      const menu = profileMenuRef.current;
      if (!menu) {
        return;
      }
      const first =
        menu.querySelector<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? undefined;
      first?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [profileOpen]);

  const sidebarBrand = (
    <div className="border-b border-white/[0.08] px-5 py-6">
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#B9974A]/50 bg-[#B9974A]/15 text-sm font-semibold tracking-tight text-[#E8D4A0]"
          aria-hidden
        >
          A
        </div>
        <div className="min-w-0 pt-0.5">
          <h1 className="text-base font-semibold tracking-wide text-[#F6F2EA]">
            Alrouby Dashboard
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-[#B9974A]/85">
            Reception and management workspace
          </p>
        </div>
      </div>
    </div>
  );

  const menuPanelClass =
    "absolute right-0 z-30 mt-2 w-[min(23rem,calc(100vw-1.5rem))] rounded-2xl border border-[#E8E0D4] bg-white py-2 shadow-[0_12px_40px_rgba(31,36,32,0.12)] ring-1 ring-black/[0.03]";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="relative hidden w-[17.5rem] shrink-0 flex-col bg-[#062A2D] text-sidebar-foreground lg:flex lg:bg-gradient-to-b lg:from-[#062A2D] lg:to-[#0A2528] lg:shadow-[4px_0_24px_rgba(6,42,45,0.35)]">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(185,151,74,0.12),transparent_55%)]"
            aria-hidden
          />
          {sidebarBrand}
          <nav className="relative flex-1 overflow-y-auto scroll-smooth px-3 py-4">
            <SidebarNavGroups pathname={pathname} groups={navGroups} />
          </nav>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-[#FAF7F0]">
          <header className="sticky top-0 z-20 border-b border-[#E8E0D4]/80 bg-[#FFFCF7]/92 backdrop-blur-md">
            <div className="flex items-start justify-between gap-4 px-4 py-4 md:items-center md:px-6 md:py-4">
              <div className="flex min-w-0 flex-1 items-start gap-3 md:items-center">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E8E0D4] bg-white text-[#1F2420] shadow-sm lg:hidden"
                  aria-label="Open navigation menu"
                >
                  <span className="text-lg leading-none" aria-hidden>
                    ☰
                  </span>
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight text-[#1F2420] md:text-xl">
                      {currentNavLabel}
                    </h2>
                    {isOverviewRoute ? (
                      <Sparkles
                        className="hidden h-4 w-4 text-[#B9974A] sm:inline"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  {!isOverviewRoute ? (
                    <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.14em] text-[#7A6A58]/90">
                      Alrouby Salon &amp; Spa
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-[#7A6A58] md:hidden">
                      Reception &amp; management
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <div className="relative" ref={notifWrapRef}>
                  <button
                    type="button"
                    onClick={openNotif}
                    className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[#E8E0D4] bg-white text-[#5C5348] shadow-sm transition hover:border-[#B9974A]/40 hover:text-[#1F2420]"
                    aria-label="Notifications from overview activity"
                    aria-expanded={notifOpen}
                    aria-controls={notifMenuId}
                    aria-haspopup="true"
                  >
                    <Bell className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />
                    {hasNotifDot ? (
                      <span
                        className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#C45C4A] ring-2 ring-white"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                  {notifOpen ? (
                    <div
                      id={notifMenuId}
                      role="region"
                      aria-label="Notifications"
                      className={`${menuPanelClass} max-h-[min(24rem,70vh)] overflow-y-auto`}
                    >
                      <div className="border-b border-[#F0EBE3] px-4 py-3">
                        <p className="text-sm font-semibold text-[#1F2420]">Notifications</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-[#7A6A58]">
                          New bookings, change requests, and bookings starting within 1 hour.
                        </p>
                      </div>
                      {notifications.length === 0 ? (
                        <p className="px-4 py-6 text-center text-sm text-[#7A6A58]">
                          You are all caught up.
                        </p>
                      ) : (
                        <ul className="list-none py-1">
                          {notifications.map((item) => {
                            const isUnread = !readKeys.has(item.key);
                            return (
                              <li
                                key={item.key}
                                className="px-4 py-2.5"
                              >
                                <Link
                                  href={item.href}
                                  onClick={() => setNotifOpen(false)}
                                  className="block rounded-xl border border-transparent bg-[#FFFCF7]/70 px-3 py-2.5 transition hover:border-[#E8E0D4] hover:bg-[#FFFCF7]"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-semibold text-[#1F2420]">{item.title}</p>
                                    {isUnread ? (
                                      <span
                                        className="mt-1 inline-block h-2 w-2 rounded-full bg-[#C45C4A]"
                                        aria-label="Unread notification"
                                      />
                                    ) : null}
                                  </div>
                                  <p className="mt-1 text-xs leading-relaxed text-[#5C5348]">{item.body}</p>
                                  <p className="mt-1.5 text-xs text-[#9A8B7A]">{item.whenLabel || "Just now"}</p>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="relative" ref={profileWrapRef}>
                  <button
                    type="button"
                    onClick={openProfile}
                    className="flex items-center gap-2 rounded-2xl border border-[#E8E0D4] bg-white py-1.5 pl-1.5 pr-2 shadow-sm transition hover:border-[#B9974A]/40 sm:pr-2"
                    aria-expanded={profileOpen}
                    aria-controls={profileMenuId}
                    aria-haspopup="menu"
                    aria-label="Account menu"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#062A2D] text-xs font-semibold text-[#E8D4A0]">
                      <span className="sm:hidden">
                        <UserRound className="h-5 w-5 text-[#E8D4A0]" strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="hidden sm:inline">{userInitials}</span>
                    </div>
                    <div className="hidden max-w-[10rem] truncate text-left leading-tight sm:block md:max-w-[12rem]">
                      <p className="truncate text-sm font-medium text-[#1F2420]">
                        {user?.name ?? "User"}
                      </p>
                      <p className="truncate text-xs text-[#7A6A58]">{user?.email ?? "—"}</p>
                    </div>
                    <ChevronDown
                      className={`hidden h-4 w-4 shrink-0 text-[#7A6A58] transition sm:block ${profileOpen ? "rotate-180" : ""}`}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  </button>
                  {profileOpen ? (
                    <ProfileDropdownPanel
                      menuId={profileMenuId}
                      panelRef={profileMenuRef}
                      user={user}
                      canSalonSettings={canSalonSettings}
                      logout={logout}
                      onNavigate={() => setProfileOpen(false)}
                      className={menuPanelClass}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </header>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
        </div>
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-[#062A2D]/50 backdrop-blur-[2px]"
          />
          <aside className="relative z-10 flex h-full w-[min(19rem,88vw)] flex-col bg-gradient-to-b from-[#062A2D] to-[#0A2528] text-sidebar-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
              <p className="text-sm font-semibold tracking-wide text-[#F6F2EA]">
                Alrouby Dashboard
              </p>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.12] text-[#E8E2D6]"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto scroll-smooth px-3 py-3">
              <SidebarNavGroups
                pathname={pathname}
                groups={navGroups}
                onNavigate={() => setMobileNavOpen(false)}
              />
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function ProfileDropdownPanel({
  menuId,
  panelRef,
  user,
  canSalonSettings,
  logout,
  onNavigate,
  className,
}: {
  menuId: string;
  panelRef: React.RefObject<HTMLDivElement | null>;
  user: { name: string; email: string } | null;
  canSalonSettings: boolean;
  logout: () => void;
  onNavigate: () => void;
  className: string;
}) {
  return (
    <div ref={panelRef} id={menuId} role="menu" className={className}>
      <div className="border-b border-[#F0EBE3] px-4 py-3">
        <p className="truncate text-sm font-semibold text-[#1F2420]">{user?.name ?? "User"}</p>
        <p className="mt-0.5 truncate text-xs text-[#7A6A58]">{user?.email ?? "—"}</p>
      </div>
      <Link
        href="/dashboard/profile"
        role="menuitem"
        className="block px-4 py-2.5 text-sm text-[#1F2420] hover:bg-[#FFFCF7]"
        onClick={onNavigate}
      >
        My profile
      </Link>
      {canSalonSettings ? (
        <Link
          href="/dashboard/settings"
          role="menuitem"
          className="block px-4 py-2.5 text-sm text-[#1F2420] hover:bg-[#FFFCF7]"
          onClick={onNavigate}
        >
          Salon settings
        </Link>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[#1F2420] hover:bg-[#FFFCF7]"
        onClick={() => {
          onNavigate();
          logout();
        }}
      >
        <LogOut className="h-4 w-4 text-[#7A6A58]" strokeWidth={1.75} aria-hidden />
        Sign out
      </button>
    </div>
  );
}
