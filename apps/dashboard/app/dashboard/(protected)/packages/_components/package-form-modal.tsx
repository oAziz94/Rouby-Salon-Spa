"use client";

import {
  ApiClientError,
  patchDashboardPackage,
  postDashboardPackage,
  type DashboardBranch,
  type DashboardPackage,
  type DashboardService,
} from "@rouby/api-client";
import { useEffect, useMemo, useState } from "react";
import {
  formatDurationMinutes,
  formatEGP,
  serviceByIdMap,
} from "./package-utils";

type FeatureFormRow = { key: string; label: string; isActive: boolean };

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

type PackageFormModalProps = {
  open: boolean;
  onClose: () => void;
  accessToken: string;
  editing: DashboardPackage | null;
  allServices: DashboardService[];
  branches: DashboardBranch[];
  categoryById: Map<string, string>;
  onSaved: () => void;
  onToast: (message: string, tone: "success" | "error") => void;
};

function sumSelectedPricing(
  ids: string[],
  map: Map<string, DashboardService>,
): { price: number; duration: number } {
  let price = 0;
  let duration = 0;
  for (const id of ids) {
    const s = map.get(id);
    if (s?.basePrice != null) price += s.basePrice;
    if (s?.durationMinutes != null) duration += s.durationMinutes;
  }
  return { price, duration };
}

