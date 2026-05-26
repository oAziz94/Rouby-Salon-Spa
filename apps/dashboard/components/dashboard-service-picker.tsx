"use client";

import type { DashboardService, DashboardServiceCategory } from "@rouby/api-client";
import { Check, ChevronDown, Clock, Search, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const RECENT_SERVICE_IDS_KEY = "rouby.dashboard.recentServiceIds";
const MAX_RECENT_SERVICES = 8;

type DashboardServicePickerProps = {
  services: DashboardService[];
  categories: DashboardServiceCategory[];
  value: string;
  onChange: (serviceId: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

function formatEgp(value: number): string {
  return `EGP ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatDuration(minutes: number | null): string {
  if (minutes == null || minutes < 1) {
    return "No duration";
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

function formatServicePrice(service: DashboardService): string {
  if (service.priceDisplayType === "CONTACT") {
    return "Ask";
  }
  if (service.priceDisplayType === "HIDDEN") {
    return "Staff price";
  }
  if (service.priceDisplayType === "RANGE") {
    if (service.basePrice != null && service.basePriceMax != null) {
      return `${formatEgp(service.basePrice)}-${formatEgp(service.basePriceMax)}`;
    }
    return "Range";
  }
  if (service.priceDisplayType === "STARTS_FROM") {
    return service.basePrice != null ? `From ${formatEgp(service.basePrice)}` : "From";
  }
  return service.basePrice != null ? formatEgp(service.basePrice) : "Staff price";
}

function readRecentServiceIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_SERVICE_IDS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function rememberServiceId(serviceId: string) {
  if (typeof window === "undefined" || !serviceId) {
    return;
  }
  const next = [serviceId, ...readRecentServiceIds().filter((id) => id !== serviceId)].slice(
    0,
    MAX_RECENT_SERVICES,
  );
  window.localStorage.setItem(RECENT_SERVICE_IDS_KEY, JSON.stringify(next));
}

type ServiceGroup = {
  key: string;
  label: string;
  services: DashboardService[];
  pinned?: boolean;
};

export function DashboardServicePicker({
  services,
  categories,
  value,
  onChange,
  disabled = false,
  placeholder = "Select service",
}: DashboardServicePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setRecentIds(readRecentServiceIds());
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const selectedService = useMemo(
    () => services.find((service) => service.id === value),
    [services, value],
  );

  const groups = useMemo<ServiceGroup[]>(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? services.filter((service) =>
          [service.name, service.shortDescription, service.badgeLabel]
            .filter(Boolean)
            .some((part) => part!.toLowerCase().includes(normalizedQuery)),
        )
      : services;
    const serviceById = new Map(filtered.map((service) => [service.id, service]));
    const pinnedIds = [
      ...recentIds,
      ...services.filter((service) => service.isFeatured).map((service) => service.id),
    ];
    const pinnedServices = Array.from(new Set(pinnedIds))
      .map((id) => serviceById.get(id))
      .filter((service): service is DashboardService => Boolean(service))
      .slice(0, MAX_RECENT_SERVICES);
    const pinnedIdSet = new Set(pinnedServices.map((service) => service.id));
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const categoryOrder = new Map(categories.map((category, index) => [category.id, index]));
    const categoryGroups = new Map<string, DashboardService[]>();
    for (const service of filtered) {
      if (pinnedIdSet.has(service.id)) {
        continue;
      }
      const key = service.categoryId || "uncategorized";
      const current = categoryGroups.get(key) ?? [];
      current.push(service);
      categoryGroups.set(key, current);
    }
    const sortedCategoryGroups = Array.from(categoryGroups.entries())
      .sort(([a], [b]) => {
        const ai = categoryOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
        const bi = categoryOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
        if (ai !== bi) {
          return ai - bi;
        }
        return (categoryById.get(a)?.name ?? "Uncategorized").localeCompare(
          categoryById.get(b)?.name ?? "Uncategorized",
        );
      })
      .map(([categoryId, rows]) => ({
        key: categoryId,
        label: categoryById.get(categoryId)?.name ?? "Uncategorized",
        services: rows.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)),
      }));
    return [
      ...(pinnedServices.length > 0
        ? [{ key: "pinned", label: "Recent / popular", services: pinnedServices, pinned: true }]
        : []),
      ...sortedCategoryGroups,
    ];
  }, [categories, query, recentIds, services]);

  function selectService(serviceId: string) {
    onChange(serviceId);
    rememberServiceId(serviceId);
    setRecentIds(readRecentServiceIds());
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-[2.6rem] w-full items-center justify-between gap-2 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-left text-sm text-[#1F2420] shadow-sm outline-none transition focus:border-[#B9974A]/50 disabled:opacity-60"
      >
        {selectedService ? (
          <span className="min-w-0">
            <span className="block truncate font-medium">{selectedService.name}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#7A6A58]">
              <span>{formatDuration(selectedService.durationMinutes)}</span>
              <span>{formatServicePrice(selectedService)}</span>
            </span>
          </span>
        ) : (
          <span className="text-[#9A9084]">{placeholder}</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-[#7A6A58]" aria-hidden />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-xl border border-[#E8E0D4] bg-white shadow-xl">
          <div className="border-b border-[#F0EBE3] p-2">
            <div className="flex items-center gap-2 rounded-lg border border-[#E8E0D4] bg-[#FFFCF7] px-2">
              <Search className="h-4 w-4 shrink-0 text-[#7A6A58]" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search services"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-[#1F2420] outline-none placeholder:text-[#9A9084]"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {groups.length === 0 ? (
              <p className="px-3 py-4 text-sm text-[#7A6A58]">No services found.</p>
            ) : (
              groups.map((group) => (
                <div key={group.key} className="py-1">
                  <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-[#FFFCF7] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#7A6A58]">
                    {group.pinned ? <Star className="h-3 w-3" aria-hidden /> : null}
                    {group.label}
                  </div>
                  {group.services.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => selectService(service.id)}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-[#F8F1E8]"
                    >
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                        {service.id === value ? (
                          <Check className="h-4 w-4 text-[#0A3F35]" aria-hidden />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[#1F2420]">{service.name}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#7A6A58]">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden />
                            {formatDuration(service.durationMinutes)}
                          </span>
                          <span>{formatServicePrice(service)}</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
