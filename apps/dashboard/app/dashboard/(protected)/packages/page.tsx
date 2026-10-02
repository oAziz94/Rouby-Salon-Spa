"use client";

import {
  ApiClientError,
  getDashboardBranches,
  getDashboardPackages,
  getDashboardServiceCategories,
  getDashboardServices,
  patchDashboardPackageStatus,
  type DashboardBranch,
  type DashboardListMeta,
  type DashboardPackage,
  type DashboardService,
  type DashboardServiceCategory,
} from "@rouby/api-client";
import { ChevronRight, Package, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useSystemDialog } from "@/components/system-dialog-provider";
import { useDashboardAuth } from "@/lib/dashboard-auth";
import { PackageDetailsDrawer } from "./_components/package-details-drawer";
import { PackageFormModal } from "./_components/package-form-modal";
import {
  formatDurationMinutes,
  formatEGP,
  hasPackageSetupIssue,
  matchesQuality,
  missingSetupCount,
  packageInitials,
  savingsAmount,
  savingsPercent,
  serviceByIdMap,
  type OnlineFilter,
  type QualityKey,
} from "./_components/package-utils";

type LoadState = "loading" | "loaded" | "empty" | "error";

const defaultMeta: DashboardListMeta = {
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 1,
  hasNextPage: false,
};

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

async function loadAllServices(token: string): Promise<DashboardService[]> {
  const out: DashboardService[] = [];
  let page = 1;
  const pageSize = 100;
  for (;;) {
    const res = await getDashboardServices(token, { page, pageSize });
    out.push(...res.data);
    if (!res.meta.hasNextPage) break;
    page += 1;
    if (page > 30) break;
  }
  return out;
}

