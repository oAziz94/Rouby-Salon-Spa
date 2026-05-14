"use client";

import { PermissionGuard } from "@/components/auth-required";

type ComingSoonDashboardPageProps = {
  title: string;
  description: string;
  permission: string;
};

export function ComingSoonDashboardPage({
  title,
  description,
  permission,
}: ComingSoonDashboardPageProps) {
  return (
    <PermissionGuard permission={permission}>
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-[#1F2420]">{title}</h1>
          <p className="mt-2 text-sm text-[#7A6A58]">{description}</p>
        </header>

        <section className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <p className="text-lg font-medium text-[#1F2420]">Coming soon</p>
          <p className="mt-3 text-sm leading-relaxed text-[#7A6A58]">
            This module is part of the planned dashboard roadmap.
          </p>
        </section>
      </section>
    </PermissionGuard>
  );
}
