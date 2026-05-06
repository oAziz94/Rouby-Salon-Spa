"use client";

import {
  ApiClientError,
  getDashboardReviews,
  patchDashboardReview,
  type DashboardReview,
} from "@rouby/api-client";
import { useEffect, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "empty" | "error";

type ReviewFormState = {
  rating: string;
  comment: string;
  status: string;
  displayOnWebsite: boolean;
};

const REVIEW_STATUS_OPTIONS = ["PENDING", "APPROVED", "REJECTED", "HIDDEN"];

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

export default function DashboardReviewsPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canManage = hasPermission("reviews.manage");
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardReview[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [displayFilter, setDisplayFilter] = useState("");
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DashboardReview | null>(null);
  const [form, setForm] = useState<ReviewFormState>({
    rating: "5",
    comment: "",
    status: "PENDING",
    displayOnWebsite: false,
  });
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    if (!token) return;
    setState("loading");
    setError("");
    try {
      const result = await getDashboardReviews(token, {
        page,
        pageSize: 20,
        status: statusFilter || undefined,
        displayOnWebsite:
          displayFilter === "" ? undefined : displayFilter === "true",
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
  }, [token, page, statusFilter, displayFilter]);

  function openEditModal(row: DashboardReview) {
    setEditingRow(row);
    setForm({
      rating: String(row.rating),
      comment: row.comment ?? "",
      status: row.status,
      displayOnWebsite: row.displayOnWebsite,
    });
    setSaveError("");
    setModalOpen(true);
  }

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !editingRow) return;
    setSaving(true);
    setSaveError("");
    try {
      await patchDashboardReview(token, editingRow.id, {
        rating: Number(form.rating),
        comment: form.comment.trim() || null,
        status: form.status,
        displayOnWebsite: form.displayOnWebsite,
      });
      setModalOpen(false);
      await loadData();
    } catch (requestError) {
      setSaveError(formatApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function onQuickStatus(row: DashboardReview, status: string) {
    if (!token) return;
    try {
      await patchDashboardReview(token, row.id, { status });
      await loadData();
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  async function onToggleDisplay(row: DashboardReview) {
    if (!token) return;
    try {
      await patchDashboardReview(token, row.id, {
        displayOnWebsite: !row.displayOnWebsite,
      });
      await loadData();
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  return (
    <PermissionGuard permission="reviews.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-semibold text-[#1F2420]">Reviews moderation</h1>
            <p className="mt-2 text-sm text-[#7A6A58]">
              Review queue moderation with approval, rejection, and website visibility.
            </p>
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setPage(1);
                  setStatusFilter(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="">All</option>
                {REVIEW_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Display on website</span>
              <select
                value={displayFilter}
                onChange={(event) => {
                  setPage(1);
                  setDisplayFilter(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="">All</option>
                <option value="true">Displayed</option>
                <option value="false">Hidden</option>
              </select>
            </label>
          </div>
        </section>

        {state === "loading" ? <p className="text-sm text-[#7A6A58]">Loading reviews...</p> : null}
        {state === "error" ? (
          <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] p-4 text-sm text-danger">{error}</p>
        ) : null}
        {state === "empty" ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-[#7A6A58]">
            No reviews found.
          </p>
        ) : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Client</th>
                    <th className="py-2 pr-3 font-medium">Rating</th>
                    <th className="py-2 pr-3 font-medium">Comment</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Display</th>
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 hover:bg-[#FFF9EE]">
                      <td className="py-3 pr-3 font-medium text-[#1F2420]">
                        {row.client?.fullName ?? row.clientId ?? "Unknown"}
                      </td>
                      <td className="py-3 pr-3 text-[#1F2420]">{row.rating}/5</td>
                      <td className="max-w-[300px] truncate py-3 pr-3 text-[#7A6A58]">
                        {row.comment ?? "-"}
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.status}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {row.displayOnWebsite ? "Displayed" : "Hidden"}
                      </td>
                      <td className="py-3 pr-3">
                        {canManage ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(row)}
                              className="rounded border border-border bg-white px-2 py-1 text-xs"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void onQuickStatus(row, "APPROVED")}
                              className="rounded border border-border bg-white px-2 py-1 text-xs"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => void onQuickStatus(row, "REJECTED")}
                              className="rounded border border-border bg-white px-2 py-1 text-xs"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => void onQuickStatus(row, "HIDDEN")}
                              className="rounded border border-border bg-white px-2 py-1 text-xs"
                            >
                              Hide
                            </button>
                            <button
                              type="button"
                              onClick={() => void onToggleDisplay(row)}
                              className="rounded border border-border bg-white px-2 py-1 text-xs"
                            >
                              {row.displayOnWebsite ? "Unpublish" : "Publish"}
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
                  <p className="text-sm font-semibold text-[#1F2420]">
                    {row.client?.fullName ?? row.clientId ?? "Unknown"}
                  </p>
                  <p className="mt-1 text-xs text-[#7A6A58]">
                    {row.rating}/5 | {row.status} |{" "}
                    {row.displayOnWebsite ? "Displayed" : "Hidden"}
                  </p>
                  <p className="mt-2 text-xs text-[#1F2420]">{row.comment ?? "No comment"}</p>
                  {canManage ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(row)}
                        className="rounded border border-border bg-white px-2 py-1 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void onQuickStatus(row, "APPROVED")}
                        className="rounded border border-border bg-white px-2 py-1 text-xs"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void onQuickStatus(row, "REJECTED")}
                        className="rounded border border-border bg-white px-2 py-1 text-xs"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => void onQuickStatus(row, "HIDDEN")}
                        className="rounded border border-border bg-white px-2 py-1 text-xs"
                      >
                        Hide
                      </button>
                      <button
                        type="button"
                        onClick={() => void onToggleDisplay(row)}
                        className="rounded border border-border bg-white px-2 py-1 text-xs"
                      >
                        {row.displayOnWebsite ? "Unpublish" : "Publish"}
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

        {modalOpen && editingRow ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2A1722]/40 p-4">
            <section className="mx-auto mt-8 w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-lg">
              <h2 className="text-lg font-semibold text-[#1F2420]">Edit review</h2>
              <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSave}>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Rating</span>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={form.rating}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, rating: event.target.value }))
                    }
                    required
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Status</span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, status: event.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  >
                    {REVIEW_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">Comment</span>
                  <textarea
                    value={form.comment}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, comment: event.target.value }))
                    }
                    rows={4}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-[#1F2420]">
                  <input
                    type="checkbox"
                    checked={form.displayOnWebsite}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        displayOnWebsite: event.target.checked,
                      }))
                    }
                  />
                  Display on website
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