export function PackageFormModal({
  open,
  onClose,
  accessToken,
  editing,
  allServices,
  branches,
  categoryById,
  onSaved,
  onToast,
}: PackageFormModalProps) {
  const svcMap = useMemo(() => serviceByIdMap(allServices), [allServices]);

  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [badgeLabel, setBadgeLabel] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [originalPrice, setOriginalPrice] = useState("");
  const [packagePrice, setPackagePrice] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [useCalculatedOriginal, setUseCalculatedOriginal] = useState(true);
  const [useCalculatedDuration, setUseCalculatedDuration] = useState(true);
  const [features, setFeatures] = useState<FeatureFormRow[]>([]);
  const [serviceQuery, setServiceQuery] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setShortDescription(editing.shortDescription ?? "");
      setDescription(editing.description ?? "");
      setBadgeLabel(editing.badgeLabel ?? "");
      setIsFeatured(editing.isFeatured);
      setIsActive(editing.isActive);
      setSelectedServiceIds([...editing.serviceIds]);
      setSelectedBranchIds([...editing.branchIds]);
      setOriginalPrice(editing.originalPrice.toString());
      setPackagePrice(editing.packagePrice.toString());
      setDurationMinutes(editing.durationMinutes != null ? String(editing.durationMinutes) : "");
      setUseCalculatedOriginal(false);
      setUseCalculatedDuration(false);
      setFeatures(
        (editing.features ?? []).map((f) => ({
          key: f.id,
          label: f.label,
          isActive: f.isActive,
        })),
      );
    } else {
      setName("");
      setShortDescription("");
      setDescription("");
      setBadgeLabel("");
      setIsFeatured(false);
      setIsActive(true);
      setSelectedServiceIds([]);
      setSelectedBranchIds([]);
      setOriginalPrice("0");
      setPackagePrice("");
      setDurationMinutes("");
      setUseCalculatedOriginal(true);
      setUseCalculatedDuration(true);
      setFeatures([]);
    }
    setServiceQuery("");
    setSaveError("");
  }, [open, editing]);

  const computed = useMemo(
    () => sumSelectedPricing(selectedServiceIds, svcMap),
    [selectedServiceIds, svcMap],
  );

  useEffect(() => {
    if (!open || !useCalculatedOriginal) return;
    setOriginalPrice(computed.price.toFixed(2));
  }, [open, useCalculatedOriginal, computed.price]);

  useEffect(() => {
    if (!open || !useCalculatedDuration) return;
    setDurationMinutes(computed.duration > 0 ? String(computed.duration) : "");
  }, [open, useCalculatedDuration, computed.duration]);

  const origNum = Number(originalPrice);
  const pkgNum = Number(packagePrice);
  const durNum = durationMinutes.trim() === "" ? null : Number(durationMinutes);
  const savings = Number.isFinite(origNum) && Number.isFinite(pkgNum) ? Math.max(0, origNum - pkgNum) : 0;
  const savingsPct =
    origNum > 0 && Number.isFinite(origNum) && Number.isFinite(pkgNum)
      ? Math.round(((origNum - pkgNum) / origNum) * 1000) / 10
      : null;

  const priceWarning = Number.isFinite(origNum) && Number.isFinite(pkgNum) && pkgNum >= origNum && origNum > 0;

  function addFeatureRow() {
    const key =
      typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
        ? globalThis.crypto.randomUUID()
        : `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setFeatures((prev) => [...prev, { key, label: "", isActive: true }]);
  }

  function removeFeatureRow(key: string) {
    setFeatures((prev) => prev.filter((r) => r.key !== key));
  }

  function moveFeatureRow(key: string, direction: -1 | 1) {
    setFeatures((prev) => {
      const i = prev.findIndex((r) => r.key === key);
      if (i < 0) return prev;
      const j = i + direction;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  function toggleBranch(id: string) {
    setSelectedBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function addService(id: string) {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setServiceQuery("");
  }

  function removeService(id: string) {
    setSelectedServiceIds((prev) => prev.filter((x) => x !== id));
  }

  function moveService(id: string, dir: -1 | 1) {
    setSelectedServiceIds((prev) => {
      const i = prev.indexOf(id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  const displayedPickServices = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    const pool = allServices.filter((s) => !selectedServiceIds.includes(s.id));
    if (!q) return pool.slice(0, 15);
    return pool
      .filter((s) => {
        const cat = s.categoryId ? categoryById.get(s.categoryId) ?? "" : "";
        return `${s.name} ${cat}`.toLowerCase().includes(q);
      })
      .slice(0, 40);
  }, [allServices, serviceQuery, selectedServiceIds, categoryById]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    setSaving(true);
    try {
      const featurePayload = features
        .map((f) => ({ label: f.label.trim(), isActive: f.isActive }))
        .filter((f) => f.label.length > 0)
        .map((f, i) => ({ label: f.label, displayOrder: i, isActive: f.isActive }));

      const payload: Record<string, unknown> = {
        name: name.trim(),
        originalPrice: origNum,
        packagePrice: pkgNum,
        durationMinutes: durNum === null || Number.isNaN(durNum) ? null : durNum,
        serviceIds: selectedServiceIds,
        branchIds: selectedBranchIds,
        shortDescription: shortDescription.trim() === "" ? null : shortDescription.trim(),
        description: description.trim() === "" ? null : description.trim(),
        badgeLabel: badgeLabel.trim() === "" ? null : badgeLabel.trim(),
        isFeatured,
        isActive,
      };
      if (editing) {
        payload.features = featurePayload;
        await patchDashboardPackage(accessToken, editing.id, payload);
        onToast("Package updated.", "success");
      } else {
        if (featurePayload.length > 0) payload.features = featurePayload;
        await postDashboardPackage(accessToken, payload);
        onToast("Package created.", "success");
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = formatApiError(err);
      setSaveError(msg);
      onToast(msg, "error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const onlineHint =
    isActive &&
    (selectedServiceIds.length === 0 ||
      selectedBranchIds.length === 0 ||
      !Number.isFinite(pkgNum) ||
      pkgNum <= 0 ||
      durNum == null ||
      durNum < 1);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center overflow-hidden bg-[#2A1722]/45 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        className="relative flex max-h-[100dvh] w-full max-w-[960px] flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pkg-modal-title"
      >
        <div className="shrink-0 border-b border-border bg-gradient-to-r from-[#FFFCF6] to-card px-5 py-4 sm:px-6">
          <h2 id="pkg-modal-title" className="text-lg font-semibold text-[#1F2420]">
            {editing ? "Edit package" : "New package"}
          </h2>
          <p className="mt-1 text-sm text-[#7A6A58]">
            Bundle services, set package pricing, and choose where this offer is available.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 space-y-8">
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-[#1F2420]">Basic information</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">Package name *</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full rounded-lg border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">Short description</span>
                  <textarea
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">Full description</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Badge label</span>
                  <input
                    value={badgeLabel}
                    onChange={(e) => setBadgeLabel(e.target.value)}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2"
                    placeholder="Optional"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm pt-6">
                  <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
                  <span className="font-medium text-[#1F2420]">Featured package</span>
                </label>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#1F2420]">Included services</h3>
                <p className="text-xs text-[#7A6A58]">Search by name — order controls how lines appear.</p>
              </div>
              <div className="rounded-xl border border-border bg-white p-3">
                <input
                  value={serviceQuery}
                  onChange={(e) => setServiceQuery(e.target.value)}
                  placeholder="Search services to add…"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                />
                <p className="mt-1 text-xs text-[#7A6A58]">
                  {serviceQuery.trim() ? "Results" : "Popular picks"} — press Add to include.
                </p>
                <ul className="mt-2 max-h-44 overflow-y-auto divide-y divide-border/60 text-sm">
                  {displayedPickServices.length === 0 ? (
                    <li className="py-2 text-[#7A6A58]">No services to show.</li>
                  ) : (
                    displayedPickServices.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[#1F2420]">{s.name}</p>
                          <p className="truncate text-xs text-[#7A6A58]">
                            {s.categoryId ? categoryById.get(s.categoryId) ?? "Category" : "—"} ·{" "}
                            {formatEGP(s.basePrice)} · {formatDurationMinutes(s.durationMinutes)} ·{" "}
                            {s.isActive ? "Active" : "Inactive"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => addService(s.id)}
                          className="shrink-0 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                        >
                          Add
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              {selectedServiceIds.length === 0 ? (
                <p className="text-sm text-amber-800">No services selected yet.</p>
              ) : (
                <ul className="space-y-2">
                  {selectedServiceIds.map((id, index) => {
                    const s = svcMap.get(id);
                    return (
                      <li
                        key={id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-[#FFFCF6] px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-[#1F2420]">{s?.name ?? "Service"}</span>
                        <span className="text-xs text-[#7A6A58]">
                          {s ? `${s.isActive ? "Active" : "Inactive"} · ` : ""}
                          {formatEGP(s?.basePrice ?? null)} · {formatDurationMinutes(s?.durationMinutes ?? null)}
                        </span>
                        <span className="ml-auto flex gap-1">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveService(id, -1)}
                            className="rounded border border-border bg-white px-2 py-0.5 text-xs disabled:opacity-40"
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            disabled={index === selectedServiceIds.length - 1}
                            onClick={() => moveService(id, 1)}
                            className="rounded border border-border bg-white px-2 py-0.5 text-xs disabled:opacity-40"
                          >
                            Down
                          </button>
                          <button
                            type="button"
                            onClick={() => removeService(id)}
                            className="rounded border border-border bg-white px-2 py-0.5 text-xs text-red-700"
                          >
                            Remove
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3 text-sm">
                <p className="font-medium text-emerald-950">Running totals</p>
                <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                  <div className="flex justify-between gap-2 text-emerald-900/90">
                    <dt>Original (from services)</dt>
                    <dd className="font-semibold">{formatEGP(computed.price)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 text-emerald-900/90">
                    <dt>Duration (from services)</dt>
                    <dd className="font-semibold">{formatDurationMinutes(computed.duration || null)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:col-span-2">
                    <dt className="text-[#5C534A]">Savings vs original field</dt>
                    <dd className="font-medium text-emerald-800">
                      {formatEGP(savings)}
                      {savingsPct != null ? ` (${savingsPct}%)` : ""}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[#1F2420]">Pricing & duration</h3>
              <label className="flex items-center gap-2 text-xs text-[#5C534A]">
                <input
                  type="checkbox"
                  checked={useCalculatedOriginal}
                  onChange={(e) => {
                    setUseCalculatedOriginal(e.target.checked);
                    if (e.target.checked) setOriginalPrice(computed.price.toFixed(2));
                  }}
                />
                Keep original price in sync with selected services
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Original price</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={originalPrice}
                    onChange={(e) => {
                      setUseCalculatedOriginal(false);
                      setOriginalPrice(e.target.value);
                    }}
                    required
                    className="w-full rounded-lg border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Package price *</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={packagePrice}
                    onChange={(e) => setPackagePrice(e.target.value)}
                    required
                    className="w-full rounded-lg border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Duration (minutes)</span>
                  <input
                    type="number"
                    min={0}
                    value={durationMinutes}
                    onChange={(e) => {
                      setUseCalculatedDuration(false);
                      setDurationMinutes(e.target.value);
                    }}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-[#5C534A]">
                <input
                  type="checkbox"
                  checked={useCalculatedDuration}
                  onChange={(e) => {
                    setUseCalculatedDuration(e.target.checked);
                    if (e.target.checked) setDurationMinutes(computed.duration > 0 ? String(computed.duration) : "");
                  }}
                />
                Keep duration in sync with selected services
              </label>
              {priceWarning ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Package price is not lower than the original price.
                </p>
              ) : null}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[#1F2420]">Branch availability</h3>
              {branches.length === 0 ? (
                <p className="text-sm text-[#7A6A58]">No branches available.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {branches.map((b) => {
                    const on = selectedBranchIds.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleBranch(b.id)}
                        className={`flex flex-col rounded-xl border px-3 py-3 text-left text-sm transition ${
                          on
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border bg-white hover:border-primary/40"
                        }`}
                      >
                        <span className="font-medium text-[#1F2420]">{b.name}</span>
                        {b.address ? <span className="mt-1 text-xs text-[#7A6A58]">{b.address}</span> : null}
                        <span className="mt-2 text-xs text-[#A89480]">{b.isActive === false ? "Inactive branch" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedBranchIds.length === 0 ? (
                <p className="text-sm text-amber-800">No branch selected.</p>
              ) : null}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[#1F2420]">Visibility</h3>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span>Active (staff can use in-house flows)</span>
              </label>
              <p className="text-xs text-[#7A6A58]">
                Public catalog visibility follows business rules (services, branches, price, duration, dates) — no
                package image is required.
              </p>
              {onlineHint ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  To appear on the public catalog, ensure at least one service, one branch, package price, duration,
                  and stay active within the configured date range.
                </p>
              ) : null}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#1F2420]">Marketing highlights</h3>
                <button type="button" onClick={addFeatureRow} className="text-xs font-medium text-primary">
                  + Add line
                </button>
              </div>
              <p className="text-xs text-[#7A6A58]">Short bullet lines for the website (optional).</p>
              {features.length === 0 ? null : (
                <ul className="space-y-2">
                  {features.map((row, index) => (
                    <li key={row.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-white p-2">
                      <input
                        value={row.label}
                        onChange={(e) =>
                          setFeatures((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)),
                          )
                        }
                        placeholder="Highlight text"
                        className="min-w-[10rem] flex-1 rounded border border-border px-2 py-1 text-sm"
                      />
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={row.isActive}
                          onChange={(e) =>
                            setFeatures((prev) =>
                              prev.map((r) => (r.key === row.key ? { ...r, isActive: e.target.checked } : r)),
                            )
                          }
                        />
                        On
                      </label>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveFeatureRow(row.key, -1)}
                        className="rounded border px-2 py-0.5 text-xs disabled:opacity-40"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        disabled={index === features.length - 1}
                        onClick={() => moveFeatureRow(row.key, 1)}
                        className="rounded border px-2 py-0.5 text-xs disabled:opacity-40"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFeatureRow(row.key)}
                        className="rounded border px-2 py-0.5 text-xs text-red-700"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {saveError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{saveError}</p>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-border bg-card px-5 py-3 sm:px-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || selectedBranchIds.length === 0 || selectedServiceIds.length === 0}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save package"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
