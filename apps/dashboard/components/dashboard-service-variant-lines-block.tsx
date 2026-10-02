"use client";

import {
  getDashboardBookingById,
  getDashboardBookings,
  getDashboardPickerCatalog,
  type DashboardBookingLineInput,
  type DashboardPickerCatalog,
} from "@rouby/api-client";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  DashboardTreatmentPicker,
  formatMinutes,
  formatPickPrice,
  type TreatmentPick,
} from "./dashboard-treatment-picker";

/*
 * Front-desk treatment lines (spec v2 §3a).
 *
 * Public contract (ServiceLineRow / handle / props) is unchanged so the walk-in,
 * add-service and booking dialogs keep working; the UI is now a list of chosen
 * treatments plus one "Add treatment" button that opens the searchable panel.
 */

type PickerService = DashboardPickerCatalog["services"][number];

function serviceShowsStaffPricingFields(service: PickerService | undefined, variantOptionCount: number): boolean {
  if (!service || variantOptionCount >= 1) return false;
  const t = service.priceDisplayType;
  if (t === "CONTACT" || t === "HIDDEN" || t === "RANGE") return true;
  if (service.basePrice == null && (t === "FIXED" || t === "STARTS_FROM")) return true;
  if (t === "STARTS_FROM" && service.basePrice != null) return true;
  return false;
}

function serviceRequiresStaffPrice(service: PickerService | undefined, variantOptionCount: number): boolean {
  if (!service || variantOptionCount >= 1) return false;
  const t = service.priceDisplayType;
  if (t === "CONTACT" || t === "HIDDEN" || t === "RANGE") return true;
  if (service.basePrice == null && (t === "FIXED" || t === "STARTS_FROM")) return true;
  return false;
}

export type ServiceLineKind = "service" | "package" | "enhancement";

export type ServiceLineRow = {
  key: string;
  /** Defaults to "service" for back-compat with older callers. */
  kind?: ServiceLineKind;
  serviceId: string;
  variantId: string;
  packageId?: string;
  enhancementId?: string;
  /** Staff-entered EGP unit price when catalog has no fixed online price (see dashboard booking rules). */
  staffOverrideUnitPrice?: string;
  /** Optional duration override (minutes). */
  staffOverrideDurationMinutes?: string;
  /** Units of this line (default 1). */
  quantity?: number;
};

export type DashboardServiceVariantLinesBlockHandle = {
  buildBookingItems: () =>
    | { ok: true; items: DashboardBookingLineInput[] }
    | { ok: false; error: string };
};

type Props = {
  token: string;
  branchId: string;
  lines: ServiceLineRow[];
  setLines: Dispatch<SetStateAction<ServiceLineRow[]>>;
  disabled?: boolean;
  /** When known, the client's last completed visit is offered as a one-tap re-add. */
  clientId?: string | null;
  /** When a stylist is already chosen, services she isn't listed for are shown greyed. */
  staffQualifiedServiceIds?: Set<string> | null;
  staffName?: string | null;
};

function lineKindOf(line: ServiceLineRow): ServiceLineKind {
  return line.kind ?? "service";
}

function isEmptyLine(line: ServiceLineRow): boolean {
  const kind = lineKindOf(line);
  if (kind === "package") return !(line.packageId ?? "").trim();
  if (kind === "enhancement") return !(line.enhancementId ?? "").trim();
  return !line.serviceId.trim();
}

// Catalog is identical for every dialog in a session; cache it briefly per branch.
const catalogCache = new Map<string, { at: number; data: DashboardPickerCatalog }>();
const CATALOG_TTL_MS = 5 * 60 * 1000;

async function loadCatalog(token: string, branchId: string): Promise<DashboardPickerCatalog> {
  const hit = catalogCache.get(branchId);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.data;
  const data = await getDashboardPickerCatalog(token, { branchId });
  catalogCache.set(branchId, { at: Date.now(), data });
  return data;
}

/** Exposed so admin screens can drop the cache after editing the catalog. */
export function invalidatePickerCatalogCache(): void {
  catalogCache.clear();
}

