"use client";

import {
  ApiClientError,
  getDashboardInvoiceById,
  getDashboardInvoices,
  patchDashboardInvoice,
  postDashboardBookingInvoice,
  type DashboardInvoiceDetail,
  type DashboardInvoiceListItem,
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

function formatEGP(amount: number): string {
  return `EGP ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function DashboardInvoicesPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canRead = hasPermission("invoices.read");
  const canCreate = hasPermission("invoices.create_finalize");
  const canEdit = hasPermission("invoices.edit");

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardInvoiceListItem[]>([]);
  const [page, setPage] = useState(1);
  const [bookingFilter, setBookingFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [generateBookingId, setGenerateBookingId] = useState("");
  const [generateError, setGenerateError] = useState("");
  const [generateLoading, setGenerateLoading] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState<DashboardInvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [editStatus, setEditStatus] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  async function loadList() {
    if (!token || !canRead) return;
    setState("loading");
    setError("");
    try {
      const res = await getDashboardInvoices(token, {
        page,
        pageSize: 20,
        bookingId: bookingFilter || undefined,
        clientId: clientFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setRows(res.data);
      setState(res.data.length > 0 ? "loaded" : "empty");
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  async function loadDetail(invoiceId: string) {
    if (!token) return;
    setDetailLoading(true);
    setDetailError("");
    setEditError("");
    try {
      const res = await getDashboardInvoiceById(token, invoiceId);
      setDetail(res);
      setEditStatus(res.status === "CANCELLED" ? "CANCELLED" : "");
      setEditPaymentMethod(res.paymentMethod ?? "");
    } catch (requestError) {
      setDetail(null);
      setDetailError(formatApiError(requestError));
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canRead, page, bookingFilter, clientFilter, dateFrom, dateTo]);

  async function onGenerateInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !generateBookingId.trim()) return;
    setGenerateLoading(true);
    setGenerateError("");
    try {
      const created = await postDashboardBookingInvoice(token, generateBookingId.trim());
      await loadList();
      setDrawerOpen(true);
      await loadDetail(created.id);
      setGenerateBookingId("");
    } catch (requestError) {
      setGenerateError(formatApiError(requestError));
    } finally {
      setGenerateLoading(false);
    }
  }

  async function onPatchInvoice() {
    if (!token || !detail) return;
    setEditLoading(true);
    setEditError("");
    try {
      await patchDashboardInvoice(token, detail.id, {
        status: editStatus === "CANCELLED" ? "CANCELLED" : undefined,
        paymentMethod: editPaymentMethod || null,
      });
      await Promise.all([loadList(), loadDetail(detail.id)]);
    } catch (requestError) {
      setEditError(formatApiError(requestError));
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <PermissionGuard permission="invoices.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-[#1F2420]">Invoices</h1>
          <p className="mt-2 text-sm text-[#7A6A58]">
            Review finalized invoices, inspect line details, and run controlled edits.
          </p>
        </header>

        {canCreate ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[#1F2420]">Generate invoice</h2>
            <form onSubmit={onGenerateInvoice} className="mt-3 flex flex-wrap items-end gap-3">
              <label className="min-w-[260px] flex-1 text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Booking ID</span>
                <input
                  value={generateBookingId}
                  onChange={(event) => setGenerateBookingId(event.target.value)}
                  placeholder="Paste booking UUID"
                  className="w-full rounded-md border border-border bg-white px-3 py-2"
                />
              </label>
              <button
                type="submit"
                disabled={generateLoading}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {generateLoading ? "Generating..." : "Generate"}
              </button>
            </form>
            {generateError ? (
              <p className="mt-3 rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                {generateError}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Booking ID</span>
              <input
                value={bookingFilter}
                onChange={(event) => {
                  setPage(1);
                  setBookingFilter(event.target.value.trim());
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Client ID</span>
              <input
                value={clientFilter}
                onChange={(event) => {
                  setPage(1);
                  setClientFilter(event.target.value.trim());
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date from</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => {
                  setPage(1);
                  setDateFrom(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => {
                  setPage(1);
                  setDateTo(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
          </div>
        </section>

        {state === "loading" ? <p className="text-sm text-[#7A6A58]">Loading invoices...</p> : null}
        {state === "error" ? (
          <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">{error}</p>
        ) : null}
        {state === "empty" ? (
          <p className="rounded border border-border bg-card px-3 py-2 text-sm text-[#7A6A58]">
            No invoices found for current filters.
          </p>
        ) : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Invoice #</th>
                    <th className="py-2 pr-3 font-medium">Booking</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Total</th>
                    <th className="py-2 pr-3 font-medium">Paid</th>
                    <th className="py-2 pr-3 font-medium">Remaining</th>
                    <th className="py-2 pr-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-border/60 hover:bg-[#FFF9EE]"
                      onClick={() => {
                        setDrawerOpen(true);
                        void loadDetail(row.id);
                      }}
                    >
                      <td className="py-3 pr-3 font-medium text-[#1F2420]">{row.invoiceNumber}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.bookingId}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.status}</td>
                      <td className="py-3 pr-3 text-[#1F2420]">{formatEGP(row.totalAmount)}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{formatEGP(row.paidAmount)}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{formatEGP(row.remainingAmount)}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {new Date(row.createdAt).toLocaleDateString("en-GB")}
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

        {drawerOpen ? (
          <div className="fixed inset-0 z-50 flex justify-end bg-[#2A1722]/35">
            <aside className="h-full w-full overflow-y-auto border-l border-border bg-[#FFFDF9] p-5 shadow-xl sm:max-w-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#1F2420]">Invoice details</h2>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setDetail(null);
                    setDetailError("");
                    setEditError("");
                  }}
                  className="rounded border border-border bg-white px-3 py-1 text-sm"
                >
                  Close
                </button>
              </div>

              {detailLoading ? <p className="text-sm text-[#7A6A58]">Loading invoice...</p> : null}
              {detailError ? (
                <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                  {detailError}
                </p>
              ) : null}

              {detail ? (
                <div className="space-y-4">
                  <section className="rounded-lg border border-border bg-white p-4">
                    <p className="text-sm font-semibold text-[#1F2420]">{detail.invoiceNumber}</p>
                    <p className="mt-1 text-sm text-[#7A6A58]">Booking: {detail.bookingId}</p>
                    <p className="mt-1 text-sm text-[#7A6A58]">Status: {detail.status}</p>
                    <p className="mt-1 text-sm text-[#7A6A58]">
                      Payment method: {detail.paymentMethod ?? "Not set"}
                    </p>
                  </section>

                  <section className="rounded-lg border border-border bg-white p-4">
                    <h3 className="text-sm font-semibold text-[#1F2420]">Invoice lines</h3>
                    {detail.lines.length === 0 ? (
                      <p className="mt-2 text-sm text-[#7A6A58]">No invoice lines found.</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {detail.lines.map((line) => (
                          <li key={line.id} className="rounded border border-border p-3">
                            <p className="text-sm font-medium text-[#1F2420]">{line.nameSnapshot}</p>
                            <p className="mt-1 text-xs text-[#7A6A58]">
                              {line.itemType} • Qty {line.quantity} • {formatEGP(line.priceSnapshot)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="rounded-lg border border-border bg-white p-4">
                    <h3 className="text-sm font-semibold text-[#1F2420]">Totals</h3>
                    <div className="mt-2 space-y-1 text-sm text-[#1F2420]">
                      <p>Subtotal: {formatEGP(detail.subtotal)}</p>
                      <p>Discount: {formatEGP(detail.discountAmount)}</p>
                      <p>VAT ({(detail.vatRate * 100).toFixed(0)}%): {formatEGP(detail.vatAmount)}</p>
                      <p className="font-semibold">Total: {formatEGP(detail.totalAmount)}</p>
                      <p>Paid: {formatEGP(detail.paidAmount)}</p>
                      <p>Remaining: {formatEGP(detail.remainingAmount)}</p>
                    </div>
                  </section>

                  {canEdit ? (
                    <section className="rounded-lg border border-border bg-white p-4">
                      <h3 className="text-sm font-semibold text-[#1F2420]">Restricted edit</h3>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <label className="text-sm">
                          <span className="mb-1 block font-medium text-[#1F2420]">Status</span>
                          <select
                            value={editStatus}
                            onChange={(event) => setEditStatus(event.target.value)}
                            className="w-full rounded-md border border-border bg-white px-3 py-2"
                          >
                            <option value="">No change</option>
                            <option value="CANCELLED">CANCELLED</option>
                          </select>
                        </label>
                        <label className="text-sm">
                          <span className="mb-1 block font-medium text-[#1F2420]">Payment method</span>
                          <select
                            value={editPaymentMethod}
                            onChange={(event) => setEditPaymentMethod(event.target.value)}
                            className="w-full rounded-md border border-border bg-white px-3 py-2"
                          >
                            <option value="">Unset</option>
                            <option value="CASH">CASH</option>
                            <option value="CARD">CARD</option>
                            <option value="INSTAPAY">INSTAPAY</option>
                            <option value="MOBILE_WALLET">MOBILE_WALLET</option>
                            <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                          </select>
                        </label>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          disabled={editLoading}
                          onClick={() => void onPatchInvoice()}
                          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                        >
                          {editLoading ? "Updating..." : "Update invoice"}
                        </button>
                      </div>
                      {editError ? (
                        <p className="mt-3 rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                          {editError}
                        </p>
                      ) : null}
                    </section>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </div>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
