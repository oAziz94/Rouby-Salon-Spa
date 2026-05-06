"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DASHBOARD_NAV_ITEMS } from "@/lib/dashboard-nav";
import { useDashboardAuth } from "@/lib/dashboard-auth";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { hasPermission, user, logout } = useDashboardAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems = useMemo(
    () => DASHBOARD_NAV_ITEMS.filter((item) => hasPermission(item.permission)),
    [hasPermission],
  );
  const currentNavLabel = useMemo(
    () =>
      navItems.find(
        (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
      )?.label ?? "Operations",
    [navItems, pathname],
  );

  useEffect(() => {
    setMobileNavOpen(false);
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 flex-col border-r border-[#4A3540] bg-sidebar text-sidebar-foreground lg:flex">
          <div className="border-b border-[#4A3540] px-6 py-6">
            <h1 className="text-lg font-semibold tracking-wide">Alrouby Dashboard</h1>
            <p className="mt-1 text-xs text-sidebar-muted">
              Reception and management workspace
            </p>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-md px-3 py-2 text-sm transition ${
                        active
                          ? "bg-[#3A2531] text-white"
                          : "text-sidebar-foreground/90 hover:bg-[#35212D] hover:text-white focus-visible:bg-[#35212D] focus-visible:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="border-t border-[#4A3540] px-6 py-4">
            <button
              type="button"
              onClick={logout}
              className="w-full rounded-md border border-sidebar-muted/40 px-3 py-2 text-sm text-sidebar-foreground hover:bg-[#35212D]"
            >
              Sign out
            </button>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col bg-[#FAF7F0]">
          <header className="sticky top-0 z-20 border-b border-border bg-[#FFFDF9]/90 backdrop-blur">
            <div className="flex items-center justify-between px-4 py-4 md:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-white text-[#1F2420] lg:hidden"
                  aria-label="Open navigation menu"
                >
                  ☰
                </button>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[#7A6A58]">
                    Admin Dashboard
                  </p>
                  <h2 className="text-lg font-semibold text-[#1F2420]">{currentNavLabel}</h2>
                </div>
              </div>
              <div className="max-w-[14rem] text-right sm:max-w-none">
                <p className="truncate text-sm font-medium text-[#1F2420]">
                  {user?.name ?? "Dashboard User"}
                </p>
                <p className="truncate text-xs text-[#7A6A58]">{user?.email ?? "-"}</p>
              </div>
            </div>
          </header>
          <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
        </div>
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-[#2A1722]/40"
          />
          <aside className="relative z-10 flex h-full w-[17rem] max-w-[85vw] flex-col border-r border-[#4A3540] bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex items-center justify-between border-b border-[#4A3540] px-4 py-4">
              <p className="text-sm font-semibold tracking-wide">Alrouby Dashboard</p>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-md border border-sidebar-muted/40 px-2 py-1 text-xs"
              >
                Close
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4">
              <ul className="space-y-1">
                {navItems.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`block rounded-md px-3 py-2 text-sm transition ${
                          active
                            ? "bg-[#3A2531] text-white"
                            : "text-sidebar-foreground/90 hover:bg-[#35212D] hover:text-white focus-visible:bg-[#35212D] focus-visible:text-white"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="border-t border-[#4A3540] px-4 py-4">
              <button
                type="button"
                onClick={logout}
                className="w-full rounded-md border border-sidebar-muted/40 px-3 py-2 text-sm text-sidebar-foreground hover:bg-[#35212D]"
              >
                Sign out
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
