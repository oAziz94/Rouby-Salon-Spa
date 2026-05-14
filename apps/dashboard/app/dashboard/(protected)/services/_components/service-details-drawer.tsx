"use client";

import type { DashboardBranch, DashboardService } from "@rouby/api-client";
import { AlertTriangle, ImageIcon, Sparkles } from "lucide-react";

const PRICE_LABEL: Record<string, string> = {
  FIXED: "Fixed price",
  STARTS_FROM: "Starts from",
  RANGE: "Price range",
  CONTACT: "Contact for pricing",
};

function formatEGP(amount: number | null): string {
  if (amount === null) return "—";
  return `EGP ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type ServiceDetailsDrawerProps = {
  service: DashboardService;
  categoryName: string;
  branches: DashboardBranch[];
  onClose: () => void;
  canManage: boolean;
  onEdit: (service: DashboardService) => void;
  onToggleActive: (service: DashboardService) => void | Promise<void>;
};

export function ServiceDetailsDrawer({
  service,
  categoryName,
  branches,
  onClose,
  canManage,
  onEdit,
  onToggleActive,
}: ServiceDetailsDrawerProps) {
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const linkedBranches = service.branchIds
    .map((id) => branchById.get(id))
    .filter(Boolean) as DashboardBranch[];

  const missingImage = !service.imageUrl;
  const noBranches = service.branchIds.length === 0;
  const missingPrice = service.basePrice === null || service.basePrice === undefined;
  const missingDuration = !service.durationMinutes || service.durationMinutes <= 0;
  const onlineIssues =
    service.bookingAvailability && (missingImage || noBranches || missingPrice || missingDuration);

  const priceTypeLabel = PRICE_LABEL[service.priceDisplayType] ?? service.priceDisplayType;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#2A1722]/45 p-0 sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl sm:max-w-lg sm:rounded-l-2xl sm:shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/80 px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-[#1F2420] sm:text-lg">Service details</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-[#1F2420] transition hover:bg-[#FFF9EE]"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-b from-[#FFFCF6] to-[#FFF9EE]">
            {service.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={service.imageUrl}
                alt={service.imageAlt || service.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[#7A6A58]">
                <ImageIcon className="h-12 w-12 text-accent/70" aria-hidden />
                <p className="font-medium text-[#1F2420]">No image yet</p>
                <p className="max-w-xs text-xs leading-relaxed">
                  Add a clear photo so clients recognize this service online.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-5 px-4 py-5 sm:px-5">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-border/80 bg-white px-3 py-1 text-xs font-medium text-[#1F2420] shadow-sm">
                {categoryName}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  service.isActive
                    ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80"
                    : "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200"
                }`}
              >
                {service.isActive ? "Active" : "Inactive"}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  service.bookingAvailability
                    ? "bg-sky-50 text-sky-900 ring-1 ring-sky-200/80"
                    : "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200"
                }`}
              >
                {service.bookingAvailability ? "Online" : "Hidden online"}
              </span>
              {service.isFeatured ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-900 ring-1 ring-violet-200/80">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Featured
                </span>
              ) : null}
            </div>

            <div>
              <h3 className="font-heading text-xl font-semibold leading-snug text-primary sm:text-2xl">
                {service.name}
              </h3>
              {service.shortDescription ? (
                <p className="mt-2 text-sm leading-relaxed text-[#7A6A58]">{service.shortDescription}</p>
              ) : null}
            </div>

            {service.description ? (
              <div className="rounded-xl border border-border/60 bg-[#FFFCF6]/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Description</p>
                <p className="mt-2 text-sm leading-relaxed text-[#1F2420]">{service.description}</p>
              </div>
            ) : null}

            <dl className="grid gap-3 rounded-xl border border-border/60 bg-white p-4 text-sm shadow-sm">
              <div className="flex justify-between gap-3 border-b border-border/50 pb-2">
                <dt className="text-[#7A6A58]">Price type</dt>
                <dd className="text-right font-medium text-[#1F2420]">{priceTypeLabel}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-border/50 pb-2">
                <dt className="text-[#7A6A58]">Base price</dt>
                <dd className="text-right font-medium text-[#1F2420]">{formatEGP(service.basePrice)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-border/50 pb-2">
                <dt className="text-[#7A6A58]">Max price</dt>
                <dd className="text-right font-medium text-[#1F2420]">{formatEGP(service.basePriceMax)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-border/50 pb-2">
                <dt className="text-[#7A6A58]">Duration</dt>
                <dd className="text-right font-medium text-[#1F2420]">
                  {service.durationMinutes ? `${service.durationMinutes} minutes` : "—"}
                </dd>
              </div>
              {service.badgeLabel ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[#7A6A58]">Badge</dt>
                  <dd className="text-right font-medium text-[#1F2420]">{service.badgeLabel}</dd>
                </div>
              ) : null}
            </dl>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Branch availability</h4>
              {linkedBranches.length === 0 ? (
                <p className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
                  Not linked to any branch yet.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {linkedBranches.map((b) => (
                    <li
                      key={b.id}
                      className="rounded-lg border border-border/70 bg-[#FFFCF6]/60 px-3 py-2 text-sm text-[#1F2420]"
                    >
                      <span className="font-medium">{b.name}</span>
                      {b.address ? <p className="mt-0.5 text-xs text-[#7A6A58]">{b.address}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {service.benefits?.length ? (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Benefits</h4>
                <ul className="mt-2 space-y-1.5">
                  {service.benefits
                    .filter((b) => b.isActive)
                    .map((b) => (
                      <li
                        key={b.id}
                        className="flex items-start gap-2 rounded-lg border border-border/60 bg-white px-3 py-2 text-sm text-[#1F2420]"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                        {b.label}
                      </li>
                    ))}
                </ul>
              </section>
            ) : null}

            {onlineIssues || missingImage || noBranches || missingPrice || missingDuration ? (
              <section className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  Attention
                </div>
                <ul className="mt-2 space-y-1.5 text-sm text-amber-950/95">
                  {missingImage ? <li>Missing service image.</li> : null}
                  {noBranches ? <li>No branch setup — choose where this service is offered.</li> : null}
                  {missingPrice ? <li>Missing base price.</li> : null}
                  {missingDuration ? <li>Missing duration.</li> : null}
                </ul>
              </section>
            ) : null}

            {service.imageAlt ? (
              <p className="text-xs text-[#7A6A58]">
                <span className="font-medium text-[#1F2420]">Image description:</span> {service.imageAlt}
              </p>
            ) : null}

            {canManage ? (
              <div className="flex flex-col gap-2 border-t border-border/80 pt-4 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    onEdit(service);
                  }}
                  className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onEdit(service);
                  }}
                  className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-[#1F2420] shadow-sm transition hover:bg-[#FFF9EE]"
                >
                  {service.imageUrl ? "Replace image" : "Upload image"}
                </button>
                <button
                  type="button"
                  onClick={() => void onToggleActive(service)}
                  className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-[#1F2420] shadow-sm transition hover:bg-[#FFF9EE]"
                >
                  {service.isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
