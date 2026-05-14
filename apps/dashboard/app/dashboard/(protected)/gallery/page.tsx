"use client";

import {
  ApiClientError,
  attachDashboardGalleryAsset,
  deleteDashboardGalleryAsset,
  detachDashboardGalleryUsage,
  getDashboardGallery,
  getDashboardGalleryAsset,
  getDashboardGalleryStats,
  getDashboardServices,
  updateDashboardGalleryAsset,
  uploadDashboardGalleryAsset,
  type DashboardGalleryAssetDetail,
  type DashboardGalleryListItem,
  type DashboardGalleryStats,
  type DashboardListMeta,
  type DashboardService,
} from "@rouby/api-client";
import { Link2, Loader2, Search, SlidersHorizontal, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "empty" | "error";

const defaultMeta: DashboardListMeta = {
  page: 1,
  pageSize: 24,
  totalItems: 0,
  totalPages: 1,
  hasNextPage: false,
};

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

function usageBucketLabel(v: string): string {
  const m: Record<string, string> = {
    "": "All assets",
    unused: "Unused only",
    services: "Used on services",
    homepage: "Homepage / hero",
    other_sections: "About / visit sections",
  };
  return m[v] ?? v;
}

export default function DashboardGalleryPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canManage = hasPermission("gallery.manage");
  const canManageServices = hasPermission("services.manage");
  const drawerTitleId = useId();

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardGalleryListItem[]>([]);
  const [listMeta, setListMeta] = useState<DashboardListMeta>(defaultMeta);
  const [stats, setStats] = useState<DashboardGalleryStats | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [usageBucket, setUsageBucket] = useState("");
  const [libraryStatus, setLibraryStatus] = useState<"" | "ACTIVE" | "ARCHIVED">("");
  const [page, setPage] = useState(1);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DashboardGalleryAssetDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editAlt, setEditAlt] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editLibStatus, setEditLibStatus] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [editFeatured, setEditFeatured] = useState(false);
  const [editActive, setEditActive] = useState(true);
  const [editOrder, setEditOrder] = useState("0");
  const [savingDetail, setSavingDetail] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [servicesForAttach, setServicesForAttach] = useState<DashboardService[]>([]);
  const [servicesAttachLoading, setServicesAttachLoading] = useState(false);
  const [attachDestination, setAttachDestination] = useState("");
  const [attachServiceId, setAttachServiceId] = useState("");
  const [attachSectionKey, setAttachSectionKey] = useState("experience");
  const [attachSyncAlt, setAttachSyncAlt] = useState(false);
  const [attachSubmitting, setAttachSubmitting] = useState(false);

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const s = await getDashboardGalleryStats(token);
      setStats(s);
    } catch {
      setStats(null);
    }
  }, [token]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setState("loading");
    setError("");
    try {
      const bucket =
        usageBucket === "unused" ||
        usageBucket === "services" ||
        usageBucket === "homepage" ||
        usageBucket === "other_sections"
          ? usageBucket
          : undefined;
      const result = await getDashboardGallery(token, {
        page,
        pageSize: 24,
        search: appliedSearch.trim() || undefined,
        usageBucket: bucket,
        libraryStatus: libraryStatus || undefined,
      });
      setRows(result.data);
      setListMeta(result.meta);
      setState(result.data.length ? "loaded" : "empty");
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
      setRows([]);
    }
  }, [token, page, appliedSearch, usageBucket, libraryStatus]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function openDetail(id: string) {
    if (!token) return;
    setSelectedId(id);
    setDetail(null);
    setDetailError("");
    setAttachDestination("");
    setAttachServiceId("");
    setAttachSectionKey("experience");
    setAttachSyncAlt(false);
    setDetailLoading(true);
    try {
      const d = await getDashboardGalleryAsset(token, id);
      setDetail(d);
      setEditTitle(d.asset.title ?? "");
      setEditAlt(d.asset.altText ?? "");
      setEditCategory(d.asset.category ?? "");
      setEditTags((d.asset.tags ?? []).join(", "));
      setEditLibStatus(d.asset.libraryStatus);
      setEditFeatured(d.asset.isFeatured);
      setEditActive(d.asset.isActive);
      setEditOrder(String(d.asset.displayOrder));
    } catch (e) {
      setDetailError(formatApiError(e));
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
    setDetailError("");
    setAttachDestination("");
    setAttachServiceId("");
    setAttachSectionKey("experience");
    setAttachSyncAlt(false);
  }

  const loadServicesForAttach = useCallback(async () => {
    if (!token || !canManageServices) return;
    setServicesAttachLoading(true);
    try {
      const merged: DashboardService[] = [];
      const pageSize = 100;
      const first = await getDashboardServices(token, { page: 1, pageSize, isActive: true });
      merged.push(...first.data);
      const maxPages = Math.min(first.meta.totalPages, 50);
      for (let p = 2; p <= maxPages; p++) {
        const r = await getDashboardServices(token, { page: p, pageSize, isActive: true });
        merged.push(...r.data);
      }
      setServicesForAttach(merged);
    } catch {
      setServicesForAttach([]);
    } finally {
      setServicesAttachLoading(false);
    }
  }, [token, canManageServices]);

  useEffect(() => {
    if (selectedId && token && canManage && canManageServices) {
      void loadServicesForAttach();
    }
  }, [selectedId, token, canManage, canManageServices, loadServicesForAttach]);

  async function saveDetail() {
    if (!token || !selectedId || !canManage) return;
    setSavingDetail(true);
    setDetailError("");
    try {
      const tags = editTags
        .split(/[,]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const updated = await updateDashboardGalleryAsset(token, selectedId, {
        title: editTitle.trim() || null,
        altText: editAlt.trim() || null,
        category: editCategory.trim() || null,
        tags,
        libraryStatus: editLibStatus,
        isFeatured: editFeatured,
        isActive: editActive,
        displayOrder: Number(editOrder || "0"),
      });
      setDetail((prev) =>
        prev ? { ...prev, asset: { ...prev.asset, ...updated } } : { asset: updated, usages: [] },
      );
      await loadData();
      await loadStats();
    } catch (e) {
      setDetailError(formatApiError(e));
    } finally {
      setSavingDetail(false);
    }
  }

  async function onUploadFile(file: File) {
    if (!token || !canManage) return;
    setUploading(true);
    setError("");
    try {
      await uploadDashboardGalleryAsset(token, file, {});
      setPage(1);
      await loadData();
      await loadStats();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setUploading(false);
    }
  }

  async function onDetachUsage(usageId: string) {
    if (!token || !canManage) return;
    try {
      await detachDashboardGalleryUsage(token, usageId);
      if (selectedId) await openDetail(selectedId);
      await loadData();
      await loadStats();
    } catch (e) {
      setDetailError(formatApiError(e));
    }
  }

  async function onDeleteAsset() {
    if (!token || !selectedId || !canManage) return;
    if (!globalThis.confirm("Delete this image from the library? This fails if the image is still in use.")) {
      return;
    }
    setDeleteBusy(true);
    setDetailError("");
    try {
      await deleteDashboardGalleryAsset(token, selectedId);
      closeDetail();
      await loadData();
      await loadStats();
    } catch (e) {
      setDetailError(formatApiError(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onAttachToDestination() {
    if (!token || !selectedId || !canManage || !attachDestination) return;
    if (attachDestination === "SERVICE_IMAGE" && !canManageServices) {
      setDetailError("You need catalog permission (services.manage) to set a service cover image.");
      return;
    }
    if (attachDestination === "SERVICE_IMAGE" && !attachServiceId) {
      setDetailError("Select which service should use this image.");
      return;
    }
    if (attachDestination === "HOMEPAGE_SECTION" && !attachSectionKey.trim()) {
      setDetailError("Enter a section key for the homepage (e.g. experience).");
      return;
    }
    setAttachSubmitting(true);
    setDetailError("");
    try {
      if (attachDestination === "SERVICE_IMAGE") {
        await attachDashboardGalleryAsset(token, selectedId, {
          usageType: "SERVICE_IMAGE",
          entityId: attachServiceId,
          isPrimary: true,
          syncAltToService: attachSyncAlt,
        });
      } else if (attachDestination === "HOMEPAGE_HERO") {
        await attachDashboardGalleryAsset(token, selectedId, { usageType: "HOMEPAGE_HERO" });
      } else if (attachDestination === "HOMEPAGE_GALLERY") {
        await attachDashboardGalleryAsset(token, selectedId, { usageType: "HOMEPAGE_GALLERY" });
      } else if (attachDestination === "HOMEPAGE_SECTION") {
        await attachDashboardGalleryAsset(token, selectedId, {
          usageType: "HOMEPAGE_SECTION",
          sectionKey: attachSectionKey.trim(),
        });
      } else if (attachDestination === "ABOUT_STORY") {
        await attachDashboardGalleryAsset(token, selectedId, {
          usageType: "ABOUT_SECTION",
          sectionKey: "story",
        });
      } else if (attachDestination === "ABOUT_PHILOSOPHY") {
        await attachDashboardGalleryAsset(token, selectedId, {
          usageType: "ABOUT_SECTION",
          sectionKey: "philosophy",
        });
      } else if (attachDestination === "VISIT_US_SECTION") {
        await attachDashboardGalleryAsset(token, selectedId, {
          usageType: "VISIT_US_SECTION",
          sectionKey: "visit",
        });
      }
      setAttachDestination("");
      await openDetail(selectedId);
      await loadData();
      await loadStats();
    } catch (e) {
      setDetailError(formatApiError(e));
    } finally {
      setAttachSubmitting(false);
    }
  }

  return (
    <PermissionGuard permission="gallery.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-gradient-to-r from-card to-[#FFFCF6] p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Media library</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#7A6A58]">
                Central gallery for homepage, sections, and service images. Upload once, then attach
                where needed — no duplicate storage.
              </p>
            </div>
            {canManage ? (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-95">
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading…" : "Upload image"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void onUploadFile(f);
                  }}
                />
              </label>
            ) : null}
          </div>

          {stats ? (
            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Total", stats.totalImages],
                ["In use", stats.usedImages],
                ["Unused", stats.unusedImages],
                ["Service links", stats.serviceUsageAttachments],
              ].map(([label, n]) => (
                <div
                  key={label}
                  className="rounded-lg border border-border/80 bg-white/80 px-3 py-2.5 shadow-sm"
                >
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#7A6A58]">{label}</dt>
                  <dd className="mt-0.5 text-lg font-semibold text-[#1F2420]">{n}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </header>

        <section className="rounded-2xl border border-[#e4d8c4] bg-gradient-to-br from-[#FFFCF6] via-[#FFF9EE] to-[#f8f0e2] p-4 shadow-[0_8px_28px_rgba(42,62,46,0.06)] sm:p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:justify-between lg:gap-6">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2 text-[#5f6c61]">
                <SlidersHorizontal className="h-4 w-4 text-[#b9974a]" aria-hidden />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Find media</span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b9974a]" />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setPage(1);
                        setAppliedSearch(searchInput);
                      }
                    }}
                    placeholder="Title, alt text, description, or filename…"
                    className="w-full rounded-xl border border-[#dcc9a5]/80 bg-white py-2.5 pl-10 pr-3 text-sm text-[#1F2420] shadow-inner outline-none ring-[#1a3d28]/20 transition focus:ring-2"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPage(1);
                    setAppliedSearch(searchInput);
                  }}
                  className="shrink-0 rounded-xl bg-[#1a3d28] px-6 py-2.5 text-sm font-semibold text-[#f9f2e5] shadow-[0_6px_16px_rgba(26,61,40,0.25)] transition hover:bg-[#234d32]"
                >
                  Search
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-[#e4d8c4]/80 pt-4 sm:flex-row sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 lg:shrink-0 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-[220px]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7A6A58]">
                  Where used
                </span>
                <select
                  value={usageBucket}
                  onChange={(e) => {
                    setPage(1);
                    setUsageBucket(e.target.value);
                  }}
                  className="w-full cursor-pointer rounded-xl border border-[#dcc9a5]/80 bg-white px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none ring-[#1a3d28]/15 transition focus:ring-2"
                >
                  {["", "unused", "services", "homepage", "other_sections"].map((v) => (
                    <option key={v || "all"} value={v}>
                      {usageBucketLabel(v)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-[180px]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7A6A58]">
                  Library status
                </span>
                <select
                  value={libraryStatus}
                  onChange={(e) => {
                    setPage(1);
                    setLibraryStatus(e.target.value as typeof libraryStatus);
                  }}
                  className="w-full cursor-pointer rounded-xl border border-[#dcc9a5]/80 bg-white px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none ring-[#1a3d28]/15 transition focus:ring-2"
                >
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        {state === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-[#7A6A58]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading library…
          </p>
        ) : null}
        {state === "error" ? (
          <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] p-4 text-sm text-danger">{error}</p>
        ) : null}
        {state === "empty" ? (
          <p className="rounded-lg border border-border bg-[#FFFCF6] p-6 text-sm text-[#7A6A58]">
            No images match these filters. Try clearing search or upload a new image.
          </p>
        ) : null}

        {state === "loaded" ? (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => void openDetail(row.id)}
                    className="group w-full overflow-hidden rounded-xl border border-border/80 bg-white text-left shadow-sm transition hover:border-accent/40 hover:shadow-md"
                  >
                    <div className="relative aspect-square bg-[#FFFCF6]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={row.url}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:opacity-95"
                      />
                      {row.usageSummary.isUsed ? (
                        <span className="absolute left-2 top-2 rounded-full bg-[#13311d]/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f9f2e5]">
                          In use
                        </span>
                      ) : (
                        <span className="absolute left-2 top-2 rounded-full bg-[#fff8eb]/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7A6A58]">
                          Unused
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 p-2.5">
                      <p className="truncate text-xs font-semibold text-[#1F2420]">
                        {row.title?.trim() || row.originalName || "Untitled"}
                      </p>
                      {row.usageSummary.badges.length > 0 ? (
                        <p className="truncate text-[10px] text-[#7A6A58]">{row.usageSummary.badges.join(" · ")}</p>
                      ) : null}
                      {!row.usageSummary.hasAltText ? (
                        <p className="text-[10px] font-medium text-amber-800">Missing alt text</p>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
              <p className="text-xs text-[#7A6A58]">
                Page {listMeta.page} of {Math.max(1, listMeta.totalPages)} · {listMeta.totalItems} items
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

        {selectedId ? (
          <div className="fixed inset-0 z-[100] flex justify-end bg-[#2A1722]/45 p-0 sm:p-4">
            <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={closeDetail} />
            <aside
              role="dialog"
              aria-modal="true"
              aria-labelledby={drawerTitleId}
              className="relative flex h-full w-full max-w-md flex-col overflow-hidden border-l border-border bg-card shadow-2xl sm:max-h-[min(92dvh,880px)] sm:self-center sm:rounded-2xl sm:border"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border/80 bg-gradient-to-r from-card to-[#FFFCF6] px-4 py-4">
                <div className="min-w-0">
                  <h2 id={drawerTitleId} className="truncate text-lg font-semibold text-[#1F2420]">
                    Image details
                  </h2>
                  <p className="mt-1 text-xs text-[#7A6A58]">Edit metadata and review where this file is used.</p>
                </div>
                <button
                  type="button"
                  onClick={closeDetail}
                  className="rounded-lg border border-border bg-white p-2 text-[#1F2420]"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {detailLoading ? (
                  <div className="flex items-center gap-2 text-sm text-[#7A6A58]">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading…
                  </div>
                ) : detail ? (
                  <div className="space-y-5">
                    <div className="overflow-hidden rounded-xl border border-border bg-[#FFFCF6]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={detail.asset.url} alt="" className="max-h-56 w-full object-contain" />
                    </div>

                    {canManage ? (
                      <form
                        className="space-y-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveDetail();
                        }}
                      >
                        <label className="block text-xs font-medium text-[#1F2420]">
                          Title
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block text-xs font-medium text-[#1F2420]">
                          Alt text (accessibility)
                          <input
                            value={editAlt}
                            onChange={(e) => setEditAlt(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block text-xs font-medium text-[#1F2420]">
                          Category
                          <input
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block text-xs font-medium text-[#1F2420]">
                          Tags (comma-separated)
                          <input
                            value={editTags}
                            onChange={(e) => setEditTags(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block text-xs font-medium text-[#1F2420]">
                          Display order
                          <input
                            type="number"
                            min={0}
                            value={editOrder}
                            onChange={(e) => setEditOrder(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block text-xs font-medium text-[#1F2420]">
                          Library status
                          <select
                            value={editLibStatus}
                            onChange={(e) => setEditLibStatus(e.target.value as "ACTIVE" | "ARCHIVED")}
                            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                          >
                            <option value="ACTIVE">Active</option>
                            <option value="ARCHIVED">Archived</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-2 text-sm text-[#1F2420]">
                          <input
                            type="checkbox"
                            checked={editFeatured}
                            onChange={(e) => setEditFeatured(e.target.checked)}
                          />
                          Featured
                        </label>
                        <label className="flex items-center gap-2 text-sm text-[#1F2420]">
                          <input
                            type="checkbox"
                            checked={editActive}
                            onChange={(e) => setEditActive(e.target.checked)}
                          />
                          Legacy public flag (isActive)
                        </label>
                        <button
                          type="submit"
                          disabled={savingDetail}
                          className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                        >
                          {savingDetail ? "Saving…" : "Save changes"}
                        </button>
                      </form>
                    ) : (
                      <p className="text-xs text-[#7A6A58]">You can view this asset; editing requires gallery.manage.</p>
                    )}

                    <div className="rounded-xl border border-[#e4d8c4] bg-[#FFFCF6]/60 p-4">
                      <div className="flex items-center gap-2 text-[#1F2420]">
                        <Link2 className="h-4 w-4 text-[#b9974a]" aria-hidden />
                        <h3 className="text-sm font-semibold">Where this image is used</h3>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[#7A6A58]">
                        Current links below. Use{" "}
                        <span className="font-medium text-[#5f6c61]">Attach to…</span> to connect this file to the
                        public site or a service cover.
                      </p>

                      {canManage ? (
                        <div className="mt-4 space-y-3 rounded-xl border border-[#dcc9a5]/70 bg-white/90 p-3 shadow-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7A6A58]">
                            Attach to…
                          </p>
                          <label className="block text-xs font-medium text-[#1F2420]">
                            Destination
                            <select
                              value={attachDestination}
                              onChange={(e) => setAttachDestination(e.target.value)}
                              className="mt-1 w-full cursor-pointer rounded-lg border border-border bg-white px-3 py-2 text-sm"
                            >
                              <option value="">Choose destination…</option>
                              {canManageServices ? (
                                <option value="SERVICE_IMAGE">Service — cover image</option>
                              ) : null}
                              <option value="HOMEPAGE_HERO">Homepage — hero image</option>
                              <option value="HOMEPAGE_GALLERY">Homepage — public gallery strip</option>
                              <option value="HOMEPAGE_SECTION">Homepage — section (by key)</option>
                              <option value="ABOUT_STORY">About page — story column image</option>
                              <option value="ABOUT_PHILOSOPHY">About page — philosophy column image</option>
                              <option value="VISIT_US_SECTION">Website — Visit us (usage only)</option>
                            </select>
                          </label>
                          {!canManageServices ? (
                            <p className="text-[11px] text-[#7A6A58]">
                              Service covers require{" "}
                              <Link href="/dashboard/services" className="font-medium text-[#1a3d28] underline">
                                Services
                              </Link>{" "}
                              permission (services.manage).
                            </p>
                          ) : null}

                          {attachDestination === "SERVICE_IMAGE" && canManageServices ? (
                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-[#1F2420]">
                                Service
                                <select
                                  value={attachServiceId}
                                  onChange={(e) => setAttachServiceId(e.target.value)}
                                  className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                                >
                                  <option value="">
                                    {servicesAttachLoading ? "Loading services…" : "Select a service…"}
                                  </option>
                                  {servicesForAttach.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex items-center gap-2 text-xs text-[#1F2420]">
                                <input
                                  type="checkbox"
                                  checked={attachSyncAlt}
                                  onChange={(e) => setAttachSyncAlt(e.target.checked)}
                                />
                                Apply gallery alt text to the service
                              </label>
                            </div>
                          ) : null}

                          {attachDestination === "HOMEPAGE_SECTION" ? (
                            <label className="block text-xs font-medium text-[#1F2420]">
                              Section key
                              <input
                                value={attachSectionKey}
                                onChange={(e) => setAttachSectionKey(e.target.value)}
                                placeholder="e.g. experience"
                                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                              />
                              <span className="mt-1 block text-[11px] font-normal text-[#7A6A58]">
                                Saved as <code className="rounded bg-[#f3ebdd] px-1">homeHero.{"{key}"}ImageUrl</code>{" "}
                                (example: key <code className="rounded bg-[#f3ebdd] px-1">experience</code> →{" "}
                                <code className="rounded bg-[#f3ebdd] px-1">experienceImageUrl</code> on the public
                                homepage).
                              </span>
                            </label>
                          ) : null}

                          {attachDestination === "HOMEPAGE_HERO" ? (
                            <p className="text-[11px] text-[#7A6A58]">
                              Replaces the current homepage hero image in site settings (and updates{" "}
                              <code className="rounded bg-[#f3ebdd] px-1">heroImageUrl</code>).
                            </p>
                          ) : null}
                          {attachDestination === "HOMEPAGE_GALLERY" ? (
                            <p className="text-[11px] text-[#7A6A58]">
                              Adds this image to the homepage gallery usage set (public site).
                            </p>
                          ) : null}
                          {attachDestination === "ABOUT_STORY" || attachDestination === "ABOUT_PHILOSOPHY" ? (
                            <p className="text-[11px] text-[#7A6A58]">
                              Updates <code className="rounded bg-[#f3ebdd] px-1">aboutSection.storyImageUrl</code> or{" "}
                              <code className="rounded bg-[#f3ebdd] px-1">philosophyImageUrl</code> for the public{" "}
                              <Link href="/about" className="text-[#1a3d28] underline">
                                About
                              </Link>{" "}
                              page (CMS overrides brand files there).
                            </p>
                          ) : null}
                          {attachDestination === "VISIT_US_SECTION" ? (
                            <p className="text-[11px] text-[#7A6A58]">
                              Records a media usage for Visit us; the contact page layout does not show a hero image
                              yet.
                            </p>
                          ) : null}

                          <button
                            type="button"
                            disabled={
                              attachSubmitting ||
                              !attachDestination ||
                              (attachDestination === "SERVICE_IMAGE" &&
                                (!canManageServices || !attachServiceId || servicesAttachLoading))
                            }
                            onClick={() => void onAttachToDestination()}
                            className="w-full rounded-lg bg-[#1a3d28] py-2.5 text-sm font-semibold text-[#f9f2e5] transition hover:bg-[#234d32] disabled:opacity-45"
                          >
                            {attachSubmitting ? "Attaching…" : "Attach now"}
                          </button>
                        </div>
                      ) : null}

                      <div className="mt-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7A6A58]">
                          Active usages
                        </p>
                        {detail.usages.length === 0 ? (
                          <p className="mt-2 text-sm text-[#7A6A58]">Not attached anywhere yet.</p>
                        ) : (
                          <ul className="mt-2 space-y-2">
                            {detail.usages.map((u) => (
                              <li
                                key={u.id}
                                className="flex items-start justify-between gap-2 rounded-lg border border-border/80 bg-white/80 px-3 py-2 text-sm"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium text-[#1F2420]">{u.label}</p>
                                  <p className="text-xs text-[#7A6A58]">{u.usageType}</p>
                                  {u.routeHint ? (
                                    <Link
                                      href={u.routeHint}
                                      className="mt-0.5 inline-block text-[11px] font-medium text-[#1a3d28] underline"
                                    >
                                      Open in dashboard
                                    </Link>
                                  ) : null}
                                </div>
                                {canManage ? (
                                  <button
                                    type="button"
                                    onClick={() => void onDetachUsage(u.id)}
                                    className="shrink-0 text-xs font-medium text-danger hover:underline"
                                  >
                                    Detach
                                  </button>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    {canManage ? (
                      <button
                        type="button"
                        disabled={deleteBusy}
                        onClick={() => void onDeleteAsset()}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] py-2.5 text-sm font-medium text-danger hover:bg-[#fde8df] disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deleteBusy ? "Deleting…" : "Delete from library"}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-[#7A6A58]">Could not load this asset.</p>
                )}
                {detailError ? (
                  <p className="mt-4 rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-xs text-danger">
                    {detailError}
                  </p>
                ) : null}
              </div>
            </aside>
          </div>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
