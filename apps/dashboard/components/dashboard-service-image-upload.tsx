"use client";

import { uploadDashboardGalleryAsset } from "@rouby/api-client";
import { ImageIcon, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

export type DashboardServiceImageValue = {
  imageUrl: string;
  imageKey: string;
  /** When set, the service image is linked to this Gallery item (preferred over raw URL/key). */
  imageMediaId?: string | null;
};

type DashboardServiceImageUploadProps = {
  accessToken: string;
  disabled?: boolean;
  value: DashboardServiceImageValue | null;
  /** Shown when `value` is empty (e.g. legacy rows with only imageUrl in DB). */
  fallbackImageUrl?: string | null;
  onChange: (next: DashboardServiceImageValue | null) => void;
  /** Called with user-facing error message */
  onError?: (message: string) => void;
  /** Fires when an upload starts / finishes (success or failure). */
  onUploadingChange?: (uploading: boolean) => void;
  /** Hide the top "Service image" label row (when the parent section already has a title). */
  hideOuterLabel?: boolean;
  /** Opens the parent-controlled gallery picker (requires `gallery.read`). */
  onPickFromGallery?: () => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DashboardServiceImageUpload({
  accessToken,
  disabled,
  value,
  fallbackImageUrl,
  onChange,
  onError,
  onUploadingChange,
  hideOuterLabel,
  onPickFromGallery,
}: DashboardServiceImageUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const displaySrc = value?.imageUrl ?? localPreview ?? fallbackImageUrl ?? null;
  const isLegacyFallback = Boolean(!value && fallbackImageUrl);

  useEffect(() => {
    return () => {
      if (localPreview) {
        URL.revokeObjectURL(localPreview);
      }
    };
  }, [localPreview]);

  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  const report = useCallback(
    (message: string) => {
      setUploadError(message);
      onError?.(message);
    },
    [onError],
  );

  const runUpload = useCallback(
    async (file: File) => {
      setUploadError(null);
      if (!file.size) {
        report("Please choose a non-empty image file.");
        return;
      }
      if (file.size > MAX_BYTES) {
        report(`Image is too large (max ${formatBytes(MAX_BYTES)}).`);
        return;
      }
      const okType = ACCEPT.split(",").some((t) => file.type === t.trim());
      if (!okType) {
        report("Please use JPG, PNG, or WebP.");
        return;
      }
      setLocalPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setUploading(true);
      try {
        const result = await uploadDashboardGalleryAsset(accessToken, file, {});
        const key = result.storageKey ?? "";
        onChange({
          imageUrl: result.url || result.imageUrl,
          imageKey: key,
          imageMediaId: result.id,
        });
        setLocalPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      } catch (e) {
        setLocalPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        const msg = e instanceof Error ? e.message : "Upload failed. Please try again.";
        report(msg);
      } finally {
        setUploading(false);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    },
    [accessToken, onChange, report],
  );

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void runUpload(file);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (disabled || uploading) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void runUpload(file);
  };

  const remove = () => {
    setLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    onChange(null);
    setUploadError(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const browse = () => {
    if (!disabled && !uploading) inputRef.current?.click();
  };

  return (
    <div className="space-y-3">
      {!hideOuterLabel ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-[#1F2420]">Service image</span>
        </div>
      ) : null}
      <p className="text-xs leading-relaxed text-[#7A6A58]">
        JPG, PNG, or WebP — max {formatBytes(MAX_BYTES)}. Files are stored in the central Gallery
        media library.
      </p>
      {onPickFromGallery ? (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={(e) => {
            e.stopPropagation();
            onPickFromGallery();
          }}
          className="w-full rounded-lg border border-border bg-white py-2.5 text-sm font-medium text-[#1F2420] shadow-sm transition hover:bg-[#FFF9EE] disabled:opacity-50"
        >
          Choose from Gallery
        </button>
      ) : null}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled || uploading}
        onChange={onInputChange}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload service image"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            browse();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={onDrop}
        onClick={browse}
        className={`relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/90 bg-gradient-to-b from-[#FFFCF6] to-[#FFF9EE] px-4 py-8 text-center shadow-inner transition-all hover:border-accent/40 hover:shadow-sm ${
          disabled || uploading ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3 text-sm text-[#7A6A58]">
            <Loader2 className="h-10 w-10 animate-spin text-accent" aria-hidden />
            <span className="font-medium text-[#1F2420]">Uploading…</span>
            <span className="text-xs">Keep this window open until the upload finishes.</span>
          </div>
        ) : displaySrc ? (
          <div className="relative w-full max-w-lg px-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displaySrc}
              alt=""
              className="mx-auto max-h-56 w-auto rounded-lg object-contain shadow-md ring-1 ring-black/5"
              onError={() => report("Preview could not be loaded.")}
            />
            {isLegacyFallback ? (
              <p className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
                This service still uses an older image link. Upload a new file so the image is
                stored securely for online booking.
              </p>
            ) : (
              <p className="mt-3 text-xs text-[#7A6A58]">Drop a new file here, or use Replace below.</p>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={(e) => {
                  e.stopPropagation();
                  browse();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-[#1F2420] shadow-sm transition hover:bg-[#FFF9EE] disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Replace image
              </button>
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={(e) => {
                  e.stopPropagation();
                  remove();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7B9A4]/60 bg-white px-3 py-2 text-xs font-medium text-danger shadow-sm transition hover:bg-[#FFF1EC] disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="flex max-w-md flex-col items-center gap-3 text-[#7A6A58]">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-border/60">
              <Upload className="h-7 w-7 text-accent" aria-hidden />
            </div>
            <p className="text-base font-semibold text-[#1F2420]">Upload from device</p>
            <p className="text-sm">Drag and drop an image here, or click to browse your files.</p>
          </div>
        )}
      </div>
      {!displaySrc && !uploading ? (
        <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-white/80 px-3 py-2.5 text-xs text-[#7A6A58]">
          <ImageIcon className="h-4 w-4 shrink-0 text-accent/80" aria-hidden />
          <span>No image yet. Add one if this service should appear in online booking.</span>
        </div>
      ) : null}
      {uploadError ? (
        <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-xs text-danger">
          {uploadError}
        </p>
      ) : null}
    </div>
  );
}
