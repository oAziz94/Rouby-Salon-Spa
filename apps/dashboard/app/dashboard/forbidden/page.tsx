"use client";

import Link from "next/link";
import { useDashboardAuth } from "@/lib/dashboard-auth";

export default function ForbiddenPage() {
  const { logout } = useDashboardAuth();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAF7F0] px-4">
      <section className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#1F2420]">
          Access denied (403)
        </h1>
        <p className="mt-2 text-sm text-[#7A6A58]">
          You do not have permission to access this page.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Go to dashboard
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-[#1F2420]"
          >
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
