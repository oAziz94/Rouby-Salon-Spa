"use client";

import {
  ApiClientError,
  getDashboardOffers,
  patchDashboardOffer,
  patchDashboardOfferStatus,
  postDashboardOffer,
  type DashboardOffer,
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

export default function DashboardOffersPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canManage = hasPermission("offers.manage");
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardOffer[]>([]);
  const [isActiveFilter, setIsActiveFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DashboardOffer | null>(null);
  const [name, setName] = useState("");
  const [offerCode, setOfferCode] = useState("");
  const [discountType, setDiscountType] = useState("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    if (!token) return;
    setState("loading");
    setError("");
    try {
      const offersResult = await getDashboardOffers(token, {
        page,
        pageSize: 20,
        isActive: isActiveFilter === "" ? undefined : isActiveFilter === "true",
      });
      setRows(offersResult.data);
      setState(offersResult.data.length ? "loaded" : "empty");
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
    setOfferCode("");
    setDiscountType("PERCENTAGE");
    setDiscountValue("");
    setStartDate("");
    setEndDate("");
    setSaveError("");
    setModalOpen(true);
  }

  function openEditModal(row: DashboardOffer) {
    setEditingRow(row);
    setName(row.name);
    setOfferCode(row.offerCode ?? "");
    setDiscountType(row.discountType);
    setDiscountValue(row.discountValue.toString());
    setStartDate(row.startDate.slice(0, 10));
    setEndDate(row.endDate.slice(0, 10));
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
        offerCode: offerCode || null,
        discountType,
        discountValue: Number(discountValue),
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      };
      if (editingRow) await patchDashboardOffer(token, editingRow.id, payload);
      else await postDashboardOffer(token, payload);
      setModalOpen(false);
      await loadData();
    } catch (requestError) {
      setSaveError(formatApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function onToggleStatus(row: DashboardOffer) {
    if (!token) return;
    try {
      await patchDashboardOfferStatus(token, row.id, !row.isActive);
      await loadData();
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  return (
    <PermissionGuard permission="offers.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Offers</h1>
              <p className="mt-2 text-sm text-[#7A6A58]">Offer setup, scheduling, and activation management.</p>
            </div>
            {canManage ? <button type="button" onClick={openCreateModal} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">New offer</button> : null}
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

        {state === "loading" ? <p className="text-sm text-[#7A6A58]">Loading offers...</p> : null}
        {state === "error" ? <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] p-4 text-sm text-danger">{error}</p> : null}
        {state === "empty" ? <p className="rounded-lg border border-border bg-card p-4 text-sm text-[#7A6A58]">No offers found.</p> : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Code</th>
                    <th className="py-2 pr-3 font-medium">Discount</th>
                    <th className="py-2 pr-3 font-medium">Window</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 hover:bg-[#FFF9EE]">
                      <td className="py-3 pr-3 font-medium text-[#1F2420]">{row.name}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.offerCode ?? "-"}</td>
                      <td className="py-3 pr-3 text-[#1F2420]">{row.discountType} {row.discountValue}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.startDate.slice(0, 10)} to {row.endDate.slice(0, 10)}</td>
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
            <section className="mx-auto mt-8 w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-lg">
              <h2 className="text-lg font-semibold text-[#1F2420]">{editingRow ? "Edit offer" : "Create offer"}</h2>
              <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSave}>
                <label className="text-sm md:col-span-2"><span className="mb-1 block font-medium text-[#1F2420]">Name</span><input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-md border border-border bg-white px-3 py-2" /></label>
                <label className="text-sm"><span className="mb-1 block font-medium text-[#1F2420]">Offer code</span><input value={offerCode} onChange={(e) => setOfferCode(e.target.value)} className="w-full rounded-md border border-border bg-white px-3 py-2" /></label>
                <label className="text-sm"><span className="mb-1 block font-medium text-[#1F2420]">Discount type</span><select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="w-full rounded-md border border-border bg-white px-3 py-2"><option value="PERCENTAGE">PERCENTAGE</option><option value="FIXED_AMOUNT">FIXED_AMOUNT</option></select></label>
                <label className="text-sm"><span className="mb-1 block font-medium text-[#1F2420]">Discount value</span><input type="number" min={0} step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} required className="w-full rounded-md border border-border bg-white px-3 py-2" /></label>
                <label className="text-sm"><span className="mb-1 block font-medium text-[#1F2420]">Start date</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="w-full rounded-md border border-border bg-white px-3 py-2" /></label>
                <label className="text-sm"><span className="mb-1 block font-medium text-[#1F2420]">End date</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className="w-full rounded-md border border-border bg-white px-3 py-2" /></label>
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
