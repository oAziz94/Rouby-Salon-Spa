"use client";

import {
  ApiClientError,
  getDashboardServiceEnhancements,
  patchDashboardServiceEnhancement,
  patchDashboardServiceEnhancementStatus,
  postDashboardServiceEnhancement,
  type DashboardServiceEnhancement,
} from "@rouby/api-client";
import { useEffect, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "empty" | "error";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

function formatEGP(amount: number | null): string {
  if (amount === null) return "-";
  return `EGP ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardServiceEnhancementsPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canManage = hasPermission("service_enhancements.manage");
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardServiceEnhancement[]>([]);
  const [isActiveFilter, setIsActiveFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DashboardServiceEnhancement | null>(null);
  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [price, setPrice] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    if (!token) return;
    setState("loading");
    setError("");
    try {
      const result = await getDashboardServiceEnhancements(token, {
        page,
        pageSize: 20,
        isActive: isActiveFilter === "" ? undefined : isActiveFilter === "true",
      });
      setRows(result.data);
      setState(result.data.length ? "loaded" : "empty");
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
    setTitle("");
    setShortDescription("");
    setPrice("");
    setDurationMinutes("");
    setImageUrl("");
    setDisplayOrder("0");
    setSaveError("");
    setModalOpen(true);
  }

  function openEditModal(row: DashboardServiceEnhancement) {
    setEditingRow(row);
    setTitle(row.title);
    setShortDescription(row.shortDescription ?? "");
    setPrice(row.price?.toString() ?? "");
    setDurationMinutes(row.durationMinutes?.toString() ?? "");
    setImageUrl(row.imageUrl ?? "");
    setDisplayOrder(String(row.displayOrder));
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
        title,
        shortDescription: shortDescription.trim() || null,
        price: price.trim() === "" ? null : Number(price),
        durationMinutes: durationMinutes.trim() === "" ? null : Number(durationMinutes),
        imageUrl: imageUrl.trim() || null,
        displayOrder: Number(displayOrder || 0),
      };
      if (editingRow) {
        await patchDashboardServiceEnhancement(token, editingRow.id, payload);
      } else {
        await postDashboardServiceEnhancement(token, payload);
      }
      setModalOpen(false);
      await loadData();
    } catch (requestError) {
      setSaveError(formatApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function onToggleStatus(row: DashboardServiceEnhancement) {
    if (!token) return;
    try {
      await patchDashboardServiceEnhancementStatus(token, row.id, !row.isActive);
      await loadData();
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  return (
    <PermissionGuard permission="service_enhancements.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Service Enhancements</h1>
              <p className="mt-2 text-sm text-[#7A6A58]">
                Manage add-on enhancements shown on the public services page.
              </p>
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                New enhancement
              </button>
            ) : null}
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-[#1F2420]">Active state</span>
            <select
              value={isActiveFilter}
              onChange={(event) => setIsActiveFilter(event.target.value)}
              className="w-full max-w-xs rounded-md border border-border bg-white px-3 py-2"
            >
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
        </section>

        {state === "loading" ? <p className="text-sm text-[#7A6A58]">Loading enhancements...</p> : null}
        {state === "error" ? (
          <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] p-4 text-sm text-danger">{error}</p>
        ) : null}
        {state === "empty" ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-[#7A6A58]">
            No enhancements found.
          </p>
        ) : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Title</th>
                    <th className="py-2 pr-3 font-medium">Price</th>
                    <th className="py-2 pr-3 font-medium">Duration</th>
                    <th className="py-2 pr-3 font-medium">Order</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 hover:bg-[#FFF9EE]">
                      <td className="py-3 pr-3 font-medium text-[#1F2420]">{row.title}</td>
                      <td className="py-3 pr-3 text-[#1F2420]">{formatEGP(row.price)}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {row.durationMinutes != null ? `${row.durationMinutes} min` : "-"}
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.displayOrder}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.isActive ? "Active" : "Inactive"}</td>
                      <td className="py-3 pr-3">
                        {canManage ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(row)}
                              className="rounded border border-border bg-white px-2 py-1 text-xs"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void onToggleStatus(row)}
                              className="rounded border border-border bg-white px-2 py-1 text-xs"
                            >
                              {row.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-border bg-white px-3 py-1 text-sm disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm text-[#7A6A58]">Page {page}</span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-border bg-white px-3 py-1 text-sm"
              >
                Next
              </button>
            </div>
          </section>
        ) : null}

        {modalOpen ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2A1722]/40 p-4">
            <section className="mx-auto mt-8 w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-lg">
              <h2 className="text-lg font-semibold text-[#1F2420]">
                {editingRow ? "Edit enhancement" : "Create enhancement"}
              </h2>
              <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSave}>
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">Title</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">Short description</span>
                  <textarea
                    value={shortDescription}
                    onChange={(event) => setShortDescription(event.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Price (EGP)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Duration (minutes)</span>
                  <input
                    type="number"
                    min={0}
                    value={durationMinutes}
                    onChange={(event) => setDurationMinutes(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">Image URL</span>
                  <input
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Display order</span>
                  <input
                    type="number"
                    min={0}
                    value={displayOrder}
                    onChange={(event) => setDisplayOrder(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                {saveError ? (
                  <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger md:col-span-2">
                    {saveError}
                  </p>
                ) : null}
                <div className="md:col-span-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded border border-border bg-white px-3 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Save"}
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