export default function DashboardPackagesPage() {
  const { token, hasPermission } = useDashboardAuth();
  const { confirm } = useSystemDialog();
  const canManage = hasPermission("packages.manage");

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardPackage[]>([]);
  const [listMeta, setListMeta] = useState<DashboardListMeta>(defaultMeta);
  const [page, setPage] = useState(1);

  const [allServices, setAllServices] = useState<DashboardService[]>([]);
  const [categories, setCategories] = useState<DashboardServiceCategory[]>([]);
  const [branches, setBranches] = useState<DashboardBranch[]>([]);

  const [draftSearch, setDraftSearch] = useState("");
  const [draftActive, setDraftActive] = useState("");
  const [draftOnline, setDraftOnline] = useState<OnlineFilter>("all");
  const [draftBranchId, setDraftBranchId] = useState("");
  const [draftQuality, setDraftQuality] = useState<QualityKey>("all");

  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedActive, setAppliedActive] = useState("");
  const [appliedOnline, setAppliedOnline] = useState<OnlineFilter>("all");
  const [appliedBranchId, setAppliedBranchId] = useState("");
  const [appliedQuality, setAppliedQuality] = useState<QualityKey>("all");

  const [statTotal, setStatTotal] = useState<number | null>(null);
  const [statActive, setStatActive] = useState<number | null>(null);
  const [statOnline, setStatOnline] = useState<number | null>(null);
  const [statAvgSavings, setStatAvgSavings] = useState<number | null>(null);
  const [statMissingSetup, setStatMissingSetup] = useState<number | null>(null);
  const [statsNote, setStatsNote] = useState("");
  const [statsLoading, setStatsLoading] = useState(true);

  const [detailPkg, setDetailPkg] = useState<DashboardPackage | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<DashboardPackage | null>(null);

  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name] as const)),
    [categories],
  );

  const loadList = useCallback(async () => {
    if (!token) return;
    setState("loading");
    setError("");
    try {
      const res = await getDashboardPackages(token, {
        page,
        pageSize: 20,
        isActive: appliedActive === "" ? undefined : appliedActive === "true",
        search: appliedSearch.trim() || undefined,
        branchId: appliedBranchId || undefined,
        publicListing:
          appliedOnline === "all" ? undefined : appliedOnline === "online" ? true : false,
      });
      setRows(res.data);
      setListMeta(res.meta);
      setState(res.data.length ? "loaded" : "empty");
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }, [token, page, appliedSearch, appliedActive, appliedOnline, appliedBranchId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadBase = useCallback(async () => {
    if (!token) return;
    try {
      const [cats, br, svc] = await Promise.all([
        getDashboardServiceCategories(token),
        getDashboardBranches(token).catch(() => []),
        loadAllServices(token),
      ]);
      setCategories(cats.data);
      setBranches(br);
      setAllServices(svc);
    } catch {
      /* non-fatal */
    }
  }, [token]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const loadStats = useCallback(async () => {
    if (!token) return;
    setStatsLoading(true);
    setStatsNote("");
    try {
      // One page of 100 answers every tile for a salon-sized catalogue; only very large
      // catalogues need the extra pages (capped at 3 requests in total).
      const first = await getDashboardPackages(token, { page: 1, pageSize: 100 });
      const total = first.meta.totalItems;
      const pages = Math.min(3, Math.max(1, Math.ceil(total / 100)));
      const rest =
        pages > 1
          ? await Promise.all(
              Array.from({ length: pages - 1 }, (_, i) =>
                getDashboardPackages(token, { page: i + 2, pageSize: 100 }),
              ),
            )
          : [];
      const merged = [first, ...rest].flatMap((c) => c.data);
      setStatTotal(total);
      setStatActive(merged.filter((pkg) => pkg.isActive).length);
      setStatOnline(merged.filter((pkg) => pkg.isPublicListingReady).length);
      if (merged.length) {
        const savings = merged.map(savingsAmount).filter((s) => s > 0);
        const avg = savings.length ? savings.reduce((a, b) => a + b, 0) / savings.length : 0;
        setStatAvgSavings(Math.round(avg * 100) / 100);
        setStatMissingSetup(merged.filter(hasPackageSetupIssue).length);
      } else {
        setStatAvgSavings(null);
        setStatMissingSetup(null);
      }
      if (total > merged.length) {
        setStatsNote(`Averages and setup counts include the first ${merged.length} of ${total} packages.`);
      }
    } catch {
      setStatTotal(null);
      setStatActive(null);
      setStatOnline(null);
      setStatAvgSavings(null);
      setStatMissingSetup(null);
    } finally {
      setStatsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  function applyFilters() {
    setAppliedSearch(draftSearch);
    setAppliedActive(draftActive);
    setAppliedOnline(draftOnline);
    setAppliedBranchId(draftBranchId);
    setAppliedQuality(draftQuality);
    setPage(1);
  }

  function clearFilters() {
    setDraftSearch("");
    setDraftActive("");
    setDraftOnline("all");
    setDraftBranchId("");
    setDraftQuality("all");
    setAppliedSearch("");
    setAppliedActive("");
    setAppliedOnline("all");
    setAppliedBranchId("");
    setAppliedQuality("all");
    setPage(1);
  }

  const filterChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (appliedSearch.trim()) chips.push({ key: "q", label: `Search: “${appliedSearch.trim()}”` });
    if (appliedActive === "true") chips.push({ key: "a1", label: "Active" });
    if (appliedActive === "false") chips.push({ key: "a0", label: "Inactive" });
    if (appliedOnline === "online") chips.push({ key: "o1", label: "On public catalog" });
    if (appliedOnline === "hidden") chips.push({ key: "o0", label: "Not on public catalog" });
    if (appliedBranchId) {
      const name = branches.find((b) => b.id === appliedBranchId)?.name ?? "Branch";
      chips.push({ key: "br", label: `Branch: ${name}` });
    }
    if (appliedQuality === "missing-services") chips.push({ key: "q1", label: "Missing services" });
    if (appliedQuality === "missing-branches") chips.push({ key: "q2", label: "Missing branches" });
    if (appliedQuality === "missing-price") chips.push({ key: "q3", label: "Missing price" });
    if (appliedQuality === "missing-duration") chips.push({ key: "q4", label: "Missing duration" });
    return chips;
  }, [appliedSearch, appliedActive, appliedOnline, appliedBranchId, appliedQuality, branches]);

  const svcMap = useMemo(() => serviceByIdMap(allServices), [allServices]);

  const visibleRows = useMemo(
    () => rows.filter((r) => matchesQuality(r, appliedQuality)),
    [rows, appliedQuality],
  );

  function openCreateModal() {
    setEditingPkg(null);
    setModalOpen(true);
  }

  function openEditModal(row: DashboardPackage) {
    setEditingPkg(row);
    setModalOpen(true);
    setDrawerOpen(false);
    setDetailPkg(null);
  }

  function openDrawer(row: DashboardPackage) {
    setDetailPkg(row);
    setDrawerOpen(true);
  }

  async function onToggleStatus(row: DashboardPackage) {
    if (!token) return;
    if (row.isActive) {
      const ok = await confirm({
        title: "Deactivate package?",
        message:
          "Deactivating this package hides it from future selection and online booking. Existing bookings and invoices will not be changed.",
        tone: "danger",
        confirmLabel: "Deactivate",
        cancelLabel: "Keep active",
      });
      if (!ok) return;
    } else {
      const blockers = [
        row.serviceIds.length === 0 ? "No services" : "",
        row.branchIds.length === 0 ? "No branch availability" : "",
        row.packagePrice <= 0 ? "No package price" : "",
        row.durationMinutes == null || row.durationMinutes < 1 ? "Missing duration" : "",
      ].filter(Boolean);
      if (blockers.length) {
        const proceed = await confirm({
          title: "Activate with gaps?",
          message: `This package is missing recommended setup:\n• ${blockers.join("\n• ")}\n\nActivate anyway?`,
          confirmLabel: "Activate anyway",
          cancelLabel: "Go back",
        });
        if (!proceed) return;
      }
    }
    try {
      await patchDashboardPackageStatus(token, row.id, !row.isActive);
      setToast({ message: row.isActive ? "Package deactivated." : "Package activated.", tone: "success" });
      setDrawerOpen(false);
      setDetailPkg(null);
      await loadList();
      await loadStats();
    } catch (requestError) {
      setToast({ message: formatApiError(requestError), tone: "error" });
    }
  }

  const showNoMatchEmpty =
    state === "empty" &&
    (appliedSearch.trim() ||
      appliedActive ||
      appliedOnline !== "all" ||
      appliedBranchId ||
      appliedQuality !== "all");

  return (
    <PermissionGuard permission="packages.read">
      <section className="space-y-6">
        {toast ? (
          <div
            className={`fixed bottom-6 right-6 z-[70] max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ${
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-[#1F2420]">Packages</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#7A6A58]">
                Create curated service packages with bundled pricing, duration, branch availability, and online booking
                visibility.
              </p>
              <p className="mt-2 text-xs text-[#A89480]">
                Packages combine multiple services into one bookable offer with a package price.
              </p>
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-95"
              >
                New package
              </button>
            ) : null}
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Total packages", value: statTotal, icon: Package },
            { label: "Active packages", value: statActive, icon: Package },
            { label: "On public catalog", value: statOnline, icon: Package },
            {
              label: "Avg. savings",
              value: statAvgSavings != null ? formatEGP(statAvgSavings) : "—",
              icon: Package,
            },
            { label: "Missing setup", value: statMissingSetup, icon: Package },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/25"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-[#1F2420]">
                {statsLoading ? <span className="inline-block h-8 w-16 animate-pulse rounded bg-muted" /> : card.value}
              </p>
            </div>
          ))}
        </div>
        {statsNote ? <p className="text-xs text-[#7A6A58]">{statsNote}</p> : null}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm">
                <span className="mb-1 flex items-center gap-1 font-medium text-[#1F2420]">
                  <Search className="h-3.5 w-3.5 opacity-60" aria-hidden />
                  Search
                </span>
                <input
                  value={draftSearch}
                  onChange={(e) => setDraftSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyFilters();
                  }}
                  placeholder="Package name"
                  className="w-full rounded-lg border border-border bg-white px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Active state</span>
                <select
                  value={draftActive}
                  onChange={(e) => setDraftActive(e.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2"
                >
                  <option value="">All</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Public catalog</span>
                <select
                  value={draftOnline}
                  onChange={(e) => setDraftOnline(e.target.value as OnlineFilter)}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2"
                >
                  <option value="all">All</option>
                  <option value="online">On public catalog</option>
                  <option value="hidden">Not on public catalog</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Branch</span>
                <select
                  value={draftBranchId}
                  onChange={(e) => setDraftBranchId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2"
                >
                  <option value="">All branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm sm:col-span-2 lg:col-span-4">
                <span className="mb-1 block font-medium text-[#1F2420]">Quality</span>
                <select
                  value={draftQuality}
                  onChange={(e) => setDraftQuality(e.target.value as QualityKey)}
                  className="w-full max-w-md rounded-lg border border-border bg-white px-3 py-2"
                >
                  <option value="all">All</option>
                  <option value="missing-services">Missing services</option>
                  <option value="missing-branches">Missing branch setup</option>
                  <option value="missing-price">Missing price</option>
                  <option value="missing-duration">Missing duration</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-[#1F2420]"
              >
                Clear filters
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Apply
              </button>
            </div>
          </div>
          {filterChips.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {filterChips.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary"
                >
                  {c.label}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {state === "loading" ? (
          <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : null}

        {state === "error" ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 p-5 text-sm text-red-900">
            <p className="font-medium">Could not load packages</p>
            <p className="mt-1 text-red-800/90">{error}</p>
            <button
              type="button"
              onClick={() => void loadList()}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-900"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Retry
            </button>
          </div>
        ) : null}

        {state === "empty" ? (
          <div className="rounded-2xl border border-dashed border-border bg-[#FFFCF6]/50 p-10 text-center">
            <h2 className="text-lg font-semibold text-[#1F2420]">
              {showNoMatchEmpty ? "No matching packages" : "No packages yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#7A6A58]">
              {showNoMatchEmpty
                ? "Try changing filters or clearing the search."
                : "Create curated offers like bridal suites, spa escapes, and beauty packages."}
            </p>
            {showNoMatchEmpty ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium"
              >
                Clear filters
              </button>
            ) : canManage ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                New package
              </button>
            ) : null}
          </div>
        ) : null}

        {state === "loaded" && rows.length > 0 ? (
          <>
            {visibleRows.length === 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No packages on this page match the quality filter. Try another page or clear filters.
              </p>
            ) : null}

            {visibleRows.length > 0 ? (
            <div className="hidden md:block overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-[#FFFCF6]/80 text-left text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                    <th className="px-4 py-3">Package</th>
                    <th className="px-4 py-3">Services</th>
                    <th className="px-4 py-3">Pricing</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Visibility</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                      const sav = savingsAmount(row);
                      const pct = savingsPercent(row);
                      const svcNames = row.serviceIds.map((id) => svcMap.get(id)?.name).filter(Boolean) as string[];
                      const preview = svcNames.slice(0, 2).join(", ");
                      const more = svcNames.length > 2 ? ` +${svcNames.length - 2} more` : "";
                      const setupN = missingSetupCount(row);
                      return (
                        <tr
                          key={row.id}
                          className="cursor-pointer border-b border-border/60 transition hover:bg-[#FFF9EE]/90"
                          onClick={() => openDrawer(row)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-xs font-semibold text-[#5C4A3D]">
                                {packageInitials(row.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-[#1F2420]">{row.name}</p>
                                {row.shortDescription ? (
                                  <p className="mt-0.5 line-clamp-1 text-xs text-[#7A6A58]">{row.shortDescription}</p>
                                ) : null}
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {row.serviceIds.length === 0 ? (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                                      Missing services
                                    </span>
                                  ) : null}
                                  {row.branchIds.length === 0 ? (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                                      No branches
                                    </span>
                                  ) : null}
                                  {row.isFeatured ? (
                                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                                      Featured
                                    </span>
                                  ) : null}
                                  {setupN > 0 ? (
                                    <span className="rounded-full bg-[#FFF1EC] px-2 py-0.5 text-[10px] font-medium text-[#9A5C40]">
                                      {setupN} setup gap{setupN > 1 ? "s" : ""}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top text-[#1F2420]">
                            <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                              {row.serviceIds.length} service{row.serviceIds.length === 1 ? "" : "s"}
                            </span>
                            {preview ? (
                              <p className="mt-1 max-w-[200px] text-xs text-[#7A6A58]">
                                {preview}
                                {more}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <p className="text-xs text-[#A89480] line-through">{formatEGP(row.originalPrice)}</p>
                            <p className="font-semibold text-primary">{formatEGP(row.packagePrice)}</p>
                            {sav > 0 ? (
                              <p className="mt-0.5 text-xs font-medium text-emerald-800">
                                Save {formatEGP(sav)}
                                {pct != null ? ` (${pct}%)` : ""}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-top text-[#1F2420]">{formatDurationMinutes(row.durationMinutes)}</td>
                          <td className="px-4 py-3 align-top">
                            {row.isPublicListingReady ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                                Public catalog
                              </span>
                            ) : (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                Not listed
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                row.isActive ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {row.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openDrawer(row)}
                                className="rounded-md border border-border bg-white px-2 py-1 text-xs font-medium"
                              >
                                Details
                              </button>
                              {canManage ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(row)}
                                    className="rounded-md border border-border bg-white px-2 py-1 text-xs font-medium"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void onToggleStatus(row)}
                                    className="rounded-md border border-border bg-white px-2 py-1 text-xs font-medium"
                                  >
                                    {row.isActive ? "Deactivate" : "Activate"}
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            ) : null}

            {visibleRows.length > 0 ? (
            <div className="space-y-3 md:hidden">
              {visibleRows.map((row) => {
                  const sav = savingsAmount(row);
                  const pct = savingsPercent(row);
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => openDrawer(row)}
                      className="relative flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/30"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-xs font-semibold">
                        {packageInitials(row.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#1F2420]">{row.name}</p>
                        <p className="mt-1 text-xs text-[#7A6A58] line-through">{formatEGP(row.originalPrice)}</p>
                        <p className="text-sm font-semibold text-primary">{formatEGP(row.packagePrice)}</p>
                        {sav > 0 ? (
                          <p className="text-xs text-emerald-800">
                            Save {formatEGP(sav)}
                            {pct != null ? ` (${pct}%)` : ""}
                          </p>
                        ) : null}
                        <ChevronRight className="absolute right-3 top-4 h-4 w-4 text-[#C4B5A0]" aria-hidden />
                      </div>
                    </button>
                  );
                })}
            </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[#7A6A58]">
                Page {listMeta.page} of {Math.max(1, listMeta.totalPages)} · {listMeta.totalItems} total
                {appliedQuality !== "all" ? " · quality filter applies to this page" : ""}
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
                  disabled={!listMeta.hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : null}

        <PackageDetailsDrawer
          open={drawerOpen && Boolean(detailPkg)}
          onClose={() => {
            setDrawerOpen(false);
            setDetailPkg(null);
          }}
          pkg={detailPkg}
          services={allServices}
          branches={branches}
          categoryById={categoryById}
          canManage={canManage}
          onEdit={() => {
            if (detailPkg) openEditModal(detailPkg);
          }}
          onToggleActive={() => {
            if (detailPkg) void onToggleStatus(detailPkg);
          }}
        />

        {token ? (
          <PackageFormModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            accessToken={token}
            editing={editingPkg}
            allServices={allServices}
            branches={branches}
            categoryById={categoryById}
            onSaved={() => {
              void loadList();
              void loadStats();
            }}
            onToast={(message, tone) => setToast({ message, tone })}
          />
        ) : null}
      </section>
    </PermissionGuard>
  );
}
