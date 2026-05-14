"use client";

import type { DashboardBranch, DashboardPackage, DashboardService } from "@rouby/api-client";
import { X } from "lucide-react";
import {
  formatDurationMinutes,
  formatEGP,
  packageInitials,
  readinessChecklist,
  resolveBranchNames,
  resolveServiceSummaries,
  savingsAmount,
  savingsPercent,
} from "./package-utils";

type PackageDetailsDrawerProps = {
  open: boolean;
  onClose: () => void;
  pkg: DashboardPackage | null;
  services: DashboardService[];
  branches: DashboardBranch[];
  categoryById: Map<string, string>;
  canManage: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
};

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "muted" | "accent";
}) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "muted"
          ? "border-border bg-muted text-muted-foreground"
          : tone === "accent"
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-white text-[#1F2420]";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function PackageDetailsDrawer({
  open,
  onClose,
  pkg,
  services,
  branches,
  categoryById,
  canManage,
  onEdit,
  onToggleActive,
}: PackageDetailsDrawerProps) {
  if (!open || !pkg) return null;

  const checklist = readinessChecklist(pkg);
  const svcRows = resolveServiceSummaries(pkg, services, categoryById);
  const branchNames = resolveBranchNames(pkg, branches);
  const sav = savingsAmount(pkg);
  const savPct = savingsPercent(pkg);

  return (
    <>
      <button
        type="button"
        aria-label="Close details"
        className="fixed inset-0 z-[55] bg-[#2A1722]/40 transition-opacity lg:bg-[#2A1722]/35"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-[56] flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl lg:max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="package-drawer-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border bg-gradient-to-br from-[#FFFCF6] to-card px-5 py-4">
          <div className="flex min-w-0 gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-sm font-semibold text-[#5C4A3D]"
              aria-hidden
            >
              {packageInitials(pkg.name)}
            </div>
            <div className="min-w-0">
              <h2 id="package-drawer-title" className="truncate text-lg font-semibold text-[#1F2420]">
                {pkg.name}
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={pkg.isActive ? "success" : "muted"}>{pkg.isActive ? "Active" : "Inactive"}</Badge>
                {pkg.isPublicListingReady ? (
                  <Badge tone="success">On public catalog</Badge>
                ) : (
                  <Badge tone="warning">Not on public catalog</Badge>
                )}
                {pkg.isFeatured ? <Badge tone="accent">Featured</Badge> : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            {canManage ? (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-[#1F2420] shadow-sm hover:bg-[#FFF9EE]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={onToggleActive}
                  className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-[#1F2420] shadow-sm hover:bg-[#FFF9EE]"
                >
                  {pkg.isActive ? "Deactivate" : "Activate"}
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[#7A6A58] hover:bg-white/80"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Pricing</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-[#7A6A58]">Original</dt>
                <dd className="text-[#1F2420] line-through decoration-[#C4B5A0]">{formatEGP(pkg.originalPrice)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-medium text-[#1F2420]">Package price</dt>
                <dd className="font-semibold text-primary">{formatEGP(pkg.packagePrice)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#7A6A58]">Savings</dt>
                <dd className="font-medium text-emerald-800">
                  {formatEGP(sav)}
                  {savPct != null ? ` (${savPct}%)` : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-border/60 pt-2">
                <dt className="text-[#7A6A58]">Duration</dt>
                <dd className="text-[#1F2420]">{formatDurationMinutes(pkg.durationMinutes)}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Included services</h3>
            {svcRows.length === 0 ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                No services linked to this package yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {svcRows.map((row, idx) => (
                  <li
                    key={`${row.id}-${idx}`}
                    className="rounded-lg border border-border/80 bg-white px-3 py-2.5 text-sm shadow-sm"
                  >
                    <p className="font-medium text-[#1F2420]">{row.name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#7A6A58]">
                      {row.categoryName ? <span>{row.categoryName}</span> : null}
                      <span>{formatDurationMinutes(row.duration)}</span>
                      <span>{formatEGP(row.price)}</span>
                      <span className="text-[#A89480]">Order {idx + 1}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Branch availability</h3>
            {branchNames.length === 0 ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                This package is not assigned to any branch yet.
              </p>
            ) : (
              <ul className="mt-2 list-inside list-disc text-sm text-[#1F2420]">
                {branchNames.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Public readiness</h3>
            <ul className="mt-2 space-y-1.5">
              {checklist.map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-sm">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                      c.ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                    aria-hidden
                  >
                    {c.ok ? "✓" : "!"}
                  </span>
                  <span className={c.ok ? "text-[#1F2420]" : "text-amber-900"}>{c.label}</span>
                </li>
              ))}
            </ul>
          </section>

          {(pkg.shortDescription || pkg.description) && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Description</h3>
              {pkg.shortDescription ? (
                <p className="mt-2 text-sm leading-relaxed text-[#1F2420]">{pkg.shortDescription}</p>
              ) : null}
              {pkg.description ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#5C534A]">{pkg.description}</p>
              ) : null}
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Metadata</h3>
            <dl className="mt-2 space-y-1 text-xs text-[#5C534A]">
              <div className="flex justify-between gap-2">
                <dt>Created</dt>
                <dd>{new Date(pkg.createdAt).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Updated</dt>
                <dd>{new Date(pkg.updatedAt).toLocaleString()}</dd>
              </div>
              {pkg.badgeLabel ? (
                <div className="flex justify-between gap-2">
                  <dt>Badge label</dt>
                  <dd className="font-medium text-[#1F2420]">{pkg.badgeLabel}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        </div>
      </aside>
    </>
  );
}
