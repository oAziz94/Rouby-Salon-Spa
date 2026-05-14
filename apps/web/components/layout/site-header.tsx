"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { clearClientSession, getClientToken, subscribeClientSession } from "@/lib/auth/client-session";

const navItems = [
  { href: "/services", label: "Services" },
  { href: "/packages", label: "Packages" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isClientAuthenticated, setIsClientAuthenticated] = useState(false);

  const bookingHref = useMemo(() => "/booking", []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function syncAuthFromSession(): void {
      setIsClientAuthenticated(Boolean(getClientToken()));
    }
    syncAuthFromSession();
    return subscribeClientSession(syncAuthFromSession);
  }, []);

  function handleSignOut(): void {
    clearClientSession();
    setIsClientAuthenticated(false);
    setMobileOpen(false);
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[#d8cdb9] bg-[#fdfaf4]/95 backdrop-blur-md">
      <nav className="mx-auto flex min-h-20 w-full max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:min-h-24 md:min-h-28 sm:px-6 sm:py-3.5 lg:px-10">
        <Link href="/" className="flex items-center gap-3">
          <BrandLogo priority heightClass="h-14 sm:h-16 md:h-[4.75rem]" />
          <span className="sr-only">Alrouby Salon &amp; Spa</span>
        </Link>

        <div className="hidden items-center gap-7 lg:flex">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm transition-colors ${
                  active
                    ? "font-semibold text-primary"
                    : "text-[#5f6c61] hover:text-primary"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          {isClientAuthenticated ? (
            <>
              <Link
                href="/account/bookings"
                className="rounded-full border border-[#d7cab2] px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-[#f3ebdd]"
              >
                Account
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-full border border-[#d7cab2] px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-[#f3ebdd]"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              href="/account/sign-in"
              className="rounded-full border border-[#d7cab2] px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-[#f3ebdd]"
            >
              Sign In
            </Link>
          )}
          <Link
            href={bookingHref}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-[0_8px_20px_rgba(23,53,31,0.25)] transition-opacity hover:opacity-90"
          >
            Book Appointment
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-menu"
          className="inline-flex min-h-11 rounded-full border border-[#d7cab2] px-3 py-2 text-sm font-medium text-primary lg:hidden"
          onClick={() => setMobileOpen((value) => !value)}
        >
          Menu
        </button>
      </nav>

      {mobileOpen ? (
        <div
          id="mobile-nav-menu"
          className="border-t border-[#d7cab2] bg-[#fdfaf4] px-4 py-4 lg:hidden"
        >
          <div className="flex flex-col gap-3">
            {navItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-2 py-2 text-sm ${
                    active
                      ? "bg-[#f3ebdd] font-medium text-primary"
                      : "text-[#5f6c61] hover:bg-[#f3ebdd] hover:text-primary"
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className="mt-2 flex gap-2">
              {isClientAuthenticated ? (
                <>
                  <Link
                    href="/account/bookings"
                    className="flex-1 rounded-full border border-[#d7cab2] px-4 py-2 text-center text-sm font-medium text-primary"
                    onClick={() => setMobileOpen(false)}
                  >
                    Account
                  </Link>
                  <button
                    type="button"
                    className="flex-1 rounded-full border border-[#d7cab2] px-4 py-2 text-center text-sm font-medium text-primary"
                    onClick={handleSignOut}
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link
                  href="/account/sign-in"
                  className="flex-1 rounded-full border border-[#d7cab2] px-4 py-2 text-center text-sm font-medium text-primary"
                  onClick={() => setMobileOpen(false)}
                >
                  Sign In
                </Link>
              )}
              <Link
                href={bookingHref}
                className="flex-1 rounded-full bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground"
                onClick={() => setMobileOpen(false)}
              >
                Book Now
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