export const DashboardServiceVariantLinesBlock = forwardRef<DashboardServiceVariantLinesBlockHandle, Props>(
  function DashboardServiceVariantLinesBlock(
    { token, branchId, lines, setLines, disabled = false, clientId, staffQualifiedServiceIds, staffName },
    ref,
  ) {
    const [catalog, setCatalog] = useState<DashboardPickerCatalog | null>(null);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [lastVisitPicks, setLastVisitPicks] = useState<TreatmentPick[] | null>(null);

    const linesRef = useRef(lines);
    linesRef.current = lines;
    const catalogRef = useRef<DashboardPickerCatalog | null>(null);
    catalogRef.current = catalog;

    useEffect(() => {
      if (!branchId) return;
      let cancelled = false;
      setCatalogLoading(true);
      loadCatalog(token, branchId)
        .then((data) => {
          if (!cancelled) setCatalog(data);
        })
        .catch(() => {
          if (!cancelled) setCatalog(null);
        })
        .finally(() => {
          if (!cancelled) setCatalogLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [token, branchId]);

    const servicesById = useMemo(() => new Map((catalog?.services ?? []).map((s) => [s.id, s])), [catalog]);
    const variantsByService = useMemo(() => {
      const m = new Map<string, DashboardPickerCatalog["variants"]>();
      for (const v of catalog?.variants ?? []) {
        const l = m.get(v.serviceId) ?? [];
        l.push(v);
        m.set(v.serviceId, l);
      }
      return m;
    }, [catalog]);
    const variantsById = useMemo(() => new Map((catalog?.variants ?? []).map((v) => [v.id, v])), [catalog]);
    const packagesById = useMemo(() => new Map((catalog?.packages ?? []).map((p) => [p.id, p])), [catalog]);
    const enhancementsById = useMemo(() => new Map((catalog?.enhancements ?? []).map((e) => [e.id, e])), [catalog]);

    // "Last visit" shortcut: the client's most recent completed booking, mapped to current catalog ids.
    useEffect(() => {
      if (!clientId || !catalog) {
        setLastVisitPicks(null);
        return;
      }
      let cancelled = false;
      void (async () => {
        try {
          const list = await getDashboardBookings(token, { clientId, status: "COMPLETED", pageSize: 1 });
          const last = list.data[0];
          if (!last) {
            if (!cancelled) setLastVisitPicks(null);
            return;
          }
          const detail = await getDashboardBookingById(token, last.id);
          const picks: TreatmentPick[] = [];
          for (const it of detail.items) {
            if (it.itemType === "SERVICE_VARIANT" && it.serviceVariantId && variantsById.has(it.serviceVariantId)) {
              const v = variantsById.get(it.serviceVariantId)!;
              const s = servicesById.get(v.serviceId);
              picks.push({ kind: "variant", serviceId: v.serviceId, variantId: v.id, label: `${s?.name ?? "Service"} — ${v.name}`, price: v.price, priceDisplayType: "FIXED", durationMinutes: v.durationMinutes });
            } else if (it.itemType === "SERVICE" && it.serviceId && servicesById.has(it.serviceId)) {
              const s = servicesById.get(it.serviceId)!;
              if ((variantsByService.get(s.id) ?? []).length === 0) {
                picks.push({ kind: "service", serviceId: s.id, label: s.name, sublabel: s.nameAr, price: s.basePrice, priceMax: s.basePriceMax, priceDisplayType: s.priceDisplayType, durationMinutes: s.durationMinutes });
              }
            } else if (it.itemType === "PACKAGE" && it.packageId && packagesById.has(it.packageId)) {
              const p = packagesById.get(it.packageId)!;
              picks.push({ kind: "package", packageId: p.id, label: p.name, sublabel: p.nameAr, price: p.price, durationMinutes: p.durationMinutes });
            } else if (it.itemType === "SERVICE_ENHANCEMENT" && it.serviceEnhancementId && enhancementsById.has(it.serviceEnhancementId)) {
              const e = enhancementsById.get(it.serviceEnhancementId)!;
              picks.push({ kind: "enhancement", enhancementId: e.id, label: e.name, sublabel: e.nameAr, price: e.price, durationMinutes: e.durationMinutes });
            }
          }
          if (!cancelled) setLastVisitPicks(picks.length ? picks : null);
        } catch {
          if (!cancelled) setLastVisitPicks(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [catalog, clientId, enhancementsById, packagesById, servicesById, token, variantsById, variantsByService]);

    const addPick = useCallback(
      (pick: TreatmentPick) => {
        setLines((prev) => {
          const kept = prev.filter((l) => !isEmptyLine(l));
          const key = `${Date.now()}-${Math.random()}`;
          if (pick.kind === "package") {
            return [...kept, { key, kind: "package", serviceId: "", variantId: "", packageId: pick.packageId, quantity: 1 }];
          }
          if (pick.kind === "enhancement") {
            // Same add-on again → bump quantity instead of a duplicate row.
            const idx = kept.findIndex((l) => lineKindOf(l) === "enhancement" && l.enhancementId === pick.enhancementId);
            if (idx >= 0) {
              return kept.map((l, i) => (i === idx ? { ...l, quantity: (l.quantity ?? 1) + 1 } : l));
            }
            return [...kept, { key, kind: "enhancement", serviceId: "", variantId: "", enhancementId: pick.enhancementId, quantity: 1 }];
          }
          return [
            ...kept,
            {
              key,
              kind: "service",
              serviceId: pick.serviceId ?? "",
              variantId: pick.variantId ?? "",
              staffOverrideUnitPrice: "",
              staffOverrideDurationMinutes: "",
              quantity: 1,
            },
          ];
        });
      },
      [setLines],
    );

    useImperativeHandle(ref, () => ({
      buildBookingItems: () => {
        const curLines = linesRef.current.filter((l) => !isEmptyLine(l));
        const cat = catalogRef.current;
        const items: DashboardBookingLineInput[] = [];
        for (const line of curLines) {
          const kind = lineKindOf(line);
          const quantity = Math.max(1, Math.floor(line.quantity ?? 1));
          if (kind === "package") {
            items.push({ itemType: "PACKAGE", packageId: (line.packageId ?? "").trim(), quantity });
            continue;
          }
          if (kind === "enhancement") {
            items.push({ itemType: "SERVICE_ENHANCEMENT", serviceEnhancementId: (line.enhancementId ?? "").trim(), quantity });
            continue;
          }
          const serviceId = line.serviceId.trim();
          const svc = cat?.services.find((s) => s.id === serviceId);
          const variants = cat?.variants.filter((v) => v.serviceId === serviceId) ?? [];
          if (variants.length >= 1) {
            const variantId = line.variantId.trim() || (variants.length === 1 ? variants[0].id : "");
            if (!variantId) {
              return { ok: false, error: `Choose a size/option for ${svc?.name ?? "the service"}.` };
            }
            items.push({ itemType: "SERVICE_VARIANT", serviceId, serviceVariantId: variantId, quantity });
            continue;
          }
          const showStaff = serviceShowsStaffPricingFields(svc, 0);
          const requireStaffPrice = serviceRequiresStaffPrice(svc, 0);
          const rawPrice = (line.staffOverrideUnitPrice ?? "").trim().replace(/,/g, "");
          const dmRaw = (line.staffOverrideDurationMinutes ?? "").trim();
          const item: DashboardBookingLineInput = { itemType: "SERVICE", serviceId, quantity };
          if (requireStaffPrice || (showStaff && rawPrice !== "")) {
            const p = parseFloat(rawPrice);
            if (!Number.isFinite(p) || p < 0.01) {
              return { ok: false, error: `Enter the price for ${svc?.name ?? "this service"} (EGP).` };
            }
            if (svc?.priceDisplayType === "RANGE" && svc.basePrice != null && svc.basePriceMax != null && (p < svc.basePrice || p > svc.basePriceMax)) {
              return { ok: false, error: `${svc.name}: price must be between EGP ${svc.basePrice} and EGP ${svc.basePriceMax}.` };
            }
            item.staffOverrideUnitPrice = Math.round(p * 100) / 100;
          }
          if (requireStaffPrice) {
            const hasCatalogDuration = svc != null && svc.durationMinutes != null && svc.durationMinutes >= 1;
            if (!hasCatalogDuration) {
              const d = parseInt(dmRaw, 10);
              if (!Number.isInteger(d) || d < 1) {
                return { ok: false, error: `Enter the duration in minutes for ${svc?.name ?? "this service"}.` };
              }
            }
          }
          if (dmRaw) {
            const d = parseInt(dmRaw, 10);
            if (!Number.isInteger(d) || d < 1 || d > 1440) {
              return { ok: false, error: "Duration must be a whole number of minutes (1–1440)." };
            }
            item.staffOverrideDurationMinutes = d;
          }
          items.push(item);
        }
        if (items.length === 0) {
          return { ok: false, error: "Add at least one treatment." };
        }
        return { ok: true, items };
      },
    }));

    const visibleLines = lines.filter((l) => !isEmptyLine(l));

    // Footer totals (catalog prices; staff overrides applied when typed).
    const totals = useMemo(() => {
      let total = 0;
      let minutes = 0;
      for (const line of visibleLines) {
        const q = Math.max(1, line.quantity ?? 1);
        const kind = lineKindOf(line);
        if (kind === "package") {
          const p = packagesById.get(line.packageId ?? "");
          total += (p?.price ?? 0) * q;
          minutes += (p?.durationMinutes ?? 0) * q;
        } else if (kind === "enhancement") {
          const e = enhancementsById.get(line.enhancementId ?? "");
          total += (e?.price ?? 0) * q;
          minutes += (e?.durationMinutes ?? 0) * q;
        } else {
          const v = line.variantId ? variantsById.get(line.variantId) : undefined;
          const s = servicesById.get(line.serviceId);
          const override = parseFloat((line.staffOverrideUnitPrice ?? "").replace(/,/g, ""));
          const unit = Number.isFinite(override) && override > 0 ? override : (v?.price ?? s?.basePrice ?? 0);
          const dOverride = parseInt(line.staffOverrideDurationMinutes ?? "", 10);
          const dur = Number.isInteger(dOverride) && dOverride > 0 ? dOverride : (v?.durationMinutes ?? s?.durationMinutes ?? 0);
          total += unit * q;
          minutes += dur * q;
        }
      }
      return { total, minutes };
    }, [enhancementsById, packagesById, servicesById, variantsById, visibleLines]);

    const updateLine = (key: string, patch: Partial<ServiceLineRow>) =>
      setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

    return (
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Treatments</span>
          {catalogLoading ? <span className="text-xs text-[#7A6A58]">Loading catalog…</span> : null}
        </div>

        {visibleLines.length === 0 ? (
          <button
            type="button"
            disabled={disabled || !branchId}
            onClick={() => setPickerOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#D8CBB8] bg-[#FFFCF7] px-3 py-4 text-sm font-semibold text-[#062A2D] transition hover:border-[#B9974A]/60 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add treatment
          </button>
        ) : (
          <ul className="space-y-2">
            {visibleLines.map((line) => {
              const kind = lineKindOf(line);
              const q = Math.max(1, line.quantity ?? 1);
              let label = "";
              let sub: string | null = null;
              let priceText = "";
              let durText = "";
              let svc: PickerService | undefined;
              let showStaff = false;
              let requireStaff = false;
              if (kind === "package") {
                const p = packagesById.get(line.packageId ?? "");
                label = p?.name ?? "Package";
                sub = "Package";
                priceText = p ? formatPickPrice({ price: p.price }) : "";
                durText = formatMinutes(p?.durationMinutes);
              } else if (kind === "enhancement") {
                const e = enhancementsById.get(line.enhancementId ?? "");
                label = e?.name ?? "Add-on";
                sub = "Add-on";
                priceText = e ? formatPickPrice({ price: e.price }) : "";
                durText = formatMinutes(e?.durationMinutes);
              } else {
                svc = servicesById.get(line.serviceId);
                const v = line.variantId ? variantsById.get(line.variantId) : undefined;
                const opts = variantsByService.get(line.serviceId) ?? [];
                label = svc?.name ?? "Service";
                sub = v ? v.name : svc?.nameAr ?? null;
                priceText = v
                  ? formatPickPrice({ price: v.price })
                  : svc
                    ? formatPickPrice({ price: svc.basePrice, priceMax: svc.basePriceMax, priceDisplayType: svc.priceDisplayType })
                    : "";
                durText = formatMinutes(v?.durationMinutes ?? svc?.durationMinutes);
                showStaff = serviceShowsStaffPricingFields(svc, opts.length);
                requireStaff = serviceRequiresStaffPrice(svc, opts.length);
                if (!v && opts.length > 1) {
                  // Service with sizes but none chosen yet (legacy rows) — offer the choice inline.
                  return (
                    <li key={line.key} className="rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3">
                      <p className="text-sm font-medium text-[#1F2420]">{label}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {opts.map((o) => (
                          <button key={o.id} type="button" disabled={disabled} onClick={() => updateLine(line.key, { variantId: o.id })} className="rounded-lg border border-[#D8CBB8] bg-white px-2.5 py-1 text-xs text-[#1F2420] hover:bg-[#FBF8F2]">
                            {o.name} · {formatPickPrice({ price: o.price })}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                }
              }
              return (
                <li key={line.key} className="rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#1F2420]">{label}</p>
                      {sub ? <p className="truncate text-xs text-[#7A6A58]">{sub}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-[#1F2420]">{priceText}</p>
                      {durText ? <p className="text-[0.7rem] text-[#9A8B7A]">{durText}</p> : null}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center rounded-lg border border-[#E8E0D4] bg-white">
                      <button type="button" aria-label="Decrease quantity" disabled={disabled || q <= 1} onClick={() => updateLine(line.key, { quantity: q - 1 })} className="px-2 py-1 text-[#4A3C2F] disabled:opacity-40">
                        <Minus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <span className="min-w-[1.5rem] text-center text-xs font-semibold text-[#1F2420]">{q}</span>
                      <button type="button" aria-label="Increase quantity" disabled={disabled} onClick={() => updateLine(line.key, { quantity: q + 1 })} className="px-2 py-1 text-[#4A3C2F] disabled:opacity-40">
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#8B4428] hover:bg-[#FFF1EC] disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Remove
                    </button>
                  </div>
                  {showStaff ? (
                    <div className="mt-2 grid gap-2 rounded-xl border border-dashed border-[#D4C4B0] bg-white/70 p-2 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-[#5E574C]">
                        Price (EGP) {requireStaff ? <span className="text-[#B85C38]">*</span> : <span className="font-normal text-[#9A9084]">(optional)</span>}
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0.01}
                          step={0.01}
                          disabled={disabled}
                          value={line.staffOverrideUnitPrice ?? ""}
                          onChange={(e) => updateLine(line.key, { staffOverrideUnitPrice: e.target.value })}
                          placeholder={svc?.priceDisplayType === "RANGE" && svc.basePrice != null && svc.basePriceMax != null ? `${svc.basePrice}–${svc.basePriceMax}` : requireStaff ? "Agreed price" : "Catalog price"}
                          className="mt-1 w-full rounded-lg border border-[#E8E0D4] bg-white px-2 py-1.5 text-sm text-[#1F2420] outline-none focus:border-[#B9974A]/50 disabled:opacity-60"
                        />
                      </label>
                      <label className="block text-xs font-medium text-[#5E574C]">
                        Duration (min) {requireStaff && !(svc?.durationMinutes && svc.durationMinutes >= 1) ? <span className="text-[#B85C38]">*</span> : <span className="font-normal text-[#9A9084]">(optional)</span>}
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={1440}
                          disabled={disabled}
                          value={line.staffOverrideDurationMinutes ?? ""}
                          onChange={(e) => updateLine(line.key, { staffOverrideDurationMinutes: e.target.value })}
                          placeholder={svc?.durationMinutes ? String(svc.durationMinutes) : ""}
                          className="mt-1 w-full rounded-lg border border-[#E8E0D4] bg-white px-2 py-1.5 text-sm text-[#1F2420] outline-none focus:border-[#B9974A]/50 disabled:opacity-60"
                        />
                      </label>
                    </div>
                  ) : null}
                </li>
              );
            })}
            <li className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                disabled={disabled || !branchId}
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-xs font-semibold text-[#062A2D] shadow-sm transition hover:border-[#B9974A]/45 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add treatment
              </button>
              <span className="text-xs text-[#4A3C2F]">
                <span className="font-semibold">EGP {totals.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                {totals.minutes > 0 ? ` · ${formatMinutes(totals.minutes)}` : ""}
              </span>
            </li>
          </ul>
        )}

        <DashboardTreatmentPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          catalog={catalog}
          loading={catalogLoading}
          lastVisitPicks={lastVisitPicks}
          staffQualifiedServiceIds={staffQualifiedServiceIds ?? null}
          staffName={staffName ?? null}
          selectedCount={visibleLines.reduce((n, l) => n + Math.max(1, l.quantity ?? 1), 0)}
          selectedTotal={totals.total}
          selectedMinutes={totals.minutes}
          onPick={addPick}
          onPickMany={(picks) => picks.forEach(addPick)}
        />
      </div>
    );
  },
);
