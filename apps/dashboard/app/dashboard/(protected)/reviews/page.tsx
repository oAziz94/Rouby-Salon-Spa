"use client";

import {
  ApiClientError,
  activateDashboardReview,
  createDashboardReview,
  deactivateDashboardReview,
  getDashboardBranches,
  getDashboardReviews,
  getDashboardReviewsStats,
  updateDashboardReview,
  updateDashboardReviewHomepageVisibility,
  type DashboardBranch,
  type DashboardReview,
  type DashboardReviewStats,
} from "@rouby/api-client";
import { Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "error";

type AppliedFilters = {
  search: string;
  isActive: "" | "true" | "false";
  homepage: "" | "true" | "false";
  rating: "" | "5" | "4" | "lte3";
  branchId: string;
};

const DEFAULT_FILTERS: AppliedFilters = {
  search: "",
  isActive: "",
  homepage: "",
  rating: "",
  branchId: "",
};

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function StarRatingInput(props: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={props.disabled}
          onClick={() => props.onChange(n)}
          className="rounded p-0.5 transition-transform hover:scale-110 disabled:opacity-40"
          aria-label={`${n} stars`}
        >
          <Star
            className={`h-7 w-7 ${
              n <= props.value
                ? "fill-[#c79d4a] text-[#c79d4a]"
                : "fill-transparent text-[#c9b89a]"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export default function DashboardReviewsPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canRead = hasPermission("reviews.read");
  const canCreate = hasPermission("reviews.create") || hasPermission("reviews.manage");
  const canUpdate = hasPermission("reviews.update") || hasPermission("reviews.manage");
  const canDeactivate = hasPermission("reviews.deactivate") || hasPermission("reviews.manage");
  const canHomepage =
    hasPermission("reviews.homepage_select") || hasPermission("reviews.manage");
  const canLoadBranches = hasPermission("branches.read");

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardReview[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 15, totalItems: 0, totalPages: 0 });
  const [stats, setStats] = useState<DashboardReviewStats | null>(null);
  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState<AppliedFilters>(DEFAULT_FILTERS);
  const [filters, setFilters] = useState<AppliedFilters>(DEFAULT_FILTERS);

  const [drawerReview, setDrawerReview] = useState<DashboardReview | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DashboardReview | null>(null);
  const [homepageConfirm, setHomepageConfirm] = useState<DashboardReview | null>(null);

  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const [form, setForm] = useState({
    clientName: "",
    clientTitle: "",
    source: "",
    rating: 5,
    quote: "",
    serviceName: "",
    branchId: "",
    isActive: true,
  });
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadBranches = useCallback(async () => {
    if (!token || !canLoadBranches) return;
    try {
      const list = await getDashboardBranches(token);
      setBranches(list);
    } catch {
      setBranches([]);
    }
  }, [token, canLoadBranches]);

  const loadStatsOnly = useCallback(async () => {
    if (!token) return;
    const s = await getDashboardReviewsStats(token);
    setStats(s);
  }, [token]);

  const loadList = useCallback(async () => {
    if (!token) return;
    setState("loading");
    setError("");
    try {
      const ratingQuery =
        filters.rating === "lte3"
          ? { ratingLte: 3 as const }
          : filters.rating === "5" || filters.rating === "4"
            ? { rating: Number(filters.rating) as 4 | 5 }
            : {};
      const result = await getDashboardReviews(token, {
        page,
        pageSize: 15,
        search: filters.search.trim() || undefined,
        isActive:
          filters.isActive === "" ? undefined : filters.isActive === "true",
        showOnHomepage:
          filters.homepage === "" ? undefined : filters.homepage === "true",
        branchId: filters.branchId || undefined,
        ...ratingQuery,
      });
      setRows(result.data);
      setMeta({
        page: result.meta.page,
        pageSize: result.meta.pageSize,
        totalItems: result.meta.totalItems,
        totalPages: result.meta.totalPages,
      });
      setState("loaded");
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }, [token, page, filters]);

  useEffect(() => {
    if (!token || !canRead) return;
    void loadStatsOnly();
  }, [token, canRead, loadStatsOnly]);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    if (!token || !canRead) return;
    void loadList();
  }, [token, canRead, loadList]);

  function applyFilters() {
    setPage(1);
    setFilters({ ...draftFilters });
  }

  function clearFilters() {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }

  const filterChips = useMemo(() => {
    const chips: string[] = [];
    if (filters.search.trim()) chips.push(`Search: “${filters.search.trim()}”`);
    if (filters.isActive === "true") chips.push("Active");
    if (filters.isActive === "false") chips.push("Inactive");
    if (filters.homepage === "true") chips.push("Homepage testimonial");
    if (filters.homepage === "false") chips.push("Not on homepage");
    if (filters.rating === "5") chips.push("5 stars");
    if (filters.rating === "4") chips.push("4 stars");
    if (filters.rating === "lte3") chips.push("3 stars and below");
    if (filters.branchId) {
      const b = branches.find((x) => x.id === filters.branchId);
      chips.push(b ? `Branch: ${b.name}` : "Branch filter");
    }
    return chips;
  }, [filters, branches]);

  function openCreateModal() {
    setEditingRow(null);
    setForm({
      clientName: "",
      clientTitle: "",
      source: "",
      rating: 5,
      quote: "",
      serviceName: "",
      branchId: "",
      isActive: true,
    });
    setSaveError("");
    setModalOpen(true);
  }

  function openEditModal(row: DashboardReview) {
    setEditingRow(row);
    setForm({
      clientName: row.clientName?.trim() || row.displayClientName,
      clientTitle: row.clientTitle ?? "",
      source: row.source ?? "",
      rating: row.rating,
      quote: row.quote ?? "",
      serviceName: row.serviceName ?? "",
      branchId: row.branchId ?? "",
      isActive: row.isActive,
    });
    setSaveError("");
    setModalOpen(true);
  }

  async function onSaveModal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        clientName: form.clientName.trim(),
        clientTitle: form.clientTitle.trim() || undefined,
        source: form.source.trim() || undefined,
        rating: form.rating,
        quote: form.quote.trim(),
        serviceName: form.serviceName.trim() || undefined,
        branchId: form.branchId || undefined,
        isActive: form.isActive,
      };
      if (editingRow) {
        await updateDashboardReview(token, editingRow.id, payload);
      } else {
        await createDashboardReview(token, payload);
      }
      setModalOpen(false);
      setToast({ tone: "success", message: editingRow ? "Testimonial updated." : "Testimonial created." });
      await Promise.all([loadList(), loadStatsOnly()]);
    } catch (requestError) {
      setSaveError(formatApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function onSetHomepage(row: DashboardReview) {
    if (!token) return;
    try {
      await updateDashboardReviewHomepageVisibility(token, row.id, {
        showOnHomepage: true,
      });
      setHomepageConfirm(null);
      setDrawerReview((prev) =>
        prev && prev.id === row.id ? { ...prev, showOnHomepage: true } : prev,
      );
      setToast({ tone: "success", message: "Homepage testimonial updated." });
      await Promise.all([loadList(), loadStatsOnly()]);
    } catch (requestError) {
      setToast({ tone: "error", message: formatApiError(requestError) });
    }
  }

  async function onRemoveHomepage(row: DashboardReview) {
    if (!token) return;
    try {
      await updateDashboardReviewHomepageVisibility(token, row.id, {
        showOnHomepage: false,
      });
      setDrawerReview((prev) =>
        prev && prev.id === row.id ? { ...prev, showOnHomepage: false } : prev,
      );
      setToast({ tone: "success", message: "Removed from homepage." });
      await Promise.all([loadList(), loadStatsOnly()]);
    } catch (requestError) {
      setToast({ tone: "error", message: formatApiError(requestError) });
    }
  }

  async function onActivate(row: DashboardReview) {
    if (!token) return;
    try {
      await activateDashboardReview(token, row.id);
      setToast({ tone: "success", message: "Testimonial activated." });
      await Promise.all([loadList(), loadStatsOnly()]);
      setDrawerReview((prev) => (prev && prev.id === row.id ? { ...prev, isActive: true } : prev));
    } catch (requestError) {
      setToast({ tone: "error", message: formatApiError(requestError) });
    }
  }

  async function onDeactivate(row: DashboardReview) {
    if (!token) return;
    try {
      await deactivateDashboardReview(token, row.id);
      setToast({ tone: "success", message: "Testimonial deactivated." });
      await Promise.all([loadList(), loadStatsOnly()]);
      setDrawerReview((prev) =>
        prev && prev.id === row.id
          ? { ...prev, isActive: false, showOnHomepage: false }
          : prev,
      );
    } catch (requestError) {
      setToast({ tone: "error", message: formatApiError(requestError) });
    }
  }

  const globalEmpty = stats !== null && stats.total === 0;
  const noMatches =
    state === "loaded" && stats !== null && stats.total > 0 && meta.totalItems === 0;

  return (
    <PermissionGuard permission="reviews.read">
      <section className="space-y-6 bg-[#fdf8f1]/40 pb-10">
        <header className="rounded-2xl border border-[#e8dbc4] bg-[#fffdf8] p-6 shadow-[0_8px_24px_rgba(42,62,46,0.06)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-[#1b3d29]">Reviews</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5f6c61]">
                Create and manage curated client testimonials shown on the public homepage.
              </p>
              <p className="mt-2 text-xs text-[#7A6A58]">
                Testimonials are added by admins and published to the homepage only when selected.
              </p>
            </div>
            {canCreate ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="shrink-0 rounded-xl bg-[#1b3d29] px-5 py-2.5 text-sm font-semibold text-[#fdf8f1] shadow-md transition hover:bg-[#163224]"
              >
                New testimonial
              </button>
            ) : null}
          </div>
        </header>

        {stats && stats.homepage === 0 && stats.total > 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/80 bg-[#fff8e8] px-5 py-4 text-sm text-[#6b4f1b] shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-[#5c4214]">No homepage testimonial selected.</p>
              <p className="mt-1 text-xs text-[#7a622c]">
                Choose an active testimonial to feature on the public homepage.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const first = rows.find((r) => r.isActive);
                if (first) setDrawerReview(first);
              }}
              className="rounded-lg border border-[#d4b87a] bg-white px-3 py-1.5 text-xs font-semibold text-[#5c4214]"
            >
              Select testimonial
            </button>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {state === "loading" && !stats ? (
            <>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-2xl border border-[#e8dbc4] bg-[#f5efe4]"
                />
              ))}
            </>
          ) : stats ? (
            <>
              <div className="rounded-2xl border border-[#e8dbc4] bg-[#fffdf8] p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">Total</p>
                <p className="mt-1 text-2xl font-semibold text-[#1b3d29]">{stats.total}</p>
              </div>
              <div className="rounded-2xl border border-[#e8dbc4] bg-[#fffdf8] p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">Active</p>
                <p className="mt-1 text-2xl font-semibold text-[#1b3d29]">{stats.active}</p>
              </div>
              <div className="rounded-2xl border border-[#e8dbc4] bg-[#fffdf8] p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">Homepage</p>
                <p className="mt-1 text-2xl font-semibold text-[#b9974a]">{stats.homepage}</p>
              </div>
              <div className="rounded-2xl border border-[#e8dbc4] bg-[#fffdf8] p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">
                  Avg. rating
                </p>
                <p className="mt-1 text-2xl font-semibold text-[#1b3d29]">
                  {stats.averageRating != null ? stats.averageRating.toFixed(1) : "—"}
                </p>
              </div>
            </>
          ) : null}
        </div>

        <section className="rounded-2xl border border-[#e8dbc4] bg-[#fffdf8] p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-6">
            <label className="text-sm lg:col-span-2">
              <span className="mb-1 block font-medium text-[#1b3d29]">Search</span>
              <input
                value={draftFilters.search}
                onChange={(e) =>
                  setDraftFilters((f) => ({ ...f, search: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyFilters();
                  }
                }}
                placeholder="Client name or quote"
                className="w-full rounded-lg border border-[#e4d8c8] bg-white px-3 py-2 text-[#1F2420]"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1b3d29]">Status</span>
              <select
                value={draftFilters.isActive}
                onChange={(e) =>
                  setDraftFilters((f) => ({ ...f, isActive: e.target.value as AppliedFilters["isActive"] }))
                }
                className="w-full rounded-lg border border-[#e4d8c8] bg-white px-3 py-2"
              >
                <option value="">All</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1b3d29]">Homepage</span>
              <select
                value={draftFilters.homepage}
                onChange={(e) =>
                  setDraftFilters((f) => ({
                    ...f,
                    homepage: e.target.value as AppliedFilters["homepage"],
                  }))
                }
                className="w-full rounded-lg border border-[#e4d8c8] bg-white px-3 py-2"
              >
                <option value="">All</option>
                <option value="true">Homepage testimonial</option>
                <option value="false">Not on homepage</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1b3d29]">Rating</span>
              <select
                value={draftFilters.rating}
                onChange={(e) =>
                  setDraftFilters((f) => ({
                    ...f,
                    rating: e.target.value as AppliedFilters["rating"],
                  }))
                }
                className="w-full rounded-lg border border-[#e4d8c8] bg-white px-3 py-2"
              >
                <option value="">All</option>
                <option value="5">5 stars</option>
                <option value="4">4 stars</option>
                <option value="lte3">3 stars and below</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1b3d29]">Branch</span>
              <select
                value={draftFilters.branchId}
                onChange={(e) =>
                  setDraftFilters((f) => ({ ...f, branchId: e.target.value }))
                }
                disabled={!branches.length}
                className="w-full rounded-lg border border-[#e4d8c8] bg-white px-3 py-2 disabled:opacity-50"
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applyFilters}
              className="rounded-lg bg-[#1b3d29] px-4 py-2 text-sm font-semibold text-[#fdf8f1]"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-[#e4d8c8] bg-white px-4 py-2 text-sm text-[#1b3d29]"
            >
              Clear filters
            </button>
            {filterChips.length ? (
              <div className="flex flex-wrap gap-2">
                {filterChips.map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-[#dcc9a5] bg-[#f8efdd] px-3 py-1 text-xs font-medium text-[#7a5f2c]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {state === "error" ? (
          <div className="rounded-2xl border border-[#E7B9A4] bg-[#FFF1EC] p-6 text-sm text-red-800">
            <p className="font-medium">Something went wrong</p>
            <p className="mt-2">{error}</p>
            <button
              type="button"
              onClick={() => {
                void loadStatsOnly();
                void loadList();
              }}
              className="mt-4 rounded-lg bg-[#1b3d29] px-4 py-2 text-sm font-semibold text-[#fdf8f1]"
            >
              Retry
            </button>
          </div>
        ) : null}

        {state === "loaded" && globalEmpty ? (
          <div className="rounded-2xl border border-[#e8dbc4] bg-[#fffdf8] p-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-[#1b3d29]">No testimonials yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#5f6c61]">
              Add curated client testimonials and choose which one appears on the homepage.
            </p>
            {canCreate ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-6 rounded-xl bg-[#1b3d29] px-5 py-2.5 text-sm font-semibold text-[#fdf8f1]"
              >
                New testimonial
              </button>
            ) : null}
          </div>
        ) : null}

        {state === "loaded" && noMatches ? (
          <div className="rounded-2xl border border-[#e8dbc4] bg-[#fffdf8] p-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-[#1b3d29]">No matching testimonials</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#5f6c61]">
              Try changing filters or clearing the search.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-6 rounded-lg border border-[#e4d8c8] bg-white px-4 py-2 text-sm font-semibold text-[#1b3d29]"
            >
              Clear filters
            </button>
          </div>
        ) : null}

        {state === "loading" && stats !== null ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border border-[#e8dbc4] bg-[#f5efe4]"
              />
            ))}
          </div>
        ) : null}

        {state === "loaded" && stats !== null && meta.totalItems > 0 ? (
          <section className="rounded-2xl border border-[#e8dbc4] bg-[#fffdf8] p-4 shadow-sm md:p-5">
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#e8dbc4] text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Client</th>
                    <th className="py-2 pr-3 font-medium">Rating</th>
                    <th className="py-2 pr-3 font-medium">Homepage</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Branch</th>
                    <th className="py-2 pr-3 font-medium">Updated</th>
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setDrawerReview(row)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDrawerReview(row);
                        }
                      }}
                      className="cursor-pointer border-b border-[#f0e6d8] transition hover:bg-[#fff9ef]"
                    >
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8f0ea] text-xs font-bold text-[#1b3d29]">
                            {initials(row.displayClientName)}
                          </span>
                          <div>
                            <p className="font-medium text-[#1b3d29]">{row.displayClientName}</p>
                            <p className="line-clamp-1 text-xs text-[#7A6A58]">
                              {(row.clientTitle || row.source || "—") + " · "}
                              {(row.quote ?? "").slice(0, 72)}
                              {(row.quote?.length ?? 0) > 72 ? "…" : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <span className="inline-flex items-center gap-0.5 text-[#c79d4a]">
                          {Array.from({ length: row.rating }).map((_, i) => (
                            <Star key={i} className="h-3.5 w-3.5 fill-current" />
                          ))}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        {row.showOnHomepage ? (
                          <span className="rounded-full bg-[#f8efdd] px-2 py-0.5 text-xs font-semibold text-[#a4782f]">
                            Homepage testimonial
                          </span>
                        ) : (
                          <span className="text-xs text-[#9a9084]">Not shown</span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            row.isActive
                              ? "bg-[#e8f2ee] text-[#1b3d29]"
                              : "bg-[#f3ece8] text-[#7a5c52]"
                          }`}
                        >
                          {row.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-[#5f6c61]">{row.branchName ?? "—"}</td>
                      <td className="py-3 pr-3 text-xs text-[#7A6A58]">
                        {new Date(row.updatedAt).toLocaleDateString()}
                        {row.updatedByName ? (
                          <span className="mt-0.5 block text-[10px] text-[#9a9084]">
                            {row.updatedByName}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                          {canUpdate ? (
                            <button
                              type="button"
                              onClick={() => openEditModal(row)}
                              className="rounded border border-[#e4d8c8] bg-white px-2 py-1 text-xs"
                            >
                              Edit
                            </button>
                          ) : null}
                          {canHomepage && row.isActive && !row.showOnHomepage ? (
                            <button
                              type="button"
                              onClick={() => setHomepageConfirm(row)}
                              className="rounded border border-[#dcc9a5] bg-[#fff8e8] px-2 py-1 text-xs font-medium text-[#7a5f2c]"
                            >
                              Set as homepage
                            </button>
                          ) : null}
                          {canHomepage && row.showOnHomepage ? (
                            <button
                              type="button"
                              onClick={() => void onRemoveHomepage(row)}
                              className="rounded border border-[#e4d8c8] bg-white px-2 py-1 text-xs"
                            >
                              Remove from homepage
                            </button>
                          ) : null}
                          {canDeactivate && row.isActive ? (
                            <button
                              type="button"
                              onClick={() => void onDeactivate(row)}
                              className="rounded border border-[#e4d8c8] bg-white px-2 py-1 text-xs"
                            >
                              Deactivate
                            </button>
                          ) : null}
                          {canDeactivate && !row.isActive ? (
                            <button
                              type="button"
                              onClick={() => void onActivate(row)}
                              className="rounded border border-[#e4d8c8] bg-white px-2 py-1 text-xs"
                            >
                              Activate
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 lg:hidden">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setDrawerReview(row)}
                  className="w-full rounded-xl border border-[#e8dbc4] bg-white p-4 text-left shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8f0ea] text-xs font-bold text-[#1b3d29]">
                      {initials(row.displayClientName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[#1b3d29]">{row.displayClientName}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-[#5f6c61]">{row.quote}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-wide text-[#7A6A58]">
                        {row.showOnHomepage ? (
                          <span className="rounded-full bg-[#f8efdd] px-2 py-0.5 text-[#a4782f]">
                            Homepage
                          </span>
                        ) : null}
                        <span>{row.isActive ? "Active" : "Inactive"}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-[#7A6A58]">
              <span>
                Page {meta.page} of {Math.max(1, meta.totalPages)} · {meta.totalItems} total
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-[#e4d8c8] bg-white px-3 py-1 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-[#e4d8c8] bg-white px-3 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {drawerReview ? (
          <div className="fixed inset-0 z-50 flex justify-end bg-[#2A1722]/40">
            <button
              type="button"
              className="hidden flex-1 md:block"
              aria-label="Close drawer"
              onClick={() => setDrawerReview(null)}
            />
            <aside className="h-full w-full max-w-md overflow-y-auto border-l border-[#e8dbc4] bg-[#fffdf8] shadow-2xl">
              <div className="border-b border-[#e8dbc4] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f0ea] text-sm font-bold text-[#1b3d29]">
                      {initials(drawerReview.displayClientName)}
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold text-[#1b3d29]">
                        {drawerReview.displayClientName}
                      </h2>
                      <div className="mt-1 inline-flex gap-0.5 text-[#c79d4a]">
                        {Array.from({ length: drawerReview.rating }).map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-current" />
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            drawerReview.isActive
                              ? "bg-[#e8f2ee] text-[#1b3d29]"
                              : "bg-[#f3ece8] text-[#7a5c52]"
                          }`}
                        >
                          {drawerReview.isActive ? "Active" : "Inactive"}
                        </span>
                        {drawerReview.showOnHomepage ? (
                          <span className="rounded-full bg-[#f8efdd] px-2 py-0.5 text-xs font-semibold text-[#a4782f]">
                            Homepage testimonial
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerReview(null)}
                    className="rounded-lg border border-[#e4d8c8] px-2 py-1 text-xs"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canUpdate ? (
                    <button
                      type="button"
                      onClick={() => {
                        openEditModal(drawerReview);
                        setDrawerReview(null);
                      }}
                      className="rounded-lg bg-[#1b3d29] px-3 py-1.5 text-xs font-semibold text-[#fdf8f1]"
                    >
                      Edit
                    </button>
                  ) : null}
                  {canHomepage && drawerReview.isActive && drawerReview.showOnHomepage ? (
                    <button
                      type="button"
                      onClick={() => void onRemoveHomepage(drawerReview)}
                      className="rounded-lg border border-[#e4d8c8] bg-white px-3 py-1.5 text-xs"
                    >
                      Remove from homepage
                    </button>
                  ) : null}
                  {canHomepage && drawerReview.isActive && !drawerReview.showOnHomepage ? (
                    <button
                      type="button"
                      onClick={() => setHomepageConfirm(drawerReview)}
                      className="rounded-lg border border-[#dcc9a5] bg-[#fff8e8] px-3 py-1.5 text-xs font-semibold text-[#7a5f2c]"
                    >
                      Set as homepage testimonial
                    </button>
                  ) : null}
                  {canHomepage && !drawerReview.isActive ? (
                    <p className="w-full text-xs text-[#9a6a55]">
                      Activate this testimonial before showing it on the homepage.
                    </p>
                  ) : null}
                  {canDeactivate && drawerReview.isActive ? (
                    <button
                      type="button"
                      onClick={() => void onDeactivate(drawerReview)}
                      className="rounded-lg border border-[#e4d8c8] bg-white px-3 py-1.5 text-xs"
                    >
                      Deactivate
                    </button>
                  ) : null}
                  {canDeactivate && !drawerReview.isActive ? (
                    <button
                      type="button"
                      onClick={() => void onActivate(drawerReview)}
                      className="rounded-lg border border-[#e4d8c8] bg-white px-3 py-1.5 text-xs"
                    >
                      Activate
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="space-y-6 p-5">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                    Quote
                  </h3>
                  <div className="mt-2 rounded-2xl border border-[#e8dbc4] bg-[#fff9ef] p-4 text-sm leading-relaxed text-[#314439] shadow-inner">
                    <p className="whitespace-pre-wrap">{drawerReview.quote}</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                    Display
                  </h3>
                  <dl className="mt-2 space-y-1 text-sm text-[#5f6c61]">
                    <div className="flex justify-between gap-2">
                      <dt>Homepage</dt>
                      <dd className="font-medium text-[#1b3d29]">
                        {drawerReview.showOnHomepage ? "Yes" : "No"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Branch</dt>
                      <dd className="font-medium text-[#1b3d29]">{drawerReview.branchName ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Source</dt>
                      <dd className="font-medium text-[#1b3d29]">{drawerReview.source ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                    Homepage preview
                  </h3>
                  <div className="mt-2 overflow-hidden rounded-2xl border border-[#e7d8bf] bg-[#fffaf1]/95 p-4 shadow-md">
                    <div className="flex items-center justify-between">
                      <p className="inline-flex gap-0.5 text-[#c79d4a]">
                        {Array.from({ length: drawerReview.rating }).map((_, i) => (
                          <Star key={i} className="h-3.5 w-3.5 fill-current" />
                        ))}
                      </p>
                      <span className="text-[#b9974a]">“</span>
                    </div>
                    <p className="mt-2 line-clamp-4 text-xs font-medium text-[#314439]">
                      {drawerReview.quote}
                    </p>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[#5f6c61]">
                      {drawerReview.displayClientName}
                    </p>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                    Record
                  </h3>
                  <dl className="mt-2 space-y-1 text-xs text-[#5f6c61]">
                    <div>Created {new Date(drawerReview.createdAt).toLocaleString()}</div>
                    <div>Updated {new Date(drawerReview.updatedAt).toLocaleString()}</div>
                    <div>Created by {drawerReview.createdByName ?? "—"}</div>
                    <div>Updated by {drawerReview.updatedByName ?? "—"}</div>
                  </dl>
                </div>
              </div>
            </aside>
          </div>
        ) : null}

        {homepageConfirm ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2A1722]/50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-[#e8dbc4] bg-[#fffdf8] p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-[#1b3d29]">Set as homepage testimonial?</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#5f6c61]">
                Only one testimonial can appear on the homepage. This will replace the currently
                selected homepage testimonial.
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setHomepageConfirm(null)}
                  className="rounded-lg border border-[#e4d8c8] bg-white px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void onSetHomepage(homepageConfirm)}
                  className="rounded-lg bg-[#1b3d29] px-4 py-2 text-sm font-semibold text-[#fdf8f1]"
                >
                  Set as homepage testimonial
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {modalOpen ? (
          <div className="fixed inset-0 z-[55] overflow-y-auto bg-[#2A1722]/40 p-4">
            <section className="mx-auto mt-6 w-full max-w-lg rounded-2xl border border-[#e8dbc4] bg-[#fffdf8] p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-[#1b3d29]">
                {editingRow ? "Edit testimonial" : "New testimonial"}
              </h2>
              <form className="mt-4 space-y-4" onSubmit={onSaveModal}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block font-medium text-[#1b3d29]">Client name</span>
                    <input
                      required
                      value={form.clientName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, clientName: e.target.value }))
                      }
                      className="w-full rounded-lg border border-[#e4d8c8] bg-white px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-[#1b3d29]">Client title</span>
                    <input
                      value={form.clientTitle}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, clientTitle: e.target.value }))
                      }
                      placeholder="Bride, Regular client…"
                      className="w-full rounded-lg border border-[#e4d8c8] bg-white px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-[#1b3d29]">Source</span>
                    <input
                      value={form.source}
                      onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                      placeholder="Manual, Google…"
                      className="w-full rounded-lg border border-[#e4d8c8] bg-white px-3 py-2"
                    />
                  </label>
                </div>
                <div>
                  <span className="mb-1 block text-sm font-medium text-[#1b3d29]">Rating</span>
                  <StarRatingInput
                    value={form.rating}
                    onChange={(n) => setForm((f) => ({ ...f, rating: n }))}
                  />
                </div>
                <label className="text-sm">
                  <span className="mb-1 flex justify-between font-medium text-[#1b3d29]">
                    <span>Quote</span>
                    <span className="text-xs font-normal text-[#7A6A58]">
                      {form.quote.length} / 4000
                    </span>
                  </span>
                  <textarea
                    required
                    rows={5}
                    maxLength={4000}
                    value={form.quote}
                    onChange={(e) => setForm((f) => ({ ...f, quote: e.target.value }))}
                    className="w-full rounded-lg border border-[#e4d8c8] bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1b3d29]">Service name</span>
                  <input
                    value={form.serviceName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, serviceName: e.target.value }))
                    }
                    className="w-full rounded-lg border border-[#e4d8c8] bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1b3d29]">Branch</span>
                  <select
                    value={form.branchId}
                    onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                    disabled={!branches.length}
                    className="w-full rounded-lg border border-[#e4d8c8] bg-white px-3 py-2 disabled:opacity-50"
                  >
                    <option value="">None</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-[#1b3d29]">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, isActive: e.target.checked }))
                    }
                  />
                  Active
                </label>
                <div className="rounded-xl border border-[#e8dbc4] bg-[#fff9ef] p-4">
                  <p className="text-xs font-medium text-[#7A6A58]">Live preview</p>
                  <p className="mt-2 inline-flex gap-0.5 text-[#c79d4a]">
                    {Array.from({ length: form.rating }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-current" />
                    ))}
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm text-[#314439]">{form.quote || "…"}</p>
                  <p className="mt-2 text-xs font-semibold text-[#5f6c61]">
                    {form.clientName || "Client name"}
                  </p>
                </div>
                {saveError ? (
                  <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-red-800">
                    {saveError}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-lg border border-[#e4d8c8] bg-white px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-[#1b3d29] px-4 py-2 text-sm font-semibold text-[#fdf8f1] disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        {toast ? (
          <div
            className={`fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-xl border px-4 py-2 text-sm shadow-lg ${
              toast.tone === "success"
                ? "border-[#0E342B]/25 bg-[#E8F2EE] text-[#0E342B]"
                : "border-[#E7B9A4]/80 bg-[#FFF1EC] text-red-800"
            }`}
          >
            {toast.message}
          </div>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
