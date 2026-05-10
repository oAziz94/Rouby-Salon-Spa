"use client";

import {
  ApiClientError,
  getDashboardBookingById,
  getDashboardBookingPayments,
  getDashboardBookings,
  patchDashboardBookingPaymentStatus,
  patchDashboardPayment,
  postDashboardBookingPayment,
  type DashboardBookingDetail,
  type DashboardBookingsListItem,
  type DashboardPayment,
  type SimplePaymentAggregateStatus,
} from "@rouby/api-client";
import { formatDateTimeAmPm } from "@rouby/wall-clock";
import { useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "idle" | "loading" | "loaded" | "empty" | "error";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

function formatEGP(amount: number): string {
  return `EGP ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function DashboardPaymentsPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canRead = hasPermission("payments.read");
  const canRecord = hasPermission("payments.record");
  const canRecordSimple = hasPermission("payments.record_simple");
  const canUpdatePayment = hasPermission("payments.record") || hasPermission("payments.refund");

  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingRows, setBookingRows] = useState<DashboardBookingsListItem[]>([]);
  const [bookingLoad, setBookingLoad] = useState<LoadState>("idle");
  const [bookingError, setBookingError] = useState("");
  const [selectedBookingId, setSelectedBookingId] = useState("");

  const [summary, setSummary] = useState<DashboardBookingDetail | null>(null);
  const [payments, setPayments] = useState<DashboardPayment[]>([]);
  const [paymentsLoad, setPaymentsLoad] = useState<LoadState>("idle");
  const [paymentsError, setPaymentsError] = useState("");

  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [recordAmount, setRecordAmount] = useState("");
  const [recordMethod, setRecordMethod] = useState("CASH");
  const [recordStatus, setRecordStatus] = useState("PAID");
  const [recordReference, setRecordReference] = useState("");
  const [recordPaidAt, setRecordPaidAt] = useState("");
  const [recordError, setRecordError] = useState("");
  const [recordSaving, setRecordSaving] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<DashboardPayment | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMethod, setEditMethod] = useState("CASH");
  const [editStatus, setEditStatus] = useState("PAID");
  const [editReference, setEditReference] = useState("");
  const [editPaidAt, setEditPaidAt] = useState("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [simpleStatus, setSimpleStatus] = useState<SimplePaymentAggregateStatus>("UNPAID");
  const [simpleAmount, setSimpleAmount] = useState("");
  const [simpleError, setSimpleError] = useState("");
  const [simpleSaving, setSimpleSaving] = useState(false);

  const filteredBookings = useMemo(() => {
    if (!bookingSearch.trim()) return bookingRows;
    const q = bookingSearch.trim().toLowerCase();
    return bookingRows.filter(
      (row) => row.id.toLowerCase().includes(q) || row.clientId.toLowerCase().includes(q),
    );
  }, [bookingRows, bookingSearch]);

  async function loadBookings() {
    if (!token || !canRead) return;
    setBookingLoad("loading");
    setBookingError("");
    try {
      const res = await getDashboardBookings(token, { page: 1, pageSize: 50 });
      setBookingRows(res.data);
      setBookingLoad(res.data.length > 0 ? "loaded" : "empty");
      if (!selectedBookingId) {
        setSelectedBookingId(res.data[0]?.id ?? "");
      }
    } catch (error) {
      setBookingError(formatApiError(error));
      setBookingLoad("error");
    }
  }

  async function loadPayments(bookingId: string) {
    if (!token || !bookingId || !canRead) return;
    setPaymentsLoad("loading");
    setPaymentsError("");
    try {
      const [bookingRes, paymentsRes] = await Promise.all([
        getDashboardBookingById(token, bookingId),
        getDashboardBookingPayments(token, bookingId),
      ]);
      setSummary(bookingRes);
      setPayments(paymentsRes.payments);
      setPaymentsLoad(paymentsRes.payments.length > 0 ? "loaded" : "empty");
    } catch (error) {
      setSummary(null);
      setPayments([]);
      setPaymentsError(formatApiError(error));
      setPaymentsLoad("error");
    }
  }

  useEffect(() => {
    void loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canRead]);

  useEffect(() => {
    if (selectedBookingId) void loadPayments(selectedBookingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBookingId, token, canRead]);

  async function onRecordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedBookingId) return;
    setRecordSaving(true);
    setRecordError("");
    try {
      await postDashboardBookingPayment(token, selectedBookingId, {
        amount: Number(recordAmount),
        method: recordMethod,
        status: recordStatus,
        reference: recordReference || null,
        paidAt: recordPaidAt ? new Date(recordPaidAt).toISOString() : null,
      });
      setRecordModalOpen(false);
      await loadPayments(selectedBookingId);
    } catch (error) {
      setRecordError(formatApiError(error));
    } finally {
      setRecordSaving(false);
    }
  }

  function openEditModal(row: DashboardPayment) {
    setEditingPayment(row);
    setEditAmount(String(row.amount));
    setEditMethod(row.method);
    setEditStatus(row.status);
    setEditReference(row.reference ?? "");
    setEditPaidAt(row.paidAt ? new Date(row.paidAt).toISOString().slice(0, 16) : "");
    setEditError("");
    setEditModalOpen(true);
  }

  async function onUpdatePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !editingPayment || !selectedBookingId) return;
    setEditSaving(true);
    setEditError("");
    try {
      await patchDashboardPayment(token, editingPayment.id, {
        amount: Number(editAmount),
        method: editMethod,
        status: editStatus,
        reference: editReference || null,
        paidAt: editPaidAt ? new Date(editPaidAt).toISOString() : null,
      });
      setEditModalOpen(false);
      await loadPayments(selectedBookingId);
    } catch (error) {
      setEditError(formatApiError(error));
    } finally {
      setEditSaving(false);
    }
  }

  async function onApplySimpleStatus() {
    if (!token || !selectedBookingId) return;
    setSimpleSaving(true);
    setSimpleError("");
    try {
      await patchDashboardBookingPaymentStatus(token, selectedBookingId, {
        paymentStatus: simpleStatus,
        amount: simpleStatus === "PARTIALLY_PAID" ? Number(simpleAmount) : undefined,
      });
      await loadPayments(selectedBookingId);
    } catch (error) {
      setSimpleError(formatApiError(error));
    } finally {
      setSimpleSaving(false);
    }
  }

  return (
    <PermissionGuard permission="payments.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-[#1F2420]">Payments</h1>
          <p className="mt-2 text-sm text-[#7A6A58]">
            Record and update booking payments with simple status support.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-[#1F2420]">Booking search</span>
              <input
                value={bookingSearch}
                onChange={(event) => setBookingSearch(event.target.value)}
                placeholder="Search by booking ID or client ID"
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Select booking</span>
              <select
                value={selectedBookingId}
                onChange={(event) => setSelectedBookingId(event.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              >
                <option value="">Choose booking</option>
                {filteredBookings.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.id} ({row.status})
                  </option>
                ))}
              </select>
            </label>
          </div>
          {bookingLoad === "loading" ? <p className="mt-2 text-xs text-[#7A6A58]">Loading bookings...</p> : null}
          {bookingLoad === "error" ? (
            <p className="mt-2 rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-xs text-danger">
              {bookingError}
            </p>
          ) : null}
        </section>

        {summary ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <article className="rounded-lg border border-border bg-white p-3">
                <p className="text-xs text-[#7A6A58]">Total</p>
                <p className="mt-1 font-semibold text-[#1F2420]">{formatEGP(summary.totalAmount)}</p>
              </article>
              <article className="rounded-lg border border-border bg-white p-3">
                <p className="text-xs text-[#7A6A58]">Paid</p>
                <p className="mt-1 font-semibold text-[#1F2420]">{formatEGP(summary.paidAmount)}</p>
              </article>
              <article className="rounded-lg border border-border bg-white p-3">
                <p className="text-xs text-[#7A6A58]">Remaining</p>
                <p className="mt-1 font-semibold text-[#1F2420]">{formatEGP(summary.remainingAmount)}</p>
              </article>
            </div>
          </section>
        ) : null}

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[#1F2420]">Payments list</h2>
            {canRecord ? (
              <button
                type="button"
                onClick={() => {
                  setRecordAmount("");
                  setRecordMethod("CASH");
                  setRecordStatus("PAID");
                  setRecordReference("");
                  setRecordPaidAt("");
                  setRecordError("");
                  setRecordModalOpen(true);
                }}
                disabled={!selectedBookingId}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                Record payment
              </button>
            ) : null}
          </div>

          {paymentsLoad === "loading" ? <p className="text-sm text-[#7A6A58]">Loading payments...</p> : null}
          {paymentsLoad === "error" ? (
            <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
              {paymentsError}
            </p>
          ) : null}
          {paymentsLoad === "empty" ? (
            <p className="text-sm text-[#7A6A58]">No payments recorded for this booking.</p>
          ) : null}

          {paymentsLoad === "loaded" ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Amount</th>
                    <th className="py-2 pr-3 font-medium">Method</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Reference</th>
                    <th className="py-2 pr-3 font-medium">Paid at</th>
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 hover:bg-[#FFF9EE]">
                      <td className="py-3 pr-3 text-[#1F2420]">{formatEGP(row.amount)}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.method}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.status}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.reference ?? "-"}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {row.paidAt ? formatDateTimeAmPm(row.paidAt) : "-"}
                      </td>
                      <td className="py-3 pr-3">
                        {canUpdatePayment ? (
                          <button
                            type="button"
                            onClick={() => openEditModal(row)}
                            className="rounded border border-border bg-white px-2 py-1 text-xs"
                          >
                            Update
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        {canRecordSimple ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[#1F2420]">Simple payment status</h2>
            <p className="mt-1 text-xs text-[#7A6A58]">
              Quick receptionist action mapped to payment summary for the selected booking.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Status</span>
                <select
                  value={simpleStatus}
                  onChange={(event) => setSimpleStatus(event.target.value as SimplePaymentAggregateStatus)}
                  className="w-full rounded-md border border-border bg-white px-3 py-2"
                >
                  <option value="UNPAID">UNPAID</option>
                  <option value="PARTIALLY_PAID">PARTIALLY_PAID</option>
                  <option value="PAID">PAID</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Amount (partial only)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={simpleAmount}
                  onChange={(event) => setSimpleAmount(event.target.value)}
                  disabled={simpleStatus !== "PARTIALLY_PAID"}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
                />
              </label>
              <div className="self-end">
                <button
                  type="button"
                  disabled={simpleSaving || !selectedBookingId}
                  onClick={() => void onApplySimpleStatus()}
                  className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {simpleSaving ? "Applying..." : "Apply status"}
                </button>
              </div>
            </div>
            {simpleError ? (
              <p className="mt-3 rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                {simpleError}
              </p>
            ) : null}
          </section>
        ) : null}

        {recordModalOpen ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2A1722]/40 p-4">
            <section className="mx-auto mt-8 w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-lg">
              <h2 className="text-lg font-semibold text-[#1F2420]">Record payment</h2>
              <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onRecordPayment}>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Amount</span>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={recordAmount}
                    onChange={(event) => setRecordAmount(event.target.value)}
                    required
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Method</span>
                  <select
                    value={recordMethod}
                    onChange={(event) => setRecordMethod(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  >
                    <option value="CASH">CASH</option>
                    <option value="CARD">CARD</option>
                    <option value="INSTAPAY">INSTAPAY</option>
                    <option value="MOBILE_WALLET">MOBILE_WALLET</option>
                    <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Status</span>
                  <select
                    value={recordStatus}
                    onChange={(event) => setRecordStatus(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  >
                    <option value="PAID">PAID</option>
                    <option value="PENDING">PENDING</option>
                    <option value="FAILED">FAILED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Paid at</span>
                  <input
                    type="datetime-local"
                    value={recordPaidAt}
                    onChange={(event) => setRecordPaidAt(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">Reference</span>
                  <input
                    value={recordReference}
                    onChange={(event) => setRecordReference(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                {recordError ? (
                  <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger md:col-span-2">
                    {recordError}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2 md:col-span-2">
                  <button
                    type="button"
                    onClick={() => setRecordModalOpen(false)}
                    className="rounded border border-border bg-white px-3 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={recordSaving}
                    className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {recordSaving ? "Saving..." : "Save payment"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        {editModalOpen ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2A1722]/40 p-4">
            <section className="mx-auto mt-8 w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-lg">
              <h2 className="text-lg font-semibold text-[#1F2420]">Update payment</h2>
              <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onUpdatePayment}>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Amount</span>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={editAmount}
                    onChange={(event) => setEditAmount(event.target.value)}
                    required
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Method</span>
                  <select
                    value={editMethod}
                    onChange={(event) => setEditMethod(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  >
                    <option value="CASH">CASH</option>
                    <option value="CARD">CARD</option>
                    <option value="INSTAPAY">INSTAPAY</option>
                    <option value="MOBILE_WALLET">MOBILE_WALLET</option>
                    <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Status</span>
                  <select
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  >
                    <option value="PAID">PAID</option>
                    <option value="PENDING">PENDING</option>
                    <option value="FAILED">FAILED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Paid at</span>
                  <input
                    type="datetime-local"
                    value={editPaidAt}
                    onChange={(event) => setEditPaidAt(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block font-medium text-[#1F2420]">Reference</span>
                  <input
                    value={editReference}
                    onChange={(event) => setEditReference(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                {editError ? (
                  <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger md:col-span-2">
                    {editError}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2 md:col-span-2">
                  <button
                    type="button"
                    onClick={() => setEditModalOpen(false)}
                    className="rounded border border-border bg-white px-3 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editSaving}
                    className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {editSaving ? "Saving..." : "Update payment"}
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
