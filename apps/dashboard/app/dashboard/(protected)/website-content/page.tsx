"use client";

import {
  ApiClientError,
  getDashboardWebsiteContentSection,
  listDashboardWebsiteContent,
  reorderDashboardWebsiteContent,
  seedDashboardWebsiteContentDefaults,
  updateDashboardWebsiteContentSection,
  type DashboardWebsiteContentListResponse,
  type DashboardWebsiteContentSection,
} from "@rouby/api-client";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Pencil,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { GalleryImagePicker } from "@/components/gallery-image-picker";
import { useDashboardAuth } from "@/lib/dashboard-auth";

const PUBLIC_SITE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_PUBLIC_WEBSITE_URL?.replace(/\/$/, "")) ||
  "http://localhost:3000";

const PAGE_LABEL: Record<string, string> = {
  homepage: "Homepage",
  about: "About",
  contact: "Contact",
  global: "Global",
};

function formatError(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}

function sectionDisplayName(row: DashboardWebsiteContentSection): string {
  return row.title?.trim() || row.key.replace(/\./g, " · ");
}

function SectionEditorFields({
  draft,
  setDraft,
  sectionType,
}: {
  draft: Record<string, unknown>;
  setDraft: (next: Record<string, unknown>) => void;
  sectionType: string;
}) {
  const set = (k: string, v: string) => setDraft({ ...draft, [k]: v });

  const showImages = sectionType === "hero" || sectionType === "textImage";
  const showSecondary = sectionType === "textImage";
  const showCta = ["hero", "textImage", "cta"].includes(sectionType);
  const showSecondaryCta = sectionType === "cta" || sectionType === "hero";
  const showBody = ["textImage", "richText", "contactBlock"].includes(sectionType);
  const showContentJson = sectionType === "featureList" || sectionType === "contactBlock";

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Eyebrow</label>
        <input
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          value={String(draft.eyebrow ?? "")}
          onChange={(e) => set("eyebrow", e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Title</label>
        <input
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          value={String(draft.title ?? "")}
          onChange={(e) => set("title", e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Subtitle</label>
        <input
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          value={String(draft.subtitle ?? "")}
          onChange={(e) => set("subtitle", e.target.value)}
        />
      </div>
      {showBody ? (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Body</label>
          <textarea
            className="mt-1 min-h-[120px] w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            value={String(draft.body ?? "")}
            onChange={(e) => set("body", e.target.value)}
          />
        </div>
      ) : null}
      {showCta ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                CTA label
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                value={String(draft.ctaLabel ?? "")}
                onChange={(e) => set("ctaLabel", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                CTA link
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                value={String(draft.ctaHref ?? "")}
                onChange={(e) => set("ctaHref", e.target.value)}
                placeholder="/booking"
              />
            </div>
          </div>
        </>
      ) : null}
      {showSecondaryCta ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
              Secondary CTA label
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              value={String(draft.secondaryCtaLabel ?? "")}
              onChange={(e) => set("secondaryCtaLabel", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
              Secondary CTA link
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              value={String(draft.secondaryCtaHref ?? "")}
              onChange={(e) => set("secondaryCtaHref", e.target.value)}
            />
          </div>
        </div>
      ) : null}
      {showContentJson ? (
        <details className="rounded-lg border border-border/80 bg-[#FFFCF6] p-3">
          <summary className="cursor-pointer text-sm font-medium text-[#1F2420]">Advanced — content JSON</summary>
          <textarea
            className="mt-2 min-h-[160px] w-full rounded border border-border bg-white px-2 py-2 font-mono text-xs"
            value={String(draft.contentJson ?? "")}
            onChange={(e) => set("contentJson", e.target.value)}
          />
        </details>
      ) : null}
      {showImages ? (
        <p className="text-xs text-[#7A6A58]">
          {showSecondary
            ? "Primary image is the main visual; secondary is optional (e.g. split layout)."
            : "Hero image is shown large on the public homepage."}
        </p>
      ) : null}
    </div>
  );
}

export default function WebsiteContentPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canRead = hasPermission("websiteContent.read");
  const canUpdate = hasPermission("websiteContent.update");
  const canReorder = hasPermission("websiteContent.reorder");

  const [data, setData] = useState<DashboardWebsiteContentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<string>("homepage");
  const [search, setSearch] = useState("");
  const [visFilter, setVisFilter] = useState<"all" | "visible" | "hidden">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DashboardWebsiteContentSection | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<"primary" | "secondary" | null>(null);

  const load = useCallback(async () => {
    if (!token || !canRead) return;
    setLoading(true);
    setError("");
    try {
      const res = await listDashboardWebsiteContent(token, {});
      setData(res);
      const pageKeys = Object.keys(res.grouped).sort();
      setTab((prev) => (pageKeys.includes(prev) ? prev : pageKeys[0] ?? "homepage"));
    } catch (e) {
      setError(formatError(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = useMemo(() => (data ? Object.keys(data.grouped).sort() : []), [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const base = data.grouped[tab] ?? [];
    return base
      .filter((r) => {
        if (visFilter === "visible") return r.isVisible;
        if (visFilter === "hidden") return !r.isVisible;
        return true;
      })
      .filter((r) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          r.key.toLowerCase().includes(q) ||
          (r.title ?? "").toLowerCase().includes(q) ||
          (r.subtitle ?? "").toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }, [data, tab, search, visFilter]);

  function openEdit(row: DashboardWebsiteContentSection) {
    setEditing(row);
    setDraft({
      eyebrow: row.eyebrow ?? "",
      title: row.title ?? "",
      subtitle: row.subtitle ?? "",
      body: row.body ?? "",
      ctaLabel: row.ctaLabel ?? "",
      ctaHref: row.ctaHref ?? "",
      secondaryCtaLabel: row.secondaryCtaLabel ?? "",
      secondaryCtaHref: row.secondaryCtaHref ?? "",
      isVisible: row.isVisible,
      displayOrder: row.displayOrder,
      contentJson:
        row.content && typeof row.content === "object"
          ? JSON.stringify(row.content, null, 2)
          : "",
    });
    setDrawerOpen(true);
  }

  async function saveEdit() {
    if (!token || !editing) return;
    setSaving(true);
    setError("");
    try {
      let content: Record<string, unknown> | undefined;
      const raw = String(draft.contentJson ?? "").trim();
      if (raw.length > 0) {
        content = JSON.parse(raw) as Record<string, unknown>;
      }
      await updateDashboardWebsiteContentSection(token, editing.id, {
        eyebrow: String(draft.eyebrow ?? "") || null,
        title: String(draft.title ?? "") || null,
        subtitle: String(draft.subtitle ?? "") || null,
        body: String(draft.body ?? "") || null,
        ctaLabel: String(draft.ctaLabel ?? "") || null,
        ctaHref: String(draft.ctaHref ?? "") || null,
        secondaryCtaLabel: String(draft.secondaryCtaLabel ?? "") || null,
        secondaryCtaHref: String(draft.secondaryCtaHref ?? "") || null,
        isVisible: Boolean(draft.isVisible),
        displayOrder: Number(draft.displayOrder) || 0,
        ...(content !== undefined ? { content } : {}),
      });
      setDrawerOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisibility(row: DashboardWebsiteContentSection) {
    if (!token || !canUpdate) return;
    if (row.isRequired) return;
    setError("");
    try {
      await updateDashboardWebsiteContentSection(token, row.id, {
        isVisible: !row.isVisible,
      });
      await load();
    } catch (e) {
      setError(formatError(e));
    }
  }

  async function moveRow(row: DashboardWebsiteContentSection, dir: -1 | 1) {
    if (!token || !canReorder) return;
    const pageRows = (data?.grouped[row.page] ?? []).slice().sort((a, b) => a.displayOrder - b.displayOrder);
    const idx = pageRows.findIndex((r) => r.id === row.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= pageRows.length) return;
    const next = [...pageRows];
    const tmp = next[idx]!;
    next[idx] = next[swap]!;
    next[swap] = tmp;
    const items = next.map((r, i) => ({ id: r.id, displayOrder: i * 10 }));
    setError("");
    try {
      await reorderDashboardWebsiteContent(token, { items });
      await load();
    } catch (e) {
      setError(formatError(e));
    }
  }

  async function onPickGallery(slot: "primary" | "secondary", asset: { id: string }) {
    if (!token || !editing) return;
    setSaving(true);
    setError("");
    try {
      const payload =
        slot === "primary"
          ? { primaryGalleryItemId: asset.id }
          : { secondaryGalleryItemId: asset.id };
      await updateDashboardWebsiteContentSection(token, editing.id, payload);
      const fresh = await getDashboardWebsiteContentSection(token, editing.id);
      setEditing(fresh);
      setPicker(null);
      await load();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  }

  async function clearImage(slot: "primary" | "secondary") {
    if (!token || !editing) return;
    setSaving(true);
    setError("");
    try {
      await updateDashboardWebsiteContentSection(
        token,
        editing.id,
        slot === "primary" ? { primaryGalleryItemId: null } : { secondaryGalleryItemId: null },
      );
      const fresh = await getDashboardWebsiteContentSection(token, editing.id);
      setEditing(fresh);
      await load();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  }

  async function runSeed() {
    if (!token || !canUpdate) return;
    setSaving(true);
    setError("");
    try {
      await seedDashboardWebsiteContentDefaults(token);
      await load();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  }

  const stats = data?.stats;

  return (
    <PermissionGuard permission="websiteContent.read">
      <div className="min-h-screen bg-[#fdf8f1] px-4 py-8 text-[#1b3d29] sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="rounded-2xl border border-[#e8dbc4] bg-white p-6 shadow-[0_14px_30px_rgba(42,62,46,0.08)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="font-heading text-2xl text-primary sm:text-3xl">Website Content</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5f6c61]">
                  Manage public website sections, copy, CTAs, visibility, ordering, and images from the Gallery.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void load()}
                  className="inline-flex items-center gap-2 rounded-full border border-[#dcc9a5] bg-[#fffaf0] px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-[#f8efdd]"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
                <Link
                  href={`${PUBLIC_SITE}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95"
                >
                  <ExternalLink className="h-4 w-4" />
                  Preview website
                </Link>
              </div>
            </div>
          </div>

          {stats ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { label: "Total sections", value: stats.totalSections },
                { label: "Visible", value: stats.visibleSections },
                { label: "Hidden", value: stats.hiddenSections },
                { label: "Missing primary image", value: stats.sectionsMissingPrimaryImage },
                {
                  label: "Last updated",
                  value: stats.lastUpdatedAt ? new Date(stats.lastUpdatedAt).toLocaleString() : "—",
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border border-[#e8dbc4] bg-white px-4 py-3 shadow-sm"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#a4782f]">{card.label}</p>
                  <p className="mt-1 font-heading text-xl text-primary">{card.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#e8dbc4] bg-white py-16 text-[#5f6c61]">
              <Loader2 className="h-6 w-6 animate-spin" />
              Loading website sections…
            </div>
          ) : !data || pages.length === 0 ? (
            <div className="rounded-2xl border border-[#e8dbc4] bg-white p-10 text-center shadow-sm">
              <h2 className="font-heading text-xl text-primary">No website sections found</h2>
              <p className="mt-2 text-sm text-[#5f6c61]">
                Website content sections will appear here after defaults are seeded from the public website.
              </p>
              {canUpdate ? (
                <button
                  type="button"
                  onClick={() => void runSeed()}
                  disabled={saving}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Seed defaults
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-[#e8dbc4] pb-2">
                {pages.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTab(p)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      tab === p
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-white text-primary ring-1 ring-[#e8dbc4] hover:bg-[#fff9ef]"
                    }`}
                  >
                    {PAGE_LABEL[p] ?? p}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[12rem] flex-1">
                  <label className="text-xs font-semibold text-[#7A6A58]">Search</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Title or key…"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#7A6A58]">Visibility</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    value={visFilter}
                    onChange={(e) => setVisFilter(e.target.value as typeof visFilter)}
                  >
                    <option value="all">All</option>
                    <option value="visible">Visible</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="rounded-2xl border border-[#e8dbc4] bg-white p-8 text-center">
                  <h2 className="font-heading text-lg text-primary">No matching sections</h2>
                  <p className="mt-2 text-sm text-[#5f6c61]">Try changing filters or clearing the search.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {rows.map((row) => (
                    <article
                      key={row.id}
                      className="flex flex-col rounded-2xl border border-[#e8dbc4] bg-white p-5 shadow-[0_12px_28px_rgba(42,62,46,0.08)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-heading text-lg text-primary">{sectionDisplayName(row)}</h3>
                          <p className="mt-1 font-mono text-[10px] text-[#8a7a68]">{row.key}</p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <span className="rounded-full bg-[#f8efdd] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#a4782f]">
                            {row.page}
                          </span>
                          <span className="rounded-full bg-[#eef6f0] px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {row.sectionType}
                          </span>
                          {row.isVisible ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                              <Eye className="h-3 w-3" />
                              Visible
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                              <EyeOff className="h-3 w-3" />
                              Hidden
                            </span>
                          )}
                          {row.isRequired ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                              Required
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm text-[#5f6c61]">
                        {(row.subtitle ?? row.body ?? "").slice(0, 220)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {row.primaryImagePreviewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.primaryImagePreviewUrl}
                            alt=""
                            className="h-14 w-20 rounded-lg border border-[#e8dbc4] object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-20 items-center justify-center rounded-lg border border-dashed border-[#dcc9a5] text-[10px] text-[#8a7a68]">
                            No image
                          </div>
                        )}
                        <span className="self-center text-xs text-[#7A6A58]">Order {row.displayOrder}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {canUpdate ? (
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        ) : null}
                        {canUpdate && !row.isRequired ? (
                          <button
                            type="button"
                            onClick={() => void toggleVisibility(row)}
                            className="inline-flex items-center gap-1 rounded-full border border-[#dcc9a5] bg-[#fffaf0] px-3 py-1.5 text-xs font-semibold text-primary"
                          >
                            {row.isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            {row.isVisible ? "Hide" : "Show"}
                          </button>
                        ) : null}
                        {canReorder ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void moveRow(row, -1)}
                              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs font-medium"
                              aria-label="Move up"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void moveRow(row, 1)}
                              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs font-medium"
                              aria-label="Move down"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {drawerOpen && editing && token ? (
          <div className="fixed inset-0 z-[110] flex justify-end bg-black/40">
            <div className="flex h-full w-full max-w-lg flex-col bg-[#fdf8f1] shadow-2xl">
              <header className="border-b border-[#e8dbc4] px-5 py-4">
                <h2 className="font-heading text-lg text-primary">Edit section</h2>
                <p className="mt-1 text-xs text-[#7A6A58]">{sectionDisplayName(editing)}</p>
              </header>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <SectionEditorFields
                  draft={draft}
                  setDraft={setDraft}
                  sectionType={editing.sectionType}
                />
                <div className="mt-4 space-y-2">
                  <label className="text-xs font-semibold text-[#7A6A58]">Display order</label>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    value={Number(draft.displayOrder ?? 0)}
                    onChange={(e) => setDraft({ ...draft, displayOrder: Number(e.target.value) })}
                  />
                </div>
                {editing.isRequired ? null : (
                  <label className="mt-4 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.isVisible)}
                      onChange={(e) => setDraft({ ...draft, isVisible: e.target.checked })}
                    />
                    Visible on public website
                  </label>
                )}
                {editing.sectionType === "hero" || editing.sectionType === "textImage" ? (
                  <div className="mt-6 space-y-3 border-t border-[#e8dbc4] pt-4">
                    <p className="text-sm font-semibold text-primary">Images (Gallery)</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setPicker("primary")}
                        className="inline-flex items-center gap-2 rounded-full border border-[#dcc9a5] bg-white px-3 py-2 text-xs font-semibold"
                      >
                        <ImageIcon className="h-4 w-4" />
                        Primary
                      </button>
                      {editing.sectionType === "textImage" || editing.key === "homepage.hero" ? (
                        <button
                          type="button"
                          onClick={() => setPicker("secondary")}
                          className="inline-flex items-center gap-2 rounded-full border border-[#dcc9a5] bg-white px-3 py-2 text-xs font-semibold"
                        >
                          Secondary
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void clearImage("primary")}
                        className="text-xs text-red-700 underline"
                      >
                        Clear primary
                      </button>
                      {editing.sectionType === "textImage" || editing.key === "homepage.hero" ? (
                        <button
                          type="button"
                          onClick={() => void clearImage("secondary")}
                          className="text-xs text-red-700 underline"
                        >
                          Clear secondary
                        </button>
                      ) : null}
                    </div>
                    {editing.primaryImagePreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={editing.primaryImagePreviewUrl}
                        alt=""
                        className="mt-2 max-h-40 rounded-lg border object-contain"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
              <footer className="flex gap-2 border-t border-[#e8dbc4] px-5 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setEditing(null);
                  }}
                  className="flex-1 rounded-full border border-border py-2 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving || !canUpdate}
                  onClick={() => void saveEdit()}
                  className="flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </footer>
            </div>
            <button
              type="button"
              className="h-full flex-1 cursor-default"
              aria-label="Close"
              onClick={() => {
                setDrawerOpen(false);
                setEditing(null);
              }}
            />
            <GalleryImagePicker
              accessToken={token}
              open={picker !== null}
              onClose={() => setPicker(null)}
              title={picker === "secondary" ? "Choose secondary image" : "Choose primary image"}
              onSelect={(asset) => void onPickGallery(picker!, asset)}
            />
          </div>
        ) : null}
      </div>
    </PermissionGuard>
  );
}
