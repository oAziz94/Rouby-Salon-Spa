"use client";

import Link from "next/link";
import { useDashboardAuth } from "@/lib/dashboard-auth";

export default function SettingsIndexPage() {
  const { hasPermission } = useDashboardAuth();
  const canReadVat =
    hasPermission("vat.settings.read") || hasPermission("vat.settings.manage");
  const canManageVat = hasPermission("vat.settings.manage");
  const canReadPaymentPolicy =
    hasPermission("payments.policy.read") ||
    hasPermission("payments.policy.manage");
  const canManagePaymentPolicy = hasPermission("payments.policy.manage");
  const canReadSlotGeneration = hasPermission("slots.read");
  const canManageSlotGeneration =
    hasPermission("slots.create") && hasPermission("slots.capacity.configure");

  const hasAnyAccess =
    canReadVat || canReadPaymentPolicy || canReadSlotGeneration;

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#1F2420]">Settings</h1>
        <p className="mt-2 text-sm text-[#7A6A58]">
          Configure VAT, payment policy, and slot generation defaults.
        </p>
      </header>

      {!hasAnyAccess ? (
        <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 text-sm text-danger shadow-sm">
          You do not have access to these settings sections.
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#1F2420]">VAT Settings</h2>
            <span className="rounded-full bg-[#F3EBDD] px-2 py-1 text-xs font-medium text-[#7A6A58]">
              {canManageVat ? "Manage" : canReadVat ? "Read only" : "No access"}
            </span>
          </div>
          <p className="mt-2 text-sm text-[#7A6A58]">
            VAT enablement, rate, invoice visibility, and tax registration number.
          </p>
          <div className="mt-4">
            <Link
              href="/dashboard/settings/vat"
              className={`inline-flex rounded-md px-3 py-2 text-sm font-medium ${
                canReadVat
                  ? "bg-primary text-primary-foreground"
                  : "cursor-not-allowed bg-[#F5F1EA] text-[#7A6A58] pointer-events-none"
              }`}
            >
              Open VAT Settings
            </Link>
          </div>
        </article>

        <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#1F2420]">Payment Policy</h2>
            <span className="rounded-full bg-[#F3EBDD] px-2 py-1 text-xs font-medium text-[#7A6A58]">
              {canManagePaymentPolicy
                ? "Manage"
                : canReadPaymentPolicy
                  ? "Read only"
                  : "No access"}
            </span>
          </div>
          <p className="mt-2 text-sm text-[#7A6A58]">
            Configure the salon payment and deposit policy mode.
          </p>
          <div className="mt-4">
            <Link
              href="/dashboard/settings/payment-policy"
              className={`inline-flex rounded-md px-3 py-2 text-sm font-medium ${
                canReadPaymentPolicy
                  ? "bg-primary text-primary-foreground"
                  : "cursor-not-allowed bg-[#F5F1EA] text-[#7A6A58] pointer-events-none"
              }`}
            >
              Open Payment Policy
            </Link>
          </div>
        </article>

        <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#1F2420]">Slot generation</h2>
            <span className="rounded-full bg-[#F3EBDD] px-2 py-1 text-xs font-medium text-[#7A6A58]">
              {canManageSlotGeneration
                ? "Manage"
                : canReadSlotGeneration
                  ? "Read only"
                  : "No access"}
            </span>
          </div>
          <p className="mt-2 text-sm text-[#7A6A58]">
            Default working hours, slot length, and capacity for generating a full week of slots.
          </p>
          <div className="mt-4">
            <Link
              href="/dashboard/settings/slots"
              className={`inline-flex rounded-md px-3 py-2 text-sm font-medium ${
                canReadSlotGeneration
                  ? "bg-primary text-primary-foreground"
                  : "cursor-not-allowed bg-[#F5F1EA] text-[#7A6A58] pointer-events-none"
              }`}
            >
              Open slot generation settings
            </Link>
          </div>
        </article>
      </section>
    </section>
  );
}
