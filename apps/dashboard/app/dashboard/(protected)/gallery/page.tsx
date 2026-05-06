"use client";

import {
  ApiClientError,
  getDashboardGallery,
  patchDashboardGalleryItem,
  patchDashboardGalleryItemStatus,
  postDashboardGalleryItem,
  type DashboardGalleryItem,
} from "@rouby/api-client";
import { useEffect, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "empty" | "error";

type GalleryFormState = {
  imageUrl: string;
  title: string;
  category: string;
  displayOrder: string;
  isFeatured: boolean;
  isActive: boolean;
};

const DEFAULT_FORM: GalleryFormState = {
  imageUrl: "",
  title: "",
  category: "",
  displayOrder: "0",
  isFeatured: false,
  isActive: true,
};

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

export default function DashboardGalleryPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canManage = hasPermission("gallery.manage");
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardGalleryItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [isActiveFilter, setIsActiveFilter] = useState("");
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DashboardGalleryItem | null>(null);
  const [form, setForm] = useState<GalleryFormState>(DEFAULT_FORM);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    if (!token) return;
    setState("loading");
    setError("");
    try {
      const result = await getDashboardGallery(token, {
        page,
        pageSize: 20,
        category: categoryFilter || undefined,
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
  }, [token, page, categoryFilter, isActiveFilter]);

  function openCreateModal() {
    setEditingRow(null);
    setForm(DEFAULT_FORM);
    setSaveError("");
    setModalOpen(true);
  }

  function openEditModal(row: DashboardGalleryItem) {
    setEditingRow(row);
    setForm({
      imageUrl: row.imageUrl,
      title: row.title ?? "",
      category: row.category ?? "",
      displayOrder: String(row.displayOrder),
      isFeatured: row.isFeatured,
      isActive: row.isActive,
    });
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
        imageUrl: form.imageUrl.trim(),
        title: form.title.trim() || undefined,
        category: form.category.trim() || undefined,
        displayOrder: Number(form.displayOrder || "0"),
        isFeatured: form.isFeatured,
        isActive: form.isActive,
      };
      if (editingRow) {
        await patchDashboardGalleryItem(token, editingRow.id, payload);
      } else {
        await postDashboardGalleryItem(token, payload);
      }
      setModalOpen(false);
      await loadData();
    } catch (requestError) {
      setSaveError(formatApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function onToggleStatus(row: DashboardGalleryItem) {
    if (!token) return;
    try {
      await patchDashboardGalleryItemStatus(token, row.id, !row.isActive);
      await loadData();
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  return (
    <PermissionGuard permission="gallery.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Gallery</h1>
              <p className="mt-2 text-sm text-[#7A6A58]">
                Manage gallery images shown on the public website.
              </p>
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                New gallery item
              </button>
            ) : null}
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Category</span>
              <input
                value={categoryFilter}
                onChange={(event) => {
                  setPage(1);
                  setCategoryFilter(event.target.value);
                }}
                placeholder="Filter by category"
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Active state</span>
              <select
                value={isActiveFilter}
                onChange={(event) => {
                  setPage(1);
                  setIsActiveFilter(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="">All</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
          </div>
        </section>

        {state === "loading" ? <p className="text-sm text-[#7A6A58]">Loading gallery items...</p> : null}
        {state === "error" ? (
          <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] p-4 text-sm text-danger">{error}</p>
        ) : null}
        {state === "empty" ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-[#7A6A58]">
            No gallery items found.
          </p>
        ) : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Image URL</th>
                    <th className="py-2 pr-3 font-medium">Title</th>
                    <th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 font-medium">Order</th>
                    <th className="py-2 pr-3 font-medium">Featured</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 hover:bg-[#FFF9EE]">
                      <td className="max-w-[220px] truncate py-3 pr-3 text-[#1F2420]">{row.imageUrl}</td>
                      <td className="py-3 pr-3 font-medium text-[#1F2420]">{row.title ?? "-"}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.category ?? "-"}</td>
                      <td className="py-3 pr-3 text-[#1F2420]">{row.displayOrder}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.isFeatured ? "Yes" : "No"}</td>
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
                        ) : (
                          <span className="text-xs text-[#7A6A58]">Read only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <article key={row.id} className="rounded-lg border border-border bg-white p-4">
                  <p className="truncate text-sm font-semibold text-[#1F2420]">{row.title ?? "Untitled image"}</p>
                  <p className="mt-1 text-xs text-[#7A6A58]">{row.category ?? "Uncategorized"}</p>
                  <p className="mt-1 truncate text-xs text-[#7A6A58]">{row.imageUrl}</p>
                  <p className="mt-2 text-xs text-[#1F2420]">
                    Order: {row.displayOrder} | Featured: {row.isFeatured ? "Yes" : "No"} |{" "}
                    {row.isActive ? "Active" : "Inactive"}
                  </p>
                  {canManage ? (
                    <div className="mt-3 flex gap-2">
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
                </article>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded border border-border bg-white px-3 py-1 text-sm disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm text-[#7A6A58]">Page {page}</span>
              <button
                type="button"
                onClick={() => setPage((prev) => prev + 1)}
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
                {editingRow ? "Edit gallery item" : "Create gallery item"}
              </h2>
              <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSave}>
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">Image URL</span>
                  <input
                    value={form.imageUrl}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, imageUrl: event.target.value }))
                    }
                    required
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Title</span>
                  <input
                    value={form.title}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Category</span>
                  <input
                    value={form.category}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, category: event.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Display order</span>
                  <input
                    type="number"
                    min={0}
                    value={form.displayOrder}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, displayOrder: event.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="mt-6 flex items-center gap-2 text-sm text-[#1F2420]">
                  <input
                    type="checkbox"
                    checked={form.isFeatured}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, isFeatured: event.target.checked }))
                    }
                  />
                  Featured on gallery
                </label>
                <label className="flex items-center gap-2 text-sm text-[#1F2420]">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, isActive: event.target.checked }))
                    }
                  />
                  Active
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
