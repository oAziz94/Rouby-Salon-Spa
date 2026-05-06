"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const navItems = [
  { href: "/services", label: "Services" },
  { href: "/packages", label: "Packages" },
  { href: "/bundles", label: "Bundles" },
  { href: "/gallery", label: "Gallery" },
  { href: "/testimonials", label: "Testimonials" },
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

  const bookingHref = useMemo(() => "/booking", []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
      <nav className="mx-auto flex h-24 w-full max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="font-heading text-2xl font-semibold tracking-tight text-primary"
        >
          Alrouby
        </Link>

        <div className="hidden items-center gap-8 lg:flex">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm transition-colors ${
                  active
                    ? "font-medium text-primary"
                    : "text-muted hover:text-primary"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/account"
            className="rounded-lg border border-border px-4 py-2 text-sm text-primary transition-colors hover:bg-card"
          >
            Account
          </Link>
          <Link
            href={bookingHref}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Book Appointment
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-menu"
          className="inline-flex min-h-11 rounded-lg border border-border px-3 py-2 text-sm text-primary lg:hidden"
          onClick={() => setMobileOpen((value) => !value)}
        >
          Menu
        </button>
      </nav>

      {mobileOpen ? (
        <div
          id="mobile-nav-menu"
          className="border-t border-border bg-background px-4 py-4 lg:hidden"
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
                      ? "bg-card font-medium text-primary"
                      : "text-muted hover:bg-card hover:text-primary"
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className="mt-2 flex gap-2">
              <Link
                href="/account"
                className="flex-1 rounded-lg border border-border px-4 py-2 text-center text-sm text-primary"
                onClick={() => setMobileOpen(false)}
              >
                Account
              </Link>
              <Link
                href={bookingHref}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground"
                onClick={() => setMobileOpen(false)}
              >
                Book
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
