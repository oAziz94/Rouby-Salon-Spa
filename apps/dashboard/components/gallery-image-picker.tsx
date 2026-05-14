"use client";

import {
  ApiClientError,
  getDashboardGallery,
  uploadDashboardGalleryAsset,
  type DashboardGalleryListItem,
} from "@rouby/api-client";
import { Loader2, Search, Upload } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";

type Props = {
  accessToken: string;
  open: boolean;
  onClose: () => void;
  onSelect: (asset: DashboardGalleryListItem) => void;
  title?: string;
};

function formatError(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}

export function GalleryImagePicker({
  accessToken,
  open,
  onClose,
  onSelect,
  title = "Choose from Gallery",
}: Props) {
  const dialogTitleId = useId();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DashboardGalleryListItem[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!open || !accessToken) return;
    setLoading(true);
    setError("");
    try {
      const res = await getDashboardGallery(accessToken, {
        page: 1,
        pageSize: 48,
        search: appliedSearch || undefined,
        libraryStatus: "ACTIVE",
      });
      setRows(res.data);
    } catch (err) {
      setError(formatError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, open, appliedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpload(file: File) {
    setUploading(true);
    setError("");
    try {
      const created = await uploadDashboardGalleryAsset(accessToken, file, {});
      onSelect(created);
      onClose();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-[#2A1722]/50 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        className="relative flex max-h-[min(90dvh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-border/80 bg-gradient-to-r from-card to-[#FFFCF6] px-5 py-4">
          <h2 id={dialogTitleId} className="text-lg font-semibold text-[#1F2420]">
            {title}
          </h2>
          <p className="mt-1 text-xs text-[#7A6A58]">
            Pick an image from the media library or upload a new one (saved to Gallery automatically).
          </p>
        </header>

        <div className="shrink-0 space-y-3 border-b border-border/60 bg-[#FFFCF6]/50 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7A6A58]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setAppliedSearch(search.trim());
                  }
                }}
                placeholder="Search by title or description…"
                className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm outline-none ring-accent/25 focus:ring-2"
              />
            </div>
            <button
              type="button"
              onClick={() => setAppliedSearch(search.trim())}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Search
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-[#1F2420] shadow-sm hover:bg-[#FFF9EE]">
              <Upload className="h-4 w-4 text-accent" />
              {uploading ? "Uploading…" : "Upload new"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onUpload(f);
                }}
              />
            </label>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-[#1F2420]"
            >
              Cancel
            </button>
          </div>
          {error ? (
            <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-xs text-danger">{error}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[#7A6A58]">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading images…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-[#7A6A58]">No images match your search.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {rows.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(asset);
                      onClose();
                    }}
                    className="group w-full overflow-hidden rounded-xl border border-border/80 bg-white text-left shadow-sm transition hover:border-accent/40 hover:shadow-md"
                  >
                    <div className="relative aspect-square bg-[#FFFCF6]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.url}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:opacity-95"
                      />
                    </div>
                    <div className="space-y-0.5 p-2">
                      <p className="truncate text-xs font-semibold text-[#1F2420]">
                        {asset.title?.trim() || asset.originalName || "Image"}
                      </p>
                      {!asset.usageSummary.hasAltText ? (
                        <p className="text-[10px] font-medium text-amber-800">Missing alt text</p>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
