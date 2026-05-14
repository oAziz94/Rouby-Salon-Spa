"use client";

import {
  ApiClientError,
  getDashboardBranches,
  getDashboardServiceCategories,
  getDashboardServices,
  patchDashboardServiceCategory,
  patchDashboardServiceStatus,
  postDashboardServiceCategory,
  type DashboardBranch,
  type DashboardListMeta,
  type DashboardService,
  type DashboardServiceCategory,
} from "@rouby/api-client";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";
import { ServiceDetailsDrawer } from "./_components/service-details-drawer";
import { ServiceFormModal } from "./_components/service-form-modal";

type LoadState = "loading" | "loaded" | "empty" | "error";

type OnlineFilter = "all" | "online" | "hidden";
type QualityFilter = "all" | "no-image" | "no-branches";

const defaultMeta: DashboardListMeta = {
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 1,
  hasNextPage: false,
};

function formatEGP(amount: number | null): string {
  if (amount === null) return "—";
  return `EGP ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.statusCode === 403) return "Forbidden (403). You do not have permission.";
    if (error.statusCode === 401) return "Unauthorized (401). Please sign in again.";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

function priceDisplayLabel(type: string): string {
  const m: Record<string, string> = {
    FIXED: "Fixed",
    STARTS_FROM: "From",
    RANGE: "Range",
    CONTACT: "Contact",
  };
  return m[type] ?? type;
}

function serviceMatchesClientFilters(
  service: DashboardService,
  search: string,
  online: OnlineFilter,
  quality: QualityFilter,
): boolean {
  const q = search.trim().toLowerCase();
  if (q) {
    const hay = `${service.name} ${service.shortDescription ?? ""} ${service.description ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (online === "online" && !service.bookingAvailability) return false;
  if (online === "hidden" && service.bookingAvailability) return false;
  if (quality === "no-image" && service.imageUrl) return false;
  if (quality === "no-branches" && service.branchIds.length > 0) return false;
  return true;
}

export default function DashboardServicesPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canRead = hasPermission("services.read");
  const canManage = hasPermission("services.manage");
  const canReadGallery = hasPermission("gallery.read");
  const canManageCategories = hasPermission("services.categories.manage");
  const canReadVariants = hasPermission("service_variants.read");
  const canManageVariants = hasPermission("service_variants.manage");

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardService[]>([]);
  const [listMeta, setListMeta] = useState<DashboardListMeta>(defaultMeta);
  const [categories, setCategories] = useState<DashboardServiceCategory[]>([]);
  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [page, setPage] = useState(1);

  const [appliedCategoryId, setAppliedCategoryId] = useState("");
  const [appliedIsActive, setAppliedIsActive] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedOnline, setAppliedOnline] = useState<OnlineFilter>("all");
  const [appliedQuality, setAppliedQuality] = useState<QualityFilter>("all");

  const [draftSearch, setDraftSearch] = useState("");
  const [draftCategoryId, setDraftCategoryId] = useState("");
  const [draftIsActive, setDraftIsActive] = useState("");
  const [draftOnline, setDraftOnline] = useState<OnlineFilter>("all");
  const [draftQuality, setDraftQuality] = useState<QualityFilter>("all");

  const [stripCategoryId, setStripCategoryId] = useState<string | "">("");

  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<DashboardService | null>(null);
  const [detailService, setDetailService] = useState<DashboardService | null>(null);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<DashboardServiceCategory | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState("0");
  const [categoryError, setCategoryError] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);

  const loadBaseData = useCallback(async (): Promise<DashboardService[]> => {
    if (!token || !canRead) return [];
    const filtersIsActive =
      appliedIsActive === "" ? undefined : appliedIsActive === "true" ? true : false;
    setState("loading");
    setError("");
    try {
      const [servicesResult, categoriesResult, branchesResult] = await Promise.all([
        getDashboardServices(token, {
          page,
          pageSize: 20,
          categoryId: appliedCategoryId || undefined,
          isActive: filtersIsActive,
        }),
        getDashboardServiceCategories(token),
        getDashboardBranches(token).catch(() => []),
      ]);
      setRows(servicesResult.data);
      const meta = servicesResult.meta ?? defaultMeta;
      setListMeta(meta);
      setCategories(categoriesResult.data);
      setBranches(branchesResult);
      const totalCatalog = meta.totalItems ?? 0;
      setState(totalCatalog === 0 ? "empty" : "loaded");
      return servicesResult.data;
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
      return [];
    }
  }, [token, canRead, page, appliedCategoryId, appliedIsActive]);

  useEffect(() => {
    void loadBaseData();
  }, [loadBaseData]);

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const displayedRows = useMemo(
    () => rows.filter((s) => serviceMatchesClientFilters(s, appliedSearch, appliedOnline, appliedQuality)),
    [rows, appliedSearch, appliedOnline, appliedQuality],
  );

  const categoryCountsOnPage = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of rows) {
      map.set(s.categoryId, (map.get(s.categoryId) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const statsFootnote = listMeta.totalPages > 1 || listMeta.page > 1;
  const summary = useMemo(() => {
    const activeOnPage = rows.filter((s) => s.isActive).length;
    const onlineOnPage = rows.filter((s) => s.bookingAvailability).length;
    const missingImgOnPage = rows.filter((s) => !s.imageUrl).length;
    const noBranchOnPage = rows.filter((s) => s.branchIds.length === 0).length;
    return {
      total: listMeta.totalItems,
      activeOnPage,
      onlineOnPage,
      missingImgOnPage,
      noBranchOnPage,
    };
  }, [rows, listMeta.totalItems]);

  function openCreateServiceModal() {
    setEditingService(null);
    setServiceModalOpen(true);
  }

  function openEditServiceModal(service: DashboardService) {
    setEditingService(service);
    setServiceModalOpen(true);
  }

  function applyFiltersFromDraft() {
    setAppliedCategoryId(draftCategoryId);
    setAppliedIsActive(draftIsActive);
    setAppliedSearch(draftSearch);
    setAppliedOnline(draftOnline);
    setAppliedQuality(draftQuality);
    setStripCategoryId(draftCategoryId);
    setPage(1);
  }

  function clearAllFilters() {
    setDraftSearch("");
    setDraftCategoryId("");
    setDraftIsActive("");
    setDraftOnline("all");
    setDraftQuality("all");
    setAppliedSearch("");
    setAppliedCategoryId("");
    setAppliedIsActive("");
    setAppliedOnline("all");
    setAppliedQuality("all");
    setStripCategoryId("");
    setPage(1);
  }

  useEffect(() => {
    setDraftCategoryId(appliedCategoryId);
  }, [appliedCategoryId]);

  async function onToggleServiceStatus(service: DashboardService) {
    if (!token) return;
    try {
      await patchDashboardServiceStatus(token, service.id, !service.isActive);
      const next = await loadBaseData();
      setDetailService((prev) => {
        if (!prev || prev.id !== service.id) return prev;
        return next.find((r) => r.id === prev.id) ?? prev;
      });
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  async function onSaveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setCategorySaving(true);
    setCategoryError("");
    try {
      const payload = { name: categoryName, sortOrder: Number(categorySortOrder || 0) };
      if (editingCategory) {
        await patchDashboardServiceCategory(token, editingCategory.id, payload);
      } else {
        await postDashboardServiceCategory(token, payload);
      }
      setCategoryModalOpen(false);
      await loadBaseData();
    } catch (requestError) {
      setCategoryError(formatApiError(requestError));
    } finally {
      setCategorySaving(false);
    }
  }

  function selectStripCategory(categoryId: string | "") {
    setStripCategoryId(categoryId);
    setDraftCategoryId(categoryId);
    setAppliedCategoryId(categoryId);
    setPage(1);
  }

  function serviceThumb(service: DashboardService) {
    const categoryName = categoriesById.get(service.categoryId)?.name ?? "";
    const initial = (categoryName || service.name).trim().slice(0, 1).toUpperCase() || "?";
    const src = service.imageUrl ?? undefined;
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-gradient-to-br from-[#FFFCF6] to-[#FFF3E0] text-base font-semibold text-[#7A6A58] shadow-inner sm:h-14 sm:w-14 md:h-[56px] md:w-[56px]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span>{initial}</span>
        )}
      </div>
    );
  }

  const canOpenServiceModal = canManage;

  return (
    <PermissionGuard permission="services.read">
      <section className="space-y-6 pb-10">
        {/* Header */}
        <header className="rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-[#FFFCF6]/60 p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-[#1F2420] sm:text-3xl">Services</h1>
              <p className="text-sm leading-relaxed text-[#7A6A58] sm:text-base">
                Manage salon services, categories, pricing, images, branch availability, and online booking visibility.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {canManageCategories ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCategory(null);
                    setCategoryName("");
                    setCategorySortOrder("0");
                    setCategoryModalOpen(true);
                  }}
                  className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-[#1F2420] shadow-sm transition hover:bg-[#FFF9EE]"
                >
                  New category
                </button>
              ) : null}
              {canOpenServiceModal ? (
                <button
                  type="button"
                  onClick={openCreateServiceModal}
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:opacity-95"
                >
                  New service
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {/* Summary */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              { label: "Total services", value: summary.total, sub: "Catalog-wide (current filters)" },
              { label: "Active", value: summary.activeOnPage, sub: statsFootnote ? "On this page" : undefined },
              { label: "Online", value: summary.onlineOnPage, sub: statsFootnote ? "On this page" : undefined },
              { label: "Missing image", value: summary.missingImgOnPage, sub: statsFootnote ? "On this page" : undefined },
              { label: "No branch setup", value: summary.noBranchOnPage, sub: statsFootnote ? "On this page" : undefined },
            ] as const
          ).map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm ring-1 ring-black/[0.02]"
            >
              {state === "loading" ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-3 w-20 rounded bg-[#E8E0D4]" />
                  <div className="h-8 w-14 rounded bg-[#E8E0D4]" />
                </div>
              ) : (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-[#1F2420]">{card.value}</p>
                  {card.sub ? <p className="mt-1 text-[11px] text-[#7A6A58]/90">{card.sub}</p> : null}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Filters toolbar */}
        <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <label className="block text-sm xl:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                  Search
                </span>
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7A6A58]/70" />
                  <input
                    value={draftSearch}
                    onChange={(e) => setDraftSearch(e.target.value)}
                    placeholder="Name or description"
                    className="w-full rounded-xl border border-border bg-white py-2.5 pl-10 pr-3 text-sm shadow-inner outline-none ring-accent/25 transition focus:ring-2"
                  />
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                  Category
                </span>
                <select
                  value={draftCategoryId}
                  onChange={(e) => setDraftCategoryId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm shadow-sm outline-none ring-accent/25 transition focus:ring-2"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                  Status
                </span>
                <select
                  value={draftIsActive}
                  onChange={(e) => setDraftIsActive(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm shadow-sm outline-none ring-accent/25 transition focus:ring-2"
                >
                  <option value="">All</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                  Online visibility
                </span>
                <select
                  value={draftOnline}
                  onChange={(e) => setDraftOnline(e.target.value as OnlineFilter)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm shadow-sm outline-none ring-accent/25 transition focus:ring-2"
                >
                  <option value="all">All</option>
                  <option value="online">Online</option>
                  <option value="hidden">Hidden online</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                  Quality
                </span>
                <select
                  value={draftQuality}
                  onChange={(e) => setDraftQuality(e.target.value as QualityFilter)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm shadow-sm outline-none ring-accent/25 transition focus:ring-2"
                >
                  <option value="all">All</option>
                  <option value="no-image">Missing image</option>
                  <option value="no-branches">No branches</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3 xl:border-0 xl:pt-0">
              <button
                type="button"
                onClick={clearAllFilters}
                className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-[#1F2420] shadow-sm transition hover:bg-[#FFF9EE]"
              >
                Clear filters
              </button>
              <button
                type="button"
                onClick={applyFiltersFromDraft}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:opacity-95"
              >
                Apply
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-[#7A6A58]">
            Search and online/quality options refine the list you see here (including the current page). Server filters
            reload data when you click Apply.
          </p>
        </section>

        {/* Category strip */}
        <section className="rounded-2xl border border-border/80 bg-[#FFFCF6]/40 p-4 shadow-inner sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Browse by category</h2>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => selectStripCategory("")}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                stripCategoryId === ""
                  ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30"
                  : "border border-border/80 bg-white text-[#1F2420] shadow-sm hover:bg-[#FFF9EE]"
              }`}
            >
              All services
            </button>
            {categories.map((category) => {
              const count = categoryCountsOnPage.get(category.id) ?? 0;
              const selected = stripCategoryId === category.id;
              return (
                <div
                  key={category.id}
                  className={`flex shrink-0 items-center gap-1 rounded-full border pl-3 pr-1 py-1 shadow-sm transition ${
                    selected
                      ? "border-accent/40 bg-[#FFF9EE] ring-2 ring-accent/25"
                      : "border-border/80 bg-white hover:border-accent/30"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectStripCategory(category.id)}
                    className="flex max-w-[200px] items-center gap-2 py-1 text-left text-sm font-semibold text-[#1F2420]"
                  >
                    <span className="truncate">{category.name}</span>
                    {count > 0 ? (
                      <span className="rounded-full bg-[#FFFCF6] px-2 py-0.5 text-[11px] font-bold text-[#7A6A58] ring-1 ring-border/60">
                        {count}
                      </span>
                    ) : null}
                  </button>
                  {canManageCategories ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(category);
                        setCategoryName(category.name);
                        setCategorySortOrder(String(category.sortOrder));
                        setCategoryModalOpen(true);
                      }}
                      className="rounded-full px-2 py-1 text-xs font-medium text-[#7A6A58] transition hover:bg-[#FFFCF6] hover:text-[#1F2420]"
                      aria-label={`Edit ${category.name}`}
                    >
                      Edit
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {state === "error" ? (
          <div className="rounded-2xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 text-sm text-danger shadow-sm">
            <p className="font-medium">{error}</p>
            <button
              type="button"
              onClick={() => void loadBaseData()}
              className="mt-3 rounded-lg border border-danger/30 bg-white px-4 py-2 text-sm font-semibold text-danger transition hover:bg-[#FFF1EC]"
            >
              Retry
            </button>
          </div>
        ) : null}

        {state === "empty" && !error ? (
          <div className="rounded-2xl border border-dashed border-border bg-[#FFFCF6]/50 p-10 text-center shadow-inner">
            <p className="text-sm font-medium text-[#1F2420]">No services match the current filters.</p>
            <p className="mt-2 text-sm text-[#7A6A58]">Create a service or widen your filters to see results.</p>
            {canOpenServiceModal ? (
              <button
                type="button"
                onClick={openCreateServiceModal}
                className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md"
              >
                New service
              </button>
            ) : null}
          </div>
        ) : null}

        {state === "loading" ? (
          <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex animate-pulse gap-4 rounded-xl border border-border/50 bg-[#FFFCF6]/40 p-4">
                  <div className="h-14 w-14 shrink-0 rounded-xl bg-[#E8E0D4]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 rounded bg-[#E8E0D4]" />
                    <div className="h-3 w-2/3 rounded bg-[#E8E0D4]" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {state === "loaded" ? (
          <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
            {displayedRows.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#7A6A58]">
                No services match these filters on this page.{" "}
                <button type="button" className="font-semibold text-primary underline" onClick={clearAllFilters}>
                  Clear filters
                </button>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[960px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/80 bg-[#FFFCF6]/50 text-left text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        <th className="px-4 py-3 font-medium">Service</th>
                        <th className="px-3 py-3 font-medium">Category</th>
                        <th className="px-3 py-3 font-medium">Price</th>
                        <th className="px-3 py-3 font-medium">Duration</th>
                        <th className="px-3 py-3 font-medium">Visibility</th>
                        <th className="px-3 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedRows.map((service) => (
                        <tr
                          key={service.id}
                          className="group border-b border-border/40 transition hover:bg-[#FFF9EE]/80"
                        >
                          <td className="px-4 py-4 align-top">
                            <button
                              type="button"
                              onClick={() => setDetailService(service)}
                              className="flex w-full gap-4 text-left"
                            >
                              {serviceThumb(service)}
                              <div className="min-w-0 pt-0.5">
                                <p className="font-semibold text-[#1F2420] group-hover:text-primary">{service.name}</p>
                                {service.shortDescription ? (
                                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#7A6A58]">
                                    {service.shortDescription}
                                  </p>
                                ) : null}
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {!service.imageUrl ? (
                                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200/80">
                                      Missing image
                                    </span>
                                  ) : null}
                                  {service.branchIds.length === 0 ? (
                                    <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-900 ring-1 ring-rose-200/80">
                                      No branches
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </button>
                          </td>
                          <td className="px-3 py-4 align-top text-[#7A6A58]">
                            {categoriesById.get(service.categoryId)?.name ?? "—"}
                          </td>
                          <td className="px-3 py-4 align-top">
                            <p className="font-medium text-[#1F2420]">{formatEGP(service.basePrice)}</p>
                            <p className="text-[11px] text-[#7A6A58]">{priceDisplayLabel(service.priceDisplayType)}</p>
                          </td>
                          <td className="px-3 py-4 align-top text-[#7A6A58]">
                            {service.durationMinutes ? `${service.durationMinutes} min` : "—"}
                          </td>
                          <td className="px-3 py-4 align-top">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                service.bookingAvailability
                                  ? "bg-sky-50 text-sky-900 ring-1 ring-sky-200/80"
                                  : "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200"
                              }`}
                            >
                              {service.bookingAvailability ? "Online" : "Hidden online"}
                            </span>
                          </td>
                          <td className="px-3 py-4 align-top">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                service.isActive
                                  ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80"
                                  : "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200"
                              }`}
                            >
                              {service.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-4 align-top text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setDetailService(service)}
                                className="rounded-lg border border-border/80 bg-white px-3 py-1.5 text-xs font-semibold text-[#1F2420] shadow-sm transition hover:bg-[#FFF9EE]"
                              >
                                Details
                              </button>
                              {canManage ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditServiceModal(service)}
                                    className="rounded-lg border border-border/80 bg-white px-3 py-1.5 text-xs font-semibold text-[#1F2420] shadow-sm transition hover:bg-[#FFF9EE]"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void onToggleServiceStatus(service)}
                                    className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10"
                                  >
                                    {service.isActive ? "Deactivate" : "Activate"}
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

                <div className="space-y-3 p-4 lg:hidden">
                  {displayedRows.map((service) => (
                    <article
                      key={service.id}
                      className="rounded-2xl border border-border/70 bg-gradient-to-b from-white to-[#FFFCF6]/50 p-4 shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => setDetailService(service)}
                        className="flex w-full gap-3 text-left"
                      >
                        {serviceThumb(service)}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#1F2420]">{service.name}</p>
                          <p className="mt-0.5 text-xs text-[#7A6A58]">
                            {categoriesById.get(service.categoryId)?.name ?? "—"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {!service.imageUrl ? (
                              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                                Missing image
                              </span>
                            ) : null}
                            {service.branchIds.length === 0 ? (
                              <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-900">
                                No branches
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3 text-xs">
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ${
                            service.isActive ? "bg-emerald-50 text-emerald-900" : "bg-neutral-100 text-neutral-700"
                          }`}
                        >
                          {service.isActive ? "Active" : "Inactive"}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ${
                            service.bookingAvailability ? "bg-sky-50 text-sky-900" : "bg-neutral-100 text-neutral-700"
                          }`}
                        >
                          {service.bookingAvailability ? "Online" : "Hidden"}
                        </span>
                        <span className="ml-auto font-medium text-[#1F2420]">{formatEGP(service.basePrice)}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailService(service)}
                          className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold"
                        >
                          Details
                        </button>
                        {canManage ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditServiceModal(service)}
                              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void onToggleServiceStatus(service)}
                              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold"
                            >
                              {service.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-[#FFFCF6]/30 px-4 py-3">
              <p className="text-xs text-[#7A6A58]">
                Page {listMeta.page} of {Math.max(1, listMeta.totalPages)}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!listMeta.hasNextPage}
                  onClick={() => setPage((prev) => prev + 1)}
                  className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {serviceModalOpen && token ? (
          <ServiceFormModal
            open
            onClose={() => setServiceModalOpen(false)}
            accessToken={token}
            categories={categories}
            branches={branches}
            editingService={editingService}
            canManage={canManage}
            canReadGallery={canReadGallery}
            canReadVariants={canReadVariants}
            canManageVariants={canManageVariants}
            onSaved={async () => {
              const nextRows = await loadBaseData();
              setDetailService((prev) => {
                if (!prev) return null;
                return nextRows.find((r) => r.id === prev.id) ?? prev;
              });
            }}
          />
        ) : null}

        {detailService ? (
          <ServiceDetailsDrawer
            service={detailService}
            categoryName={categoriesById.get(detailService.categoryId)?.name ?? "Category"}
            branches={branches}
            onClose={() => setDetailService(null)}
            canManage={canManage}
            onEdit={(s) => {
              setDetailService(null);
              openEditServiceModal(s);
            }}
            onToggleActive={async (s) => {
              await onToggleServiceStatus(s);
            }}
          />
        ) : null}

        {categoryModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2A1722]/45 p-4">
            <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <h2 className="text-lg font-semibold text-[#1F2420]">
                {editingCategory ? "Edit category" : "Create category"}
              </h2>
              <form className="mt-5 space-y-4" onSubmit={onSaveCategory}>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-[#1F2420]">Category name</span>
                  <input
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    required
                    className="w-full rounded-xl border border-border bg-white px-3 py-2.5 shadow-sm outline-none ring-accent/25 focus:ring-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-[#1F2420]">Sort order</span>
                  <input
                    type="number"
                    min={0}
                    value={categorySortOrder}
                    onChange={(event) => setCategorySortOrder(event.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2.5 shadow-sm outline-none ring-accent/25 focus:ring-2"
                  />
                </label>
                {categoryError ? (
                  <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                    {categoryError}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCategoryModalOpen(false)}
                    className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={categorySaving}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {categorySaving ? "Saving…" : "Save"}
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
