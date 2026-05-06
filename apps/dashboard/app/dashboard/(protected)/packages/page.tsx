"use client";

import {
  ApiClientError,
  getDashboardBranches,
  getDashboardPackages,
  getDashboardServices,
  patchDashboardPackage,
  patchDashboardPackageStatus,
  postDashboardPackage,
  type DashboardBranch,
  type DashboardPackage,
  type DashboardService,
} from "@rouby/api-client";
import { useEffect, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "empty" | "error";

type FeatureFormRow = { key: string; label: string; isActive: boolean };

function formatEGP(amount: number): string {
  return `EGP ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

export default function DashboardPackagesPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canManage = hasPermission("packages.manage");
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardPackage[]>([]);
  const [services, setServices] = useState<DashboardService[]>([]);
  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [isActiveFilter, setIsActiveFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DashboardPackage | null>(null);
  const [name, setName] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [packagePrice, setPackagePrice] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [serviceIdsCsv, setServiceIdsCsv] = useState("");
  const [branchIdsCsv, setBranchIdsCsv] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [badgeLabel, setBadgeLabel] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [features, setFeatures] = useState<FeatureFormRow[]>([]);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    if (!token) return;
    setState("loading");
    setError("");
    try {
      const [packagesResult, servicesResult, branchesResult] = await Promise.all([
        getDashboardPackages(token, {
          page,
          pageSize: 20,
          isActive: isActiveFilter === "" ? undefined : isActiveFilter === "true",
        }),
        getDashboardServices(token, { page: 1, pageSize: 100 }),
        getDashboardBranches(token).catch(() => []),
      ]);
      setRows(packagesResult.data);
      setServices(servicesResult.data);
      setBranches(branchesResult);
      setState(packagesResult.data.length ? "loaded" : "empty");
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, isActiveFilter]);

  function openCreateModal() {
    setEditingRow(null);
    setName("");
    setOriginalPrice("");
    setPackagePrice("");
    setDurationMinutes("");
    setServiceIdsCsv("");
    setBranchIdsCsv("");
    setShortDescription("");
    setBadgeLabel("");
    setIsFeatured(false);
    setFeatures([]);
    setSaveError("");
    setModalOpen(true);
  }

  function openEditModal(row: DashboardPackage) {
    setEditingRow(row);
    setName(row.name);
    setOriginalPrice(row.originalPrice.toString());
    setPackagePrice(row.packagePrice.toString());
    setDurationMinutes(row.durationMinutes != null ? String(row.durationMinutes) : "");
    setServiceIdsCsv(row.serviceIds.join(", "));
    setBranchIdsCsv(row.branchIds.join(", "));
    setShortDescription(row.shortDescription ?? "");
    setBadgeLabel(row.badgeLabel ?? "");
    setIsFeatured(row.isFeatured);
    setFeatures(
      (row.features ?? []).map((f) => ({
        key: f.id,
        label: f.label,
        isActive: f.isActive,
      })),
    );
    setSaveError("");
    setModalOpen(true);
  }

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

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setSaveError("");
    try {
      const featurePayload = features
        .map((f) => ({ label: f.label.trim(), isActive: f.isActive }))
        .filter((f) => f.label.length > 0)
        .map((f, i) => ({ label: f.label, displayOrder: i, isActive: f.isActive }));

      const payload: Record<string, unknown> = {
        name,
        originalPrice: Number(originalPrice),
        packagePrice: Number(packagePrice),
        durationMinutes: durationMinutes.trim() === "" ? null : Number(durationMinutes),
        serviceIds: serviceIdsCsv.split(",").map((v) => v.trim()).filter(Boolean),
        branchIds: branchIdsCsv.split(",").map((v) => v.trim()).filter(Boolean),
        shortDescription: shortDescription.trim() === "" ? null : shortDescription.trim(),
        badgeLabel: badgeLabel.trim() === "" ? null : badgeLabel.trim(),
        isFeatured,
      };
      if (editingRow) {
        payload.features = featurePayload;
      } else if (featurePayload.length > 0) {
        payload.features = featurePayload;
      }
      if (editingRow) await patchDashboardPackage(token, editingRow.id, payload);
      else await postDashboardPackage(token, payload);
      setModalOpen(false);
      await loadData();
    } catch (requestError) {
      setSaveError(formatApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function onToggleStatus(row: DashboardPackage) {
    if (!token) return;
    try {
      await patchDashboardPackageStatus(token, row.id, !row.isActive);
      await loadData();
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  return (
    <PermissionGuard permission="packages.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Packages</h1>
              <p className="mt-2 text-sm text-[#7A6A58]">Package catalog with service and branch availability.</p>
            </div>
            {canManage ? (
              <button type="button" onClick={openCreateModal} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                New package
              </button>
            ) : null}
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-[#1F2420]">Active state</span>
            <select value={isActiveFilter} onChange={(event) => setIsActiveFilter(event.target.value)} className="w-full max-w-xs rounded-md border border-border bg-white px-3 py-2">
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
        </section>

        {state === "loading" ? <p className="text-sm text-[#7A6A58]">Loading packages...</p> : null}
        {state === "error" ? <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] p-4 text-sm text-danger">{error}</p> : null}
        {state === "empty" ? <p className="rounded-lg border border-border bg-card p-4 text-sm text-[#7A6A58]">No packages found.</p> : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Original</th>
                    <th className="py-2 pr-3 font-medium">Package</th>
                    <th className="py-2 pr-3 font-medium">Duration</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 hover:bg-[#FFF9EE]">
                      <td className="py-3 pr-3 font-medium text-[#1F2420]">{row.name}</td>
                      <td className="py-3 pr-3 text-[#1F2420]">{formatEGP(row.originalPrice)}</td>
                      <td className="py-3 pr-3 text-[#1F2420]">{formatEGP(row.packagePrice)}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {row.durationMinutes != null ? `${row.durationMinutes} min` : "—"}
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.isActive ? "Active" : "Inactive"}</td>
                      <td className="py-3 pr-3">
                        {canManage ? (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => openEditModal(row)} className="rounded border border-border bg-white px-2 py-1 text-xs">Edit</button>
                            <button type="button" onClick={() => void onToggleStatus(row)} className="rounded border border-border bg-white px-2 py-1 text-xs">{row.isActive ? "Deactivate" : "Activate"}</button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <article key={row.id} className="rounded-lg border border-border bg-white p-4">
                  <p className="text-sm font-semibold text-[#1F2420]">{row.name}</p>
                  <p className="mt-1 text-xs text-[#7A6A58]">{formatEGP(row.packagePrice)}</p>
                  {canManage ? <button type="button" onClick={() => openEditModal(row)} className="mt-2 rounded border border-border bg-white px-2 py-1 text-xs">Edit</button> : null}
                </article>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-border bg-white px-3 py-1 text-sm disabled:opacity-50">Prev</button>
              <span className="text-sm text-[#7A6A58]">Page {page}</span>
              <button type="button" onClick={() => setPage((p) => p + 1)} className="rounded border border-border bg-white px-3 py-1 text-sm">Next</button>
            </div>
          </section>
        ) : null}

        {modalOpen ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2A1722]/40 p-4">
            <section className="mx-auto mt-8 w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-lg">
              <h2 className="text-lg font-semibold text-[#1F2420]">{editingRow ? "Edit package" : "Create package"}</h2>
              <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSave}>
                <label className="text-sm md:col-span-2"><span className="mb-1 block font-medium text-[#1F2420]">Name</span><input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-md border border-border bg-white px-3 py-2" /></label>
                <label className="text-sm"><span className="mb-1 block font-medium text-[#1F2420]">Original price</span><input type="number" min={0} step="0.01" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} required className="w-full rounded-md border border-border bg-white px-3 py-2" /></label>
                <label className="text-sm"><span className="mb-1 block font-medium text-[#1F2420]">Package price</span><input type="number" min={0} step="0.01" value={packagePrice} onChange={(e) => setPackagePrice(e.target.value)} required className="w-full rounded-md border border-border bg-white px-3 py-2" /></label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Duration (min)</span>
                  <input
                    type="number"
                    min={0}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                    placeholder="Optional"
                  />
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">Short description (marketing)</span>
                  <textarea
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                    placeholder="Shown on the public site cards when set"
                  />
                </label>
                <label className="text-sm flex items-center gap-2 md:col-span-2">
                  <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
                  <span className="font-medium text-[#1F2420]">Featured package</span>
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">Badge label</span>
                  <input
                    value={badgeLabel}
                    onChange={(e) => setBadgeLabel(e.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                    placeholder="e.g. Most Popular (optional)"
                  />
                </label>
                <label className="text-sm md:col-span-2"><span className="mb-1 block font-medium text-[#1F2420]">Service IDs (comma-separated)</span><input value={serviceIdsCsv} onChange={(e) => setServiceIdsCsv(e.target.value)} required className="w-full rounded-md border border-border bg-white px-3 py-2" /><p className="mt-1 text-xs text-[#7A6A58]">Services: {services.map((s) => `${s.name} (${s.id})`).join(" • ")}</p></label>
                <label className="text-sm md:col-span-2"><span className="mb-1 block font-medium text-[#1F2420]">Branch IDs (comma-separated)</span><input value={branchIdsCsv} onChange={(e) => setBranchIdsCsv(e.target.value)} required className="w-full rounded-md border border-border bg-white px-3 py-2" /><p className="mt-1 text-xs text-[#7A6A58]">Branches: {branches.map((b) => `${b.name} (${b.id})`).join(" • ")}</p></label>
                <div className="md:col-span-2 space-y-2 rounded-md border border-border bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-[#1F2420]">Display features</span>
                    <button type="button" onClick={addFeatureRow} className="rounded border border-border bg-[#FFF9EE] px-2 py-1 text-xs font-medium">
                      Add feature
                    </button>
                  </div>
                  <p className="text-xs text-[#7A6A58]">Order matches display on the website. Saving replaces all feature rows for this package.</p>
                  {features.length === 0 ? (
                    <p className="text-xs text-[#7A6A58]">No features yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {features.map((row, index) => (
                        <li key={row.key} className="flex flex-wrap items-center gap-2 rounded border border-border/80 bg-[#FFFCF6] p-2">
                          <input
                            value={row.label}
                            onChange={(e) =>
                              setFeatures((prev) =>
                                prev.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)),
                              )
                            }
                            placeholder="Feature label"
                            className="min-w-[12rem] flex-1 rounded border border-border px-2 py-1 text-sm"
                          />
                          <label className="flex items-center gap-1 text-xs text-[#1F2420]">
                            <input
                              type="checkbox"
                              checked={row.isActive}
                              onChange={(e) =>
                                setFeatures((prev) =>
                                  prev.map((r) => (r.key === row.key ? { ...r, isActive: e.target.checked } : r)),
                                )
                              }
                            />
                            Active
                          </label>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveFeatureRow(row.key, -1)}
                              className="rounded border border-border bg-white px-2 py-1 text-xs disabled:opacity-40"
                            >
                              Up
                            </button>
                            <button
                              type="button"
                              disabled={index === features.length - 1}
                              onClick={() => moveFeatureRow(row.key, 1)}
                              className="rounded border border-border bg-white px-2 py-1 text-xs disabled:opacity-40"
                            >
                              Down
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFeatureRow(row.key)}
                              className="rounded border border-border bg-white px-2 py-1 text-xs text-danger"
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {saveError ? <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger md:col-span-2">{saveError}</p> : null}
                <div className="md:col-span-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setModalOpen(false)} className="rounded border border-border bg-white px-3 py-2 text-sm">Cancel</button>
                  <button type="submit" disabled={saving} className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
