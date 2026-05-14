"use client";

/**
 * Service add-ons / enhancements: text and pricing only — no gallery images by design
 * (contrast with Services, which use the central Media Library for cover images).
 */

import {
  ApiClientError,
  getDashboardServiceEnhancements,
  patchDashboardServiceEnhancement,
  patchDashboardServiceEnhancementStatus,
  postDashboardServiceEnhancement,
  type DashboardListMeta,
  type DashboardServiceEnhancement,
} from "@rouby/api-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type ListStatus = "loading" | "ready" | "error";

type ActiveFilter = "" | "true" | "false";

type FilterForm = {
  search: string;
  isActive: ActiveFilter;
  priceMin: string;
  priceMax: string;
  durationMin: string;
  durationMax: string;
};

const DEFAULT_FILTERS: FilterForm = {
  search: "",
  isActive: "",
  priceMin: "",
  priceMax: "",
  durationMin: "",
  durationMax: "",
};

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

function formatEGP(amount: number | null): string {
  if (amount === null) return "—";
  return `EGP ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatOptionalMinutes(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${Math.round(value)} min`;
}

function titleInitials(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function parseOptionalNonNegativeInt(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return undefined;
  return n;
}

function parseOptionalNonNegativeNumber(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function filtersHaveSelection(f: FilterForm): boolean {
  return (
    f.search.trim() !== "" ||
    f.isActive !== "" ||
    f.priceMin.trim() !== "" ||
    f.priceMax.trim() !== "" ||
    f.durationMin.trim() !== "" ||
    f.durationMax.trim() !== ""
  );
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function DashboardServiceEnhancementsPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canManage = hasPermission("service_enhancements.manage");

  const [listStatus, setListStatus] = useState<ListStatus>("loading");
  const [listError, setListError] = useState("");
  const [rows, setRows] = useState<DashboardServiceEnhancement[]>([]);
  const [meta, setMeta] = useState<DashboardListMeta | null>(null);
  const [page, setPage] = useState(1);

  const [draftFilters, setDraftFilters] = useState<FilterForm>({ ...DEFAULT_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState<FilterForm>({ ...DEFAULT_FILTERS });

  const [drawerRow, setDrawerRow] = useState<DashboardServiceEnhancement | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DashboardServiceEnhancement | null>(null);
  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [price, setPrice] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const pushToast = useCallback((message: string, tone: "success" | "error") => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const buildListQuery = useCallback(() => {
    const q: Parameters<typeof getDashboardServiceEnhancements>[1] = {
      page,
      pageSize: 20,
      isActive: appliedFilters.isActive === "" ? undefined : appliedFilters.isActive === "true",
      search: appliedFilters.search.trim() || undefined,
    };
    const pMin = parseOptionalNonNegativeNumber(appliedFilters.priceMin);
    const pMax = parseOptionalNonNegativeNumber(appliedFilters.priceMax);
    const dMin = parseOptionalNonNegativeInt(appliedFilters.durationMin);
    const dMax = parseOptionalNonNegativeInt(appliedFilters.durationMax);
    if (pMin !== undefined) q.priceMin = pMin;
    if (pMax !== undefined) q.priceMax = pMax;
    if (dMin !== undefined) q.durationMin = dMin;
    if (dMax !== undefined) q.durationMax = dMax;
    return q;
  }, [appliedFilters, page]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setListStatus("loading");
    setListError("");
    try {
      const result = await getDashboardServiceEnhancements(token, buildListQuery());
      setRows(result.data);
      setMeta(result.meta);
      setListStatus("ready");
    } catch (requestError) {
      setListError(formatApiError(requestError));
      setListStatus("error");
    }
  }, [token, buildListQuery]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const stats = meta?.serviceEnhancementStats;
  const totalForCards = stats?.totalMatchingFilters ?? meta?.totalItems ?? 0;
  const activeForCards = stats?.activeMatchingFilters ?? 0;
  const avgPriceDisplay = formatEGP(stats?.avgPrice ?? null);
  const avgDurationDisplay = formatOptionalMinutes(stats?.avgDurationMinutes ?? null);

  const hasAppliedFilters = useMemo(() => filtersHaveSelection(appliedFilters), [appliedFilters]);

  const isEmptyCatalog = listStatus === "ready" && (meta?.totalItems ?? 0) === 0 && !hasAppliedFilters;
  const isEmptyFiltered = listStatus === "ready" && (meta?.totalItems ?? 0) === 0 && hasAppliedFilters;

  function applyFilters() {
    setAppliedFilters({ ...draftFilters });
    setPage(1);
  }

  function clearFilters() {
    setDraftFilters({ ...DEFAULT_FILTERS });
    setAppliedFilters({ ...DEFAULT_FILTERS });
    setPage(1);
  }

  function openCreateModal() {
    setEditingRow(null);
    setTitle("");
    setShortDescription("");
    setPrice("");
    setDurationMinutes("");
    setDisplayOrder("0");
    setIsActive(true);
    setFieldErrors({});
    setSaveError("");
    setModalOpen(true);
  }

  function openEditModal(row: DashboardServiceEnhancement) {
    setEditingRow(row);
    setTitle(row.title);
    setShortDescription(row.shortDescription ?? "");
    setPrice(row.price?.toString() ?? "");
    setDurationMinutes(row.durationMinutes?.toString() ?? "");
    setDisplayOrder(String(row.displayOrder));
    setIsActive(row.isActive);
    setFieldErrors({});
    setSaveError("");
    setModalOpen(true);
  }

  function validateForm(): boolean {
    const errs: Record<string, string> = {};
    if (!title.trim()) {
      errs.title = "Title is required.";
    }
    const p = price.trim();
    if (p !== "") {
      const n = Number(p);
      if (!Number.isFinite(n) || n < 0) {
        errs.price = "Enter zero or a positive amount.";
      }
    }
    const d = durationMinutes.trim();
    if (d !== "") {
      const n = Number(d);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        errs.durationMinutes = "Enter a whole number of minutes, zero or greater.";
      }
    }
    const ord = displayOrder.trim();
    if (ord === "" || !Number.isFinite(Number(ord)) || !Number.isInteger(Number(ord)) || Number(ord) < 0) {
      errs.displayOrder = "Display order must be zero or a positive whole number.";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (!validateForm()) return;
    setSaving(true);
    setSaveError("");
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        shortDescription: shortDescription.trim() || null,
        price: price.trim() === "" ? null : Number(price),
        durationMinutes: durationMinutes.trim() === "" ? null : Number(durationMinutes),
        displayOrder: Number(displayOrder || 0),
        isActive,
      };
      if (editingRow) {
        await patchDashboardServiceEnhancement(token, editingRow.id, payload);
        pushToast("Add-on updated.", "success");
      } else {
        await postDashboardServiceEnhancement(token, payload);
        pushToast("Add-on created.", "success");
      }
      setModalOpen(false);
      await loadData();
    } catch (requestError) {
      const msg = formatApiError(requestError);
      setSaveError(msg);
      pushToast(msg, "error");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleStatus(row: DashboardServiceEnhancement) {
    if (!token) return;
    try {
      await patchDashboardServiceEnhancementStatus(token, row.id, !row.isActive);
      pushToast(row.isActive ? "Add-on deactivated." : "Add-on activated.", "success");
      await loadData();
      setDrawerRow((current) =>
        current?.id === row.id ? { ...current, isActive: !row.isActive } : current,
      );
    } catch (requestError) {
      pushToast(formatApiError(requestError), "error");
    }
  }

  const filterChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    const f = appliedFilters;
    if (f.search.trim()) chips.push({ key: "search", label: `Search: “${f.search.trim()}”` });
    if (f.isActive === "true") chips.push({ key: "active", label: "Active only" });
    if (f.isActive === "false") chips.push({ key: "inactive", label: "Inactive only" });
    if (f.priceMin.trim()) chips.push({ key: "pmin", label: `Price min: ${f.priceMin}` });
    if (f.priceMax.trim()) chips.push({ key: "pmax", label: `Price max: ${f.priceMax}` });
    if (f.durationMin.trim()) chips.push({ key: "dmin", label: `Duration min: ${f.durationMin} min` });
    if (f.durationMax.trim()) chips.push({ key: "dmax", label: `Duration max: ${f.durationMax} min` });
    return chips;
  }, [appliedFilters]);

  return (
    <PermissionGuard permission="service_enhancements.read">
      <section className="space-y-6">
        {toast ? (
          <div
            className={`fixed bottom-6 right-6 z-[60] max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ${
              toast.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
            role="status"
          >
            {toast.message}
          </div>
        ) : null}

        <header className="rounded-2xl border border-border bg-gradient-to-br from-card to-[#FFF9EE]/80 p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-[#1F2420]">Add-ons</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#7A6A58]">
                Manage optional service add-ons, upgrades, boosters, and extras that can be attached to
                bookings, queue visits, and invoices.
              </p>
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-95"
              >
                New add-on
              </button>
            ) : null}
          </div>
        </header>

        {listStatus === "ready" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-[#E7D4C0]">
              <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">Total add-ons</p>
              <p className="mt-2 text-2xl font-semibold text-[#1F2420]">{totalForCards}</p>
              <p className="mt-1 text-xs text-[#7A6A58]">Matching search and range filters</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-[#E7D4C0]">
              <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">Active add-ons</p>
              <p className="mt-2 text-2xl font-semibold text-[#1F2420]">{activeForCards}</p>
              <p className="mt-1 text-xs text-[#7A6A58]">Among the same filter scope</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-[#E7D4C0]">
              <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">Average price</p>
              <p className="mt-2 text-2xl font-semibold text-[#1F2420]">{avgPriceDisplay}</p>
              <p className="mt-1 text-xs text-[#7A6A58]">EGP; add-ons without a price excluded from average</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-[#E7D4C0]">
              <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">Average duration</p>
              <p className="mt-2 text-2xl font-semibold text-[#1F2420]">{avgDurationDisplay}</p>
              <p className="mt-1 text-xs text-[#7A6A58]">Minutes; unset durations excluded from average</p>
            </div>
          </div>
        ) : null}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <label className="text-sm sm:col-span-2 xl:col-span-2">
                <span className="mb-1 block font-medium text-[#1F2420]">Search by title</span>
                <input
                  value={draftFilters.search}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, search: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyFilters();
                    }
                  }}
                  placeholder="Search title or description…"
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none ring-primary/30 transition focus:ring-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Active state</span>
                <select
                  value={draftFilters.isActive}
                  onChange={(e) =>
                    setDraftFilters((f) => ({ ...f, isActive: e.target.value as ActiveFilter }))
                  }
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                >
                  <option value="">All</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Price min (EGP)</span>
                <input
                  inputMode="decimal"
                  value={draftFilters.priceMin}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, priceMin: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  placeholder="Any"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Price max (EGP)</span>
                <input
                  inputMode="decimal"
                  value={draftFilters.priceMax}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, priceMax: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  placeholder="Any"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Duration min (min)</span>
                <input
                  inputMode="numeric"
                  value={draftFilters.durationMin}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, durationMin: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  placeholder="Any"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Duration max (min)</span>
                <input
                  inputMode="numeric"
                  value={draftFilters.durationMax}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, durationMax: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  placeholder="Any"
                />
              </label>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-[#1F2420] transition hover:bg-muted/40"
              >
                Clear filters
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-95"
              >
                Apply
              </button>
            </div>
          </div>
          {filterChips.length ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
              <span className="text-xs font-medium text-[#7A6A58]">Active filters:</span>
              {filterChips.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center rounded-full border border-[#E7D4C0] bg-[#FFF9EE] px-3 py-1 text-xs font-medium text-[#5C4D3D]"
                >
                  {c.label}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {listStatus === "error" ? (
          <div className="rounded-2xl border border-[#E7B9A4] bg-[#FFF1EC] p-6 shadow-sm">
            <h2 className="text-base font-semibold text-[#1F2420]">Couldn&apos;t load add-ons</h2>
            <p className="mt-2 text-sm text-danger">{listError}</p>
            <button
              type="button"
              onClick={() => void loadData()}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Retry
            </button>
          </div>
        ) : null}

        {isEmptyCatalog ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-[#1F2420]">No add-ons yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#7A6A58]">
              Create optional upgrades like aromatherapy, boosters, nail art, or premium treatments.
            </p>
            {canManage ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                New add-on
              </button>
            ) : null}
          </div>
        ) : null}

        {isEmptyFiltered ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-[#1F2420]">No matching add-ons</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#7A6A58]">
              Try changing filters or clearing the search.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-6 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-[#1F2420]"
            >
              Clear filters
            </button>
          </div>
        ) : null}

        {listStatus === "loading" ? (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 rounded-lg border border-border/40 bg-muted/30 p-3"
                >
                  <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 w-1/3 rounded bg-muted" />
                    <div className="h-2 w-2/3 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {listStatus === "ready" && (meta?.totalItems ?? 0) > 0 ? (
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="hidden md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-left text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                    <th className="px-4 py-3 font-medium">Add-on</th>
                    <th className="px-4 py-3 font-medium">Price</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                    <th className="px-4 py-3 font-medium">Display order</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/50 transition-colors last:border-0 hover:bg-[#FFF9EE]/70"
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E7D4C0] bg-[#FFF9EE] text-xs font-semibold text-[#5C4D3D]"
                            aria-hidden
                          >
                            {titleInitials(row.title)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-[#1F2420]">{row.title}</p>
                            {row.shortDescription ? (
                              <p className="mt-0.5 line-clamp-2 text-xs text-[#7A6A58]">{row.shortDescription}</p>
                            ) : (
                              <p className="mt-0.5 text-xs italic text-[#7A6A58]/80">No short description</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-medium text-[#1F2420]">{formatEGP(row.price)}</td>
                      <td className="px-4 py-4 text-[#7A6A58]">
                        {row.durationMinutes != null ? `${row.durationMinutes} min` : "—"}
                      </td>
                      <td className="px-4 py-4 text-[#7A6A58]">{row.displayOrder}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            row.isActive
                              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                              : "bg-muted text-muted-foreground ring-1 ring-border"
                          }`}
                        >
                          {row.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDrawerRow(row)}
                            className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-[#1F2420] transition hover:bg-muted/40"
                          >
                            Details
                          </button>
                          {canManage ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(row)}
                                className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-[#1F2420] transition hover:bg-muted/40"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void onToggleStatus(row)}
                                className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-[#1F2420] transition hover:bg-muted/40"
                              >
                                {row.isActive ? "Deactivate" : "Activate"}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {rows.map((row) => (
                <div key={row.id} className="space-y-3 p-4 transition-colors hover:bg-[#FFF9EE]/50">
                  <div className="flex gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E7D4C0] bg-[#FFF9EE] text-xs font-semibold text-[#5C4D3D]"
                      aria-hidden
                    >
                      {titleInitials(row.title)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[#1F2420]">{row.title}</p>
                      {row.shortDescription ? (
                        <p className="mt-1 text-xs text-[#7A6A58]">{row.shortDescription}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#7A6A58]">
                        <span>{formatEGP(row.price)}</span>
                        <span>·</span>
                        <span>{row.durationMinutes != null ? `${row.durationMinutes} min` : "—"}</span>
                        <span>·</span>
                        <span>Order {row.displayOrder}</span>
                      </div>
                      <span
                        className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.isActive
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {row.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setDrawerRow(row)}
                      className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium"
                    >
                      Details
                    </button>
                    {canManage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void onToggleStatus(row)}
                          className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium"
                        >
                          {row.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-[#7A6A58]">
                Page {meta?.page ?? page} of {Math.max(1, meta?.totalPages ?? 1)} ·{" "}
                {meta?.totalItems ?? 0} add-ons
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!meta?.hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {drawerRow ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-[#2A1722]/30 backdrop-blur-[1px]"
              aria-label="Close details"
              onClick={() => setDrawerRow(null)}
            />
            <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-border p-5">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">Add-on</p>
                  <h2 className="mt-1 text-lg font-semibold text-[#1F2420]">{drawerRow.title}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerRow(null)}
                  className="rounded-lg p-2 text-[#7A6A58] hover:bg-muted"
                  aria-label="Close"
                >
                  <span aria-hidden className="text-lg leading-none">
                    ×
                  </span>
                </button>
              </div>
              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                {drawerRow.shortDescription ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">
                      Short description
                    </p>
                    <p className="mt-1 text-sm text-[#1F2420]">{drawerRow.shortDescription}</p>
                  </div>
                ) : (
                  <p className="text-sm italic text-[#7A6A58]">No short description</p>
                )}

                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-[#7A6A58]">Price</dt>
                    <dd className="mt-1 font-medium text-[#1F2420]">{formatEGP(drawerRow.price)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-[#7A6A58]">Duration</dt>
                    <dd className="mt-1 text-[#1F2420]">
                      {drawerRow.durationMinutes != null ? `${drawerRow.durationMinutes} min` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-[#7A6A58]">Display order</dt>
                    <dd className="mt-1 text-[#1F2420]">{drawerRow.displayOrder}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-[#7A6A58]">Status</dt>
                    <dd className="mt-1">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          drawerRow.isActive
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {drawerRow.isActive ? "Active" : "Inactive"}
                      </span>
                    </dd>
                  </div>
                </dl>

                <div className="text-xs text-[#7A6A58]">
                  <p>Created {formatShortDate(drawerRow.createdAt)}</p>
                  <p className="mt-1">Updated {formatShortDate(drawerRow.updatedAt)}</p>
                </div>

                {drawerRow.price == null ||
                drawerRow.durationMinutes == null ||
                !drawerRow.isActive ? (
                  <div className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/60 p-3 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">Heads-up</p>
                    {drawerRow.price == null ? (
                      <p className="text-amber-950/90">
                        Missing price — attach pricing before using this add-on on billable lines.
                      </p>
                    ) : null}
                    {drawerRow.durationMinutes == null ? (
                      <p className="text-amber-950/90">
                        Missing duration — set minutes if this add-on should extend service time.
                      </p>
                    ) : null}
                    {!drawerRow.isActive ? (
                      <p className="text-amber-950/90">
                        This add-on is inactive and won&apos;t be offered for new selections.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="border-t border-border p-4">
                <div className="flex flex-wrap gap-2">
                  {canManage ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          openEditModal(drawerRow);
                          setDrawerRow(null);
                        }}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void onToggleStatus(drawerRow)}
                        className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium"
                      >
                        {drawerRow.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setDrawerRow(null)}
                    className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
            </aside>
          </>
        ) : null}

        {modalOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[#2A1722]/45 p-4 sm:items-center">
            <div
              role="presentation"
              className="fixed inset-0"
              onClick={() => !saving && setModalOpen(false)}
              aria-hidden
            />
            <section className="relative z-10 flex max-h-[min(92vh,880px)] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
              <div className="border-b border-border px-6 py-4">
                <h2 className="text-lg font-semibold text-[#1F2420]">
                  {editingRow ? "Edit add-on" : "Create add-on"}
                </h2>
              </div>
              <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSave}>
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-[#1F2420]">
                      Title <span className="text-red-600">*</span>
                    </span>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none ring-primary/25 focus:ring-2 ${
                        fieldErrors.title ? "border-red-400" : "border-border"
                      }`}
                    />
                    {fieldErrors.title ? (
                      <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>
                    ) : null}
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-[#1F2420]">Short description</span>
                    <textarea
                      value={shortDescription}
                      onChange={(e) => setShortDescription(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none ring-primary/25 focus:ring-2"
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-[#1F2420]">Price (EGP)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none ring-primary/25 focus:ring-2 ${
                          fieldErrors.price ? "border-red-400" : "border-border"
                        }`}
                      />
                      {fieldErrors.price ? (
                        <p className="mt-1 text-xs text-red-600">{fieldErrors.price}</p>
                      ) : null}
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-[#1F2420]">Duration (minutes)</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(e.target.value)}
                        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none ring-primary/25 focus:ring-2 ${
                          fieldErrors.durationMinutes ? "border-red-400" : "border-border"
                        }`}
                      />
                      {fieldErrors.durationMinutes ? (
                        <p className="mt-1 text-xs text-red-600">{fieldErrors.durationMinutes}</p>
                      ) : null}
                    </label>
                  </div>
                  <label className="block text-sm sm:max-w-xs">
                    <span className="mb-1 block font-medium text-[#1F2420]">Display order</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={displayOrder}
                      onChange={(e) => setDisplayOrder(e.target.value)}
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none ring-primary/25 focus:ring-2 ${
                        fieldErrors.displayOrder ? "border-red-400" : "border-border"
                      }`}
                    />
                    {fieldErrors.displayOrder ? (
                      <p className="mt-1 text-xs text-red-600">{fieldErrors.displayOrder}</p>
                    ) : null}
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <span className="font-medium text-[#1F2420]">Active</span>
                    <span className="text-xs text-[#7A6A58]">Inactive add-ons are hidden from new selections.</span>
                  </label>
                  {saveError ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      {saveError}
                    </p>
                  ) : null}
                </div>
                <div className="flex justify-end gap-2 border-t border-border bg-card px-6 py-4">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setModalOpen(false)}
                    className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
