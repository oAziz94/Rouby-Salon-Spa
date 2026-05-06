"use client";

import {
  ApiClientError,
  getDashboardBundles,
  getDashboardServices,
  patchDashboardBundle,
  patchDashboardBundleStatus,
  postDashboardBundle,
  type DashboardBundle,
  type DashboardService,
} from "@rouby/api-client";
import { useEffect, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "empty" | "error";

function formatEGP(amount: number): string {
  return `EGP ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

export default function DashboardBundlesPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canManage = hasPermission("bundles.manage");
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardBundle[]>([]);
  const [services, setServices] = useState<DashboardService[]>([]);
  const [isActiveFilter, setIsActiveFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DashboardBundle | null>(null);
  const [name, setName] = useState("");
  const [bundleType, setBundleType] = useState("FLEXIBLE");
  const [price, setPrice] = useState("");
  const [selectableCount, setSelectableCount] = useState("1");
  const [serviceIdsCsv, setServiceIdsCsv] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    if (!token) return;
    setState("loading");
    setError("");
    try {
      const [bundlesResult, servicesResult] = await Promise.all([
        getDashboardBundles(token, {
          page,
          pageSize: 20,
          isActive: isActiveFilter === "" ? undefined : isActiveFilter === "true",
        }),
        getDashboardServices(token, { page: 1, pageSize: 100 }),
      ]);
      setRows(bundlesResult.data);
      setServices(servicesResult.data);
      setState(bundlesResult.data.length ? "loaded" : "empty");
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
    setBundleType("FLEXIBLE");
    setPrice("");
    setSelectableCount("1");
    setServiceIdsCsv("");
    setSaveError("");
    setModalOpen(true);
  }

  function openEditModal(row: DashboardBundle) {
    setEditingRow(row);
    setName(row.name);
    setBundleType(row.bundleType);
    setPrice(row.price.toString());
    setSelectableCount(row.selectableCount.toString());
    setServiceIdsCsv(row.serviceIds.join(", "));
    setSaveError("");
    setModalOpen(true);
  }

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        name,
        bundleType,
        price: Number(price),
        selectableCount: Number(selectableCount),
        serviceIds: serviceIdsCsv.split(",").map((v) => v.trim()).filter(Boolean),
      };
      if (editingRow) await patchDashboardBundle(token, editingRow.id, payload);
      else await postDashboardBundle(token, payload);
      setModalOpen(false);
      await loadData();
    } catch (requestError) {
      setSaveError(formatApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function onToggleStatus(row: DashboardBundle) {
    if (!token) return;
    try {
      await patchDashboardBundleStatus(token, row.id, !row.isActive);
      await loadData();
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  return (
    <PermissionGuard permission="bundles.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Bundles</h1>
              <p className="mt-2 text-sm text-[#7A6A58]">Bundle catalog and activation management.</p>
            </div>
            {canManage ? <button type="button" onClick={openCreateModal} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">New bundle</button> : null}
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

        {state === "loading" ? <p className="text-sm text-[#7A6A58]">Loading bundles...</p> : null}
        {state === "error" ? <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] p-4 text-sm text-danger">{error}</p> : null}
        {state === "empty" ? <p className="rounded-lg border border-border bg-card p-4 text-sm text-[#7A6A58]">No bundles found.</p> : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Price</th>
                    <th className="py-2 pr-3 font-medium">Selectable</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 hover:bg-[#FFF9EE]">
                      <td className="py-3 pr-3 font-medium text-[#1F2420]">{row.name}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.bundleType}</td>
                      <td className="py-3 pr-3 text-[#1F2420]">{formatEGP(row.price)}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.selectableCount}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.isActive ? "Active" : "Inactive"}</td>
                      <td className="py-3 pr-3">{canManage ? <div className="flex gap-2"><button type="button" onClick={() => openEditModal(row)} className="rounded border border-border bg-white px-2 py-1 text-xs">Edit</button><button type="button" onClick={() => void onToggleStatus(row)} className="rounded border border-border bg-white px-2 py-1 text-xs">{row.isActive ? "Deactivate" : "Activate"}</button></div> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <h2 className="text-lg font-semibold text-[#1F2420]">{editingRow ? "Edit bundle" : "Create bundle"}</h2>
              <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSave}>
                <label className="text-sm md:col-span-2"><span className="mb-1 block font-medium text-[#1F2420]">Name</span><input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-md border border-border bg-white px-3 py-2" /></label>
                <label className="text-sm"><span className="mb-1 block font-medium text-[#1F2420]">Bundle type</span><select value={bundleType} onChange={(e) => setBundleType(e.target.value)} className="w-full rounded-md border border-border bg-white px-3 py-2"><option value="FLEXIBLE">FLEXIBLE</option><option value="FIXED">FIXED</option><option value="QUANTITY">QUANTITY</option></select></label>
                <label className="text-sm"><span className="mb-1 block font-medium text-[#1F2420]">Price</span><input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required className="w-full rounded-md border border-border bg-white px-3 py-2" /></label>
                <label className="text-sm"><span className="mb-1 block font-medium text-[#1F2420]">Selectable count</span><input type="number" min={1} value={selectableCount} onChange={(e) => setSelectableCount(e.target.value)} required className="w-full rounded-md border border-border bg-white px-3 py-2" /></label>
                <label className="text-sm md:col-span-2"><span className="mb-1 block font-medium text-[#1F2420]">Service IDs (comma-separated)</span><input value={serviceIdsCsv} onChange={(e) => setServiceIdsCsv(e.target.value)} required className="w-full rounded-md border border-border bg-white px-3 py-2" /><p className="mt-1 text-xs text-[#7A6A58]">Services: {services.map((s) => `${s.name} (${s.id})`).join(" • ")}</p></label>
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
