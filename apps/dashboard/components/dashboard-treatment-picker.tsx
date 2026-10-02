"use client";

import type { DashboardPickerCatalog } from "@rouby/api-client";
import { ChevronRight, Clock3, Search, Star, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { rankEntries, tokenize, type SearchableEntry } from "@/lib/catalog-search";

/** One tappable thing in the picker: a priced service, a variant, a package or an add-on. */
export type TreatmentPick = {
  kind: "service" | "variant" | "package" | "enhancement";
  serviceId?: string;
  variantId?: string;
  packageId?: string;
  enhancementId?: string;
  label: string;
  sublabel?: string | null;
  price: number | null;
  priceMax?: number | null;
  priceDisplayType?: string;
  durationMinutes: number | null;
};

const RECENT_KEY = "rouby.dashboard.recentServiceIds";
const RECENT_MAX = 8;

export function readRecentServiceIds(): string[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(RECENT_KEY) : null;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecentServiceId(serviceId: string): void {
  try {
    const next = [serviceId, ...readRecentServiceIds().filter((id) => id !== serviceId)].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore storage errors */
  }
}

export function formatPickPrice(p: {
  price: number | null;
  priceMax?: number | null;
  priceDisplayType?: string;
}): string {
  const money = (v: number) => `EGP ${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const t = p.priceDisplayType ?? "FIXED";
  if (t === "CONTACT" || t === "HIDDEN" || p.price == null) return "Ask";
  if (t === "STARTS_FROM") return `From ${money(p.price)}`;
  if (t === "RANGE") return p.priceMax != null ? `${money(p.price)}–${money(p.priceMax)}` : `From ${money(p.price)}`;
  return money(p.price);
}

export function formatMinutes(m: number | null | undefined): string {
  if (!m || m <= 0) return "";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}

type ServiceGroup = {
  service: DashboardPickerCatalog["services"][number];
  variants: DashboardPickerCatalog["variants"];
  categoryName: string;
};

type Row =
  | { type: "section"; key: string; label: string }
  | { type: "service"; key: string; group: ServiceGroup; pick: TreatmentPick | null }
  | { type: "variant"; key: string; group: ServiceGroup; pick: TreatmentPick }
  | { type: "package"; key: string; pick: TreatmentPick }
  | { type: "enhancement"; key: string; pick: TreatmentPick }
  | { type: "lastVisit"; key: string; picks: TreatmentPick[] };

type Chip = { id: string; label: string };

export function DashboardTreatmentPicker({
  open,
  onClose,
  catalog,
  loading,
  lastVisitPicks,
  staffQualifiedServiceIds,
  staffName,
  selectedCount,
  selectedTotal,
  selectedMinutes,
  onPick,
  onPickMany,
}: {
  open: boolean;
  onClose: () => void;
  catalog: DashboardPickerCatalog | null;
  loading: boolean;
  /** Services of the client's last completed visit (one tap re-adds all). */
  lastVisitPicks?: TreatmentPick[] | null;
  /** When a stylist is already chosen, services she isn't listed for are greyed (still selectable). */
  staffQualifiedServiceIds?: Set<string> | null;
  staffName?: string | null;
  selectedCount: number;
  selectedTotal: number;
  selectedMinutes: number;
  onPick: (pick: TreatmentPick) => void;
  onPickMany: (picks: TreatmentPick[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<string>("all");
  const [highlight, setHighlight] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setChip("all");
    setHighlight(0);
    setRecentIds(readRecentServiceIds());
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  const groups = useMemo<ServiceGroup[]>(() => {
    if (!catalog) return [];
    const catName = new Map(catalog.categories.map((c) => [c.id, c.name]));
    const variantsByService = new Map<string, DashboardPickerCatalog["variants"]>();
    for (const v of catalog.variants) {
      const list = variantsByService.get(v.serviceId) ?? [];
      list.push(v);
      variantsByService.set(v.serviceId, list);
    }
    return catalog.services
      .filter((s) => s.priceDisplayType !== "HIDDEN")
      .map((service) => ({
        service,
        variants: variantsByService.get(service.id) ?? [],
        categoryName: catName.get(service.categoryId) ?? "Other",
      }));
  }, [catalog]);

  const chips = useMemo<Chip[]>(() => {
    if (!catalog) return [];
    const used = new Set(groups.map((g) => g.service.categoryId));
    const cats = catalog.categories.filter((c) => used.has(c.id)).map((c) => ({ id: c.id, label: c.name }));
    const extra: Chip[] = [];
    if (catalog.packages.length) extra.push({ id: "__packages", label: "Packages" });
    if (catalog.enhancements.length) extra.push({ id: "__addons", label: "Add-ons" });
    return [{ id: "all", label: "All" }, ...cats, ...extra];
  }, [catalog, groups]);

  const servicePick = (g: ServiceGroup): TreatmentPick | null =>
    g.variants.length > 0
      ? null
      : {
          kind: "service",
          serviceId: g.service.id,
          label: g.service.name,
          sublabel: g.service.nameAr,
          price: g.service.basePrice,
          priceMax: g.service.basePriceMax,
          priceDisplayType: g.service.priceDisplayType,
          durationMinutes: g.service.durationMinutes,
        };
  const variantPick = (g: ServiceGroup, v: DashboardPickerCatalog["variants"][number]): TreatmentPick => ({
    kind: "variant",
    serviceId: g.service.id,
    variantId: v.id,
    label: `${g.service.name} — ${v.name}`,
    sublabel: v.nameAr ?? g.service.nameAr,
    price: v.price,
    priceDisplayType: "FIXED",
    durationMinutes: v.durationMinutes,
  });

  const rows = useMemo<Row[]>(() => {
    if (!catalog) return [];
    const q = query.trim();
    const tokens = tokenize(q);
    const out: Row[] = [];

    type SvcEntry = SearchableEntry & { g: ServiceGroup };
    type PkgEntry = SearchableEntry & { p: DashboardPickerCatalog["packages"][number] };
    type EnhEntry = SearchableEntry & { e: DashboardPickerCatalog["enhancements"][number] };

    const categoryRank = new Map(catalog.categories.map((c, i) => [c.id, i]));
    const svcEntries: SvcEntry[] = groups
      .filter((g) => chip === "all" || chip === g.service.categoryId)
      // Group by category (catalog order) so each category header appears once.
      .sort((a, b) => (categoryRank.get(a.service.categoryId) ?? 999) - (categoryRank.get(b.service.categoryId) ?? 999))
      .map((g) => ({
        g,
        name: g.service.name,
        nameAr: g.service.nameAr,
        aliases: g.service.searchAliases,
        extraTerms: [g.categoryName, ...g.variants.flatMap((v) => [v.name, v.nameAr ?? "", ...v.searchAliases])],
      }));
    const pkgEntries: PkgEntry[] =
      chip === "all" || chip === "__packages"
        ? catalog.packages.map((p) => ({ p, name: p.name, nameAr: p.nameAr, aliases: p.searchAliases, extraTerms: ["package"] }))
        : [];
    const enhEntries: EnhEntry[] =
      chip === "all" || chip === "__addons"
        ? catalog.enhancements.map((e) => ({ e, name: e.name, nameAr: e.nameAr, aliases: e.searchAliases, extraTerms: ["add-on", "addon"] }))
        : [];

    const pushService = (g: ServiceGroup, keyPrefix: string, onlyVariantsMatching?: string[]) => {
      out.push({ type: "service", key: `${keyPrefix}:${g.service.id}`, group: g, pick: servicePick(g) });
      const vs = onlyVariantsMatching
        ? g.variants.filter((v) => onlyVariantsMatching.includes(v.id))
        : g.variants;
      for (const v of vs.length ? vs : g.variants) {
        out.push({ type: "variant", key: `${keyPrefix}:${g.service.id}:${v.id}`, group: g, pick: variantPick(g, v) });
      }
    };

    if (tokens.length === 0) {
      if (chip === "all" && lastVisitPicks && lastVisitPicks.length > 0) {
        out.push({ type: "section", key: "s:last", label: "Last visit" });
        out.push({ type: "lastVisit", key: "last", picks: lastVisitPicks });
      }
      if (chip === "all") {
        const byId = new Map(groups.map((g) => [g.service.id, g]));
        const pinned = [...recentIds, ...groups.filter((g) => g.service.isFeatured).map((g) => g.service.id)]
          .filter((id, i, arr) => arr.indexOf(id) === i)
          .map((id) => byId.get(id))
          .filter((g): g is ServiceGroup => Boolean(g))
          .slice(0, 6);
        if (pinned.length) {
          out.push({ type: "section", key: "s:recent", label: "Recent / popular" });
          for (const g of pinned) pushService(g, "recent");
        }
      }
      // Grouped by category in catalog order.
      let lastCat = "";
      for (const e of svcEntries) {
        if (e.g.categoryName !== lastCat) {
          lastCat = e.g.categoryName;
          out.push({ type: "section", key: `s:cat:${lastCat}`, label: lastCat });
        }
        pushService(e.g, "cat");
      }
      if (pkgEntries.length) {
        out.push({ type: "section", key: "s:pkg", label: "Packages" });
        for (const { p } of pkgEntries) {
          out.push({ type: "package", key: `pkg:${p.id}`, pick: { kind: "package", packageId: p.id, label: p.name, sublabel: p.nameAr, price: p.price, durationMinutes: p.durationMinutes } });
        }
      }
      if (enhEntries.length) {
        out.push({ type: "section", key: "s:enh", label: "Add-ons" });
        for (const { e } of enhEntries) {
          out.push({ type: "enhancement", key: `enh:${e.id}`, pick: { kind: "enhancement", enhancementId: e.id, label: e.name, sublabel: e.nameAr, price: e.price, durationMinutes: e.durationMinutes } });
        }
      }
      return out;
    }

    // Searching: ranked flat list across kinds.
    const rankedSvc = rankEntries(svcEntries, q, (a, b) => a.name.localeCompare(b.name));
    for (const e of rankedSvc) {
      // Show only the variants that themselves match (if any do); otherwise all.
      const matchingVariants = e.g.variants
        .filter((v) => rankEntries([{ name: v.name, nameAr: v.nameAr, aliases: v.searchAliases }], q).length > 0)
        .map((v) => v.id);
      pushService(e.g, "q", matchingVariants.length ? matchingVariants : undefined);
    }
    for (const { p } of rankEntries(pkgEntries, q)) {
      out.push({ type: "package", key: `q:pkg:${p.id}`, pick: { kind: "package", packageId: p.id, label: p.name, sublabel: p.nameAr, price: p.price, durationMinutes: p.durationMinutes } });
    }
    for (const { e } of rankEntries(enhEntries, q)) {
      out.push({ type: "enhancement", key: `q:enh:${e.id}`, pick: { kind: "enhancement", enhancementId: e.id, label: e.name, sublabel: e.nameAr, price: e.price, durationMinutes: e.durationMinutes } });
    }
    return out;
  }, [catalog, chip, groups, lastVisitPicks, query, recentIds]);

  const tappable = useMemo(() => rows.filter((r) => (r.type === "service" && r.pick) || r.type === "variant" || r.type === "package" || r.type === "enhancement"), [rows]);

  useEffect(() => {
    setHighlight(0);
  }, [query, chip]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-hl="true"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  if (!open) return null;

  const doPick = (pick: TreatmentPick) => {
    if (pick.serviceId) pushRecentServiceId(pick.serviceId);
    onPick(pick);
    setQuery("");
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, tappable.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      const r = tappable[highlight];
      const pick = r && "pick" in r ? r.pick : null;
      if (pick) {
        e.preventDefault();
        doPick(pick);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const highlightKey = tappable[highlight]?.key;
  const greyed = (serviceId: string | undefined) =>
    Boolean(staffQualifiedServiceIds && serviceId && !staffQualifiedServiceIds.has(serviceId));

  return (
    <div className="fixed inset-0 z-[85] flex justify-end bg-black/40" onKeyDown={onKeyDown}>
      <button type="button" aria-label="Close picker" className="absolute inset-0 cursor-default" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Add treatments"
        className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
      >
        <header className="border-b border-[#E8E0D4] px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[#1F2420]">Add treatments</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-[#7A6A58] hover:bg-[#FBF8F2]">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <label className="mt-3 flex items-center gap-2 rounded-xl border border-[#E8E0D4] bg-[#FBF8F2] px-3 py-2 focus-within:border-[#B9974A]/60">
            <Search className="h-4 w-4 shrink-0 text-[#7A6A58]" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services, packages, add-ons — English or عربي"
              className="w-full bg-transparent text-sm text-[#1F2420] outline-none placeholder:text-[#B5A896]"
              aria-label="Search treatments"
            />
          </label>
          {chips.length > 1 ? (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {chips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChip(c.id)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
                    chip === c.id
                      ? "border-[#062A2D] bg-[#062A2D] text-[#F6F2EA]"
                      : "border-[#E8E0D4] bg-white text-[#4A3C2F] hover:bg-[#FBF8F2]"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-2">
          {loading && !catalog ? <p className="px-2 py-6 text-center text-sm text-[#7A6A58]">Loading catalog…</p> : null}
          {catalog && rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-[#7A6A58]">Nothing matches “{query}”. Try another word or the Arabic name.</p>
          ) : null}
          {rows.map((r) => {
            if (r.type === "section") {
              return (
                <p key={r.key} className="mt-3 px-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#B9974A] first:mt-0">
                  {r.label}
                </p>
              );
            }
            if (r.type === "lastVisit") {
              return (
                <div key={r.key} className="mx-1 mb-1 rounded-xl border border-[#E8E0D4] bg-[#FBF8F2] p-2">
                  <p className="truncate px-1 text-xs text-[#4A3C2F]">{r.picks.map((p) => p.label).join(", ")}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onPickMany(r.picks);
                        for (const p of r.picks) if (p.serviceId) pushRecentServiceId(p.serviceId);
                      }}
                      className="rounded-lg bg-[#062A2D] px-2.5 py-1 text-xs font-semibold text-[#F6F2EA]"
                    >
                      Add all again
                    </button>
                    {r.picks.map((p, i) => (
                      <button key={i} type="button" onClick={() => doPick(p)} className="rounded-lg border border-[#D8CBB8] bg-white px-2.5 py-1 text-xs text-[#1F2420]">
                        + {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }
            const pick = r.pick;
            const isHl = highlightKey === r.key;
            const base = "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left";
            if (r.type === "service") {
              const g = r.group;
              const dim = greyed(g.service.id);
              if (!pick) {
                return (
                  <div key={r.key} className={`${base} mt-1 ${dim ? "opacity-60" : ""}`}>
                    <ChevronRight className="h-3.5 w-3.5 text-[#B5A896]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[#1F2420]">{g.service.name}</span>
                      {g.service.nameAr ? <span className="block truncate text-xs text-[#7A6A58]" dir="rtl">{g.service.nameAr}</span> : null}
                    </span>
                    <span className="text-xs text-[#9A8B7A]">choose size</span>
                  </div>
                );
              }
              return (
                <button
                  key={r.key}
                  type="button"
                  data-hl={isHl ? "true" : undefined}
                  onClick={() => doPick(pick)}
                  className={`${base} ${isHl ? "bg-[#EEF7F3] ring-1 ring-[#0A5A45]/30" : "hover:bg-[#FBF8F2]"} ${dim ? "opacity-60" : ""}`}
                >
                  {g.service.isFeatured ? <Star className="h-3.5 w-3.5 shrink-0 text-[#B9974A]" aria-hidden /> : <span className="w-3.5" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#1F2420]">
                      {g.service.name}
                      {dim && staffName ? <span className="ml-1 text-xs font-normal text-[#9A8B7A]">(not {staffName})</span> : null}
                    </span>
                    {g.service.nameAr ? <span className="block truncate text-xs text-[#7A6A58]" dir="rtl">{g.service.nameAr}</span> : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-[#1F2420]">{formatPickPrice(pick)}</span>
                    {pick.durationMinutes ? (
                      <span className="flex items-center justify-end gap-1 text-[0.7rem] text-[#9A8B7A]"><Clock3 className="h-3 w-3" aria-hidden />{formatMinutes(pick.durationMinutes)}</span>
                    ) : null}
                  </span>
                </button>
              );
            }
            if (r.type === "variant") {
              const dim = greyed(r.group.service.id);
              const v = r.pick;
              return (
                <button
                  key={r.key}
                  type="button"
                  data-hl={isHl ? "true" : undefined}
                  onClick={() => doPick(v)}
                  className={`${base} py-1.5 pl-8 ${isHl ? "bg-[#EEF7F3] ring-1 ring-[#0A5A45]/30" : "hover:bg-[#FBF8F2]"} ${dim ? "opacity-60" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-[#1F2420]">{v.label.split(" — ")[1] ?? v.label}</span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-[#1F2420]">{formatPickPrice(v)}</span>
                    {v.durationMinutes ? <span className="block text-[0.7rem] text-[#9A8B7A]">{formatMinutes(v.durationMinutes)}</span> : null}
                  </span>
                </button>
              );
            }
            return (
              <button
                key={r.key}
                type="button"
                data-hl={isHl ? "true" : undefined}
                onClick={() => pick && doPick(pick)}
                className={`${base} ${isHl ? "bg-[#EEF7F3] ring-1 ring-[#0A5A45]/30" : "hover:bg-[#FBF8F2]"}`}
              >
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase ${r.type === "package" ? "bg-[#F4EDFF] text-[#5B3E91]" : "bg-[#FBF6E8] text-[#5C4A18]"}`}>
                  {r.type === "package" ? "Package" : "Add-on"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[#1F2420]">{pick?.label}</span>
                  {pick?.sublabel ? <span className="block truncate text-xs text-[#7A6A58]" dir="rtl">{pick.sublabel}</span> : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold text-[#1F2420]">{pick ? formatPickPrice(pick) : ""}</span>
                  {pick?.durationMinutes ? <span className="block text-[0.7rem] text-[#9A8B7A]">{formatMinutes(pick.durationMinutes)}</span> : null}
                </span>
              </button>
            );
          })}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[#E8E0D4] bg-[#FBF8F2] px-4 py-3">
          <p className="text-xs text-[#4A3C2F]">
            <span className="font-semibold">Selected ({selectedCount})</span>
            {selectedCount > 0 ? (
              <>
                {" "}· EGP {selectedTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                {selectedMinutes > 0 ? ` · ${formatMinutes(selectedMinutes)}` : ""}
              </>
            ) : null}
          </p>
          <button type="button" onClick={onClose} className="rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA]">
            Done
          </button>
        </footer>
      </aside>
    </div>
  );
}
