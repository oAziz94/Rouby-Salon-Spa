"use client";

import {
  ApiClientError,
  getDashboardBookings,
  getDashboardBranches,
  getDashboardInvoiceById,
  getDashboardInvoices,
  patchDashboardInvoice,
  postDashboardBookingInvoice,
  postDashboardInvoicePayment,
  type DashboardBookingsListItem,
  type DashboardBranch,
  type DashboardInvoiceDetail,
  type DashboardInvoiceListItem,
  type DashboardInvoicePaymentStatus,
  type DashboardListMeta,
} from "@rouby/api-client";
import { formatDateTimeAmPm, formatDayLabel, formatWallClock12h, formatWallClockRange12h } from "@rouby/wall-clock";
import {
  Banknote,
  Calendar,
  FileText,
  Filter,
  Loader2,
  Plus,
  Receipt,
  Search,
  Wallet,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type ListStatus = "loading" | "ready" | "error";

const PAYMENT_METHOD_OPTIONS = [
  "CASH",
  "CARD",
  "INSTAPAY",
  "MOBILE_WALLET",
  "BANK_TRANSFER",
] as const;

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function bookingRefFromId(bookingId: string): string {
  const tail = bookingId.replace(/-/g, "").slice(-8).toUpperCase();
  return `RB-${tail}`;
}

function normalizeUuidInput(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, "");
  if (UUID_V4_RE.test(t)) {
    return t.toLowerCase();
  }
  const compact = t.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/i.test(compact)) {
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`.toLowerCase();
  }
  return null;
}

function isUuidV4(value: string): boolean {
  return UUID_V4_RE.test(value.trim());
}

function paymentStatusBadgeClass(status: DashboardInvoicePaymentStatus | undefined): string {
  switch (status) {
    case "PAID":
      return "bg-emerald-50 text-emerald-900 border-emerald-200";
    case "PARTIALLY_PAID":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "UNPAID":
    default:
      return "bg-neutral-100 text-neutral-800 border-border";
  }
}

function invoiceStatusBadgeClass(status: string): string {
  if (status === "CANCELLED") {
    return "bg-red-50 text-red-900 border-red-200";
  }
  return "bg-[#E8F2EE] text-[#0E342B] border-[#0E342B]/20";
}

export default function DashboardInvoicesPage() {
  const { token, hasPermission, user } = useDashboardAuth();
  const canRead = hasPermission("invoices.read");
  const canCreate = hasPermission("invoices.create_finalize") || hasPermission("invoices.create");
  const canEdit = hasPermission("invoices.edit");
  const canPrint = hasPermission("invoices.print") || hasPermission("invoices.read");
  const canRecordPayment = hasPermission("payments.record");
  const canSearchBookings = hasPermission("bookings.read");
  const canReadBranches = hasPermission("branches.read");
  const canAccessMultipleBranches = user?.branchId === null && canReadBranches;

  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const pushToast = useCallback((message: string, tone: "success" | "error") => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const [branches, setBranches] = useState<DashboardBranch[]>([]);

  useEffect(() => {
    if (!token || !canReadBranches) {
      setBranches([]);
      return;
    }
    let cancelled = false;
    void getDashboardBranches(token)
      .then((b) => {
        if (!cancelled) {
          setBranches(Array.isArray(b) ? b : []);
        }
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canReadBranches, token]);

  type FilterForm = {
    search: string;
    branchId: string;
    bookingId: string;
    clientId: string;
    dateFrom: string;
    dateTo: string;
    paymentStatus: "" | DashboardInvoicePaymentStatus;
    status: "" | "FINALIZED" | "CANCELLED";
  };

  const defaultFilters = useMemo<FilterForm>(
    () => ({
      search: "",
      branchId: "",
      bookingId: "",
      clientId: "",
      dateFrom: "",
      dateTo: "",
      paymentStatus: "",
      status: "",
    }),
    [],
  );

  const [draftFilters, setDraftFilters] = useState<FilterForm>({ ...defaultFilters });
  const [appliedFilters, setAppliedFilters] = useState<FilterForm>({ ...defaultFilters });
  const [page, setPage] = useState(1);
  const [listStatus, setListStatus] = useState<ListStatus>("loading");
  const [listError, setListError] = useState("");
  const [rows, setRows] = useState<DashboardInvoiceListItem[]>([]);
  const [meta, setMeta] = useState<DashboardListMeta | null>(null);

  const buildListQuery = useCallback(() => {
    const q: Parameters<typeof getDashboardInvoices>[1] = {
      page,
      pageSize: 20,
      search: appliedFilters.search.trim() || undefined,
      dateFrom: appliedFilters.dateFrom || undefined,
      dateTo: appliedFilters.dateTo || undefined,
      paymentStatus: appliedFilters.paymentStatus || undefined,
      status: appliedFilters.status || undefined,
    };
    if (appliedFilters.branchId && isUuidV4(appliedFilters.branchId)) {
      q.branchId = appliedFilters.branchId.trim();
    }
    if (appliedFilters.bookingId && isUuidV4(appliedFilters.bookingId)) {
      q.bookingId = appliedFilters.bookingId.trim();
    }
    if (appliedFilters.clientId && isUuidV4(appliedFilters.clientId)) {
      q.clientId = appliedFilters.clientId.trim();
    }
    return q;
  }, [appliedFilters, page]);

  const loadList = useCallback(async () => {
    if (!token || !canRead) return;
    setListStatus("loading");
    setListError("");
    try {
      const res = await getDashboardInvoices(token, buildListQuery());
      setRows(Array.isArray(res.data) ? res.data : []);
      setMeta(res.meta ?? null);
      setListStatus("ready");
    } catch (requestError) {
      setListError(formatApiError(requestError));
      setListStatus("error");
    }
  }, [buildListQuery, canRead, token]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const summary = meta?.invoiceSummary;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState<DashboardInvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const loadDetail = useCallback(
    async (invoiceId: string) => {
      if (!token) return;
      setDetailLoading(true);
      setDetailError("");
      try {
        const res = await getDashboardInvoiceById(token, invoiceId);
        setDetail(res);
      } catch (requestError) {
        setDetail(null);
        setDetailError(formatApiError(requestError));
      } finally {
        setDetailLoading(false);
      }
    },
    [token],
  );

  const openDrawer = useCallback(
    (invoiceId: string) => {
      setDrawerOpen(true);
      void loadDetail(invoiceId);
    },
    [loadDetail],
  );

  const searchParams = useSearchParams();
  const router = useRouter();
  const openedInvoiceFromUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get("invoiceId");
    if (!raw || !canRead) {
      openedInvoiceFromUrlRef.current = null;
      return;
    }
    const id = normalizeUuidInput(raw) ?? (isUuidV4(raw) ? raw.trim().toLowerCase() : null);
    if (!id) {
      return;
    }
    if (openedInvoiceFromUrlRef.current === id) {
      return;
    }
    openedInvoiceFromUrlRef.current = id;
    openDrawer(id);
    router.replace("/dashboard/invoices", { scroll: false });
  }, [searchParams, canRead, openDrawer, router]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setDetail(null);
    setDetailError("");
    setEditError("");
  }, []);

  const [editStatus, setEditStatus] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    if (!detail) return;
    setEditStatus(detail.status === "CANCELLED" ? "CANCELLED" : "");
    setEditPaymentMethod(detail.paymentMethod ?? "");
  }, [detail]);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingHits, setBookingHits] = useState<DashboardBookingsListItem[]>([]);
  const [bookingSearchLoading, setBookingSearchLoading] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [advancedBookingInput, setAdvancedBookingInput] = useState("");
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const searchDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!generateOpen || !token || !canSearchBookings) {
      setBookingHits([]);
      return;
    }
    const q = bookingSearch.trim();
    if (q.length < 2) {
      setBookingHits([]);
      setBookingSearchLoading(false);
      return;
    }
    setBookingSearchLoading(true);
    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = window.setTimeout(() => {
      void getDashboardBookings(token, {
        search: q,
        pageSize: 15,
        page: 1,
      })
        .then((res) => {
          setBookingHits(Array.isArray(res.data) ? res.data : []);
        })
        .catch(() => {
          setBookingHits([]);
        })
        .finally(() => {
          setBookingSearchLoading(false);
        });
    }, 350);
    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, [bookingSearch, canSearchBookings, generateOpen, token]);

  const resetGenerateModal = useCallback(() => {
    setBookingSearch("");
    setBookingHits([]);
    setSelectedBookingId(null);
    setAdvancedBookingInput("");
    setAdvancedExpanded(false);
    setGenerateError("");
  }, []);

  async function resolveBookingIdForGenerate(): Promise<string | null> {
    if (selectedBookingId) {
      return selectedBookingId;
    }
    const raw = advancedBookingInput.trim();
    if (!raw) {
      setGenerateError("Select a booking from search or enter a booking UUID.");
      return null;
    }
    const normalized = normalizeUuidInput(raw);
    if (normalized) {
      return normalized;
    }
    if (!token || !canSearchBookings) {
      setGenerateError("Enter a valid booking UUID, or enable booking search (bookings.read).");
      return null;
    }
    try {
      const res = await getDashboardBookings(token, {
        search: raw,
        pageSize: 8,
        page: 1,
      });
      const data = Array.isArray(res.data) ? res.data : [];
      if (data.length === 1) {
        return data[0].id;
      }
      if (data.length === 0) {
        setGenerateError("No booking matched that reference. Try the full UUID.");
        return null;
      }
      setGenerateError("Multiple bookings matched. Pick one from search or paste the full UUID.");
      return null;
    } catch (e) {
      setGenerateError(formatApiError(e));
      return null;
    }
  }

  async function onGenerateInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setGenerateError("");
    const bookingId = await resolveBookingIdForGenerate();
    if (!bookingId) return;
    setGenerateLoading(true);
    try {
      const created = await postDashboardBookingInvoice(token, bookingId);
      await loadList();
      pushToast(`Invoice ${created.invoiceNumber} created.`, "success");
      setGenerateOpen(false);
      resetGenerateModal();
      setDrawerOpen(true);
      setDetail(created);
      setDetailLoading(false);
      setDetailError("");
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
      const updated = await patchDashboardInvoice(token, detail.id, {
        status: editStatus === "CANCELLED" ? "CANCELLED" : undefined,
        paymentMethod: editPaymentMethod || null,
      });
      setDetail(updated);
      await loadList();
      pushToast("Invoice updated.", "success");
    } catch (requestError) {
      setEditError(formatApiError(requestError));
      pushToast(formatApiError(requestError), "error");
    } finally {
      setEditLoading(false);
    }
  }

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHOD_OPTIONS[0]);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentFieldErrors, setPaymentFieldErrors] = useState<Record<string, string>>({});
  const [paymentSubmitError, setPaymentSubmitError] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);

  const openPaymentModal = useCallback((inv: DashboardInvoiceDetail) => {
    setPaymentOpen(true);
    setPaymentSubmitError("");
    setPaymentFieldErrors({});
    setPaymentMethod(PAYMENT_METHOD_OPTIONS[0]);
    setPaymentReference("");
    setPaymentNotes("");
    setPaymentAmount(
      inv.remainingAmount > 0 ? inv.remainingAmount.toFixed(2) : "",
    );
  }, []);

  const closePaymentModal = useCallback(() => {
    setPaymentOpen(false);
    setPaymentFieldErrors({});
    setPaymentSubmitError("");
  }, []);

  function validatePaymentForm(remaining: number): boolean {
    const next: Record<string, string> = {};
    const raw = paymentAmount.trim().replace(/,/g, "");
    const amount = Number.parseFloat(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      next.amount = "Enter an amount greater than zero.";
    } else if (amount > remaining + 0.0001) {
      next.amount = `Amount cannot exceed remaining ${formatEGP(remaining)}.`;
    }
    if (!paymentMethod) {
      next.method = "Choose a payment method.";
    }
    setPaymentFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onRecordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !detail) return;
    const remaining = detail.remainingAmount;
    if (!validatePaymentForm(remaining)) return;
    const amount = Number.parseFloat(paymentAmount.trim().replace(/,/g, ""));
    setPaymentLoading(true);
    setPaymentSubmitError("");
    try {
      await postDashboardInvoicePayment(token, detail.id, {
        amount,
        method: paymentMethod,
        referenceNumber: paymentReference.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
      });
      pushToast("Payment recorded.", "success");
      closePaymentModal();
      await loadList();
      await loadDetail(detail.id);
    } catch (requestError) {
      const msg = formatApiError(requestError);
      setPaymentSubmitError(msg);
      pushToast(msg, "error");
    } finally {
      setPaymentLoading(false);
    }
  }

  const filterDirty = useMemo(() => {
    return (Object.keys(draftFilters) as (keyof FilterForm)[]).some(
      (k) => draftFilters[k] !== appliedFilters[k],
    );
  }, [appliedFilters, draftFilters]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters({ ...draftFilters });
  }

  function clearFilters() {
    setDraftFilters({ ...defaultFilters });
    setAppliedFilters({ ...defaultFilters });
    setPage(1);
  }

  const filterChips = useMemo(() => {
    const chips: string[] = [];
    if (appliedFilters.search.trim()) chips.push(`Search: ${appliedFilters.search.trim()}`);
    if (appliedFilters.branchId) chips.push("Branch filter");
    if (appliedFilters.bookingId) chips.push("Booking UUID");
    if (appliedFilters.clientId) chips.push("Client UUID");
    if (appliedFilters.dateFrom) chips.push(`From ${appliedFilters.dateFrom}`);
    if (appliedFilters.dateTo) chips.push(`To ${appliedFilters.dateTo}`);
    if (appliedFilters.paymentStatus) chips.push(`Payment: ${appliedFilters.paymentStatus}`);
    if (appliedFilters.status) chips.push(`Invoice: ${appliedFilters.status}`);
    return chips;
  }, [appliedFilters]);

  return (
    <PermissionGuard permission="invoices.read">
      <section className="space-y-6">
        {toast ? (
          <div
            className={`fixed bottom-6 right-6 z-[70] max-w-md rounded-xl border px-4 py-3 text-sm shadow-lg ${
              toast.tone === "success"
                ? "border-[#0E342B]/25 bg-[#E8F2EE] text-[#0E342B]"
                : "border-[#E7B9A4]/80 bg-[#FFF1EC] text-danger"
            }`}
            role="status"
          >
            {toast.message}
          </div>
        ) : null}

        <header className="rounded-2xl border border-border bg-gradient-to-br from-card to-[#FFF9EE]/80 p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[#7A6A58]">
                <FileText className="h-5 w-5 shrink-0" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-wide">Finance</span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#1F2420]">Invoices</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#7A6A58]">
                Finalized billing documents tied to bookings. Filter the ledger, open an invoice for
                full context, record payments, or generate a new invoice when checkout is ready.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canCreate ? (
                <button
                  type="button"
                  onClick={() => {
                    resetGenerateModal();
                    setGenerateOpen(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-95"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Generate from booking
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {listStatus === "ready" && summary ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              icon={<Receipt className="h-5 w-5" aria-hidden />}
              label="Matching invoices"
              value={String(summary.totalInvoices)}
              hint={`${summary.paidInvoices} paid · ${summary.partiallyPaidInvoices} partial · ${summary.unpaidInvoices} unpaid`}
            />
            <SummaryCard
              icon={<FileText className="h-5 w-5" aria-hidden />}
              label="Invoice value (filtered)"
              value={formatEGP(summary.totalRevenue)}
              hint="Sum of invoice totals in current filter set"
            />
            <SummaryCard
              icon={<Wallet className="h-5 w-5" aria-hidden />}
              label="Collected"
              value={formatEGP(summary.totalPaid)}
            />
            <SummaryCard
              icon={<Banknote className="h-5 w-5" aria-hidden />}
              label="Outstanding"
              value={formatEGP(summary.totalOutstanding)}
            />
          </div>
        ) : null}

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-[#1F2420]">
              <Filter className="h-4 w-4 text-[#7A6A58]" aria-hidden />
              <h2 className="text-sm font-semibold">Filters</h2>
              {filterDirty ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                  Unapplied changes
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyFilters}
                className="rounded-lg bg-[#1F2420] px-3 py-2 text-xs font-medium text-white shadow-sm"
              >
                Apply filters
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-[#1F2420]"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-6">
            <label className="text-sm lg:col-span-2">
              <span className="mb-1 block font-medium text-[#1F2420]">Search</span>
              <input
                value={draftFilters.search}
                onChange={(e) => setDraftFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder="Invoice #, client, phone, booking ref…"
                className="w-full rounded-lg border border-border bg-white px-3 py-2"
              />
            </label>
            {canAccessMultipleBranches ? (
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[#1F2420]">Branch</span>
                <select
                  value={draftFilters.branchId}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, branchId: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2"
                >
                  <option value="">All branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Payment status</span>
              <select
                value={draftFilters.paymentStatus}
                onChange={(e) =>
                  setDraftFilters((f) => ({
                    ...f,
                    paymentStatus: e.target.value as FilterForm["paymentStatus"],
                  }))
                }
                className="w-full rounded-lg border border-border bg-white px-3 py-2"
              >
                <option value="">Any</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PARTIALLY_PAID">Partially paid</option>
                <option value="PAID">Paid</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Invoice status</span>
              <select
                value={draftFilters.status}
                onChange={(e) =>
                  setDraftFilters((f) => ({
                    ...f,
                    status: e.target.value as FilterForm["status"],
                  }))
                }
                className="w-full rounded-lg border border-border bg-white px-3 py-2"
              >
                <option value="">Any</option>
                <option value="FINALIZED">Finalized</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date from</span>
              <input
                type="date"
                value={draftFilters.dateFrom}
                onChange={(e) => {
                  const nextFrom = e.target.value;
                  setDraftFilters((f) => {
                    const next = { ...f, dateFrom: nextFrom };
                    if (nextFrom && f.dateTo && f.dateTo < nextFrom) {
                      next.dateTo = nextFrom;
                    }
                    return next;
                  });
                }}
                className="w-full rounded-lg border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date to</span>
              <input
                type="date"
                value={draftFilters.dateTo}
                min={draftFilters.dateFrom || undefined}
                onChange={(e) => setDraftFilters((f) => ({ ...f, dateTo: e.target.value }))}
                className="w-full rounded-lg border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm lg:col-span-3">
              <span className="mb-1 block font-medium text-[#1F2420]">Booking ID (UUID)</span>
              <input
                value={draftFilters.bookingId}
                onChange={(e) => setDraftFilters((f) => ({ ...f, bookingId: e.target.value }))}
                placeholder="Optional exact booking UUID"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-xs"
              />
            </label>
            <label className="text-sm lg:col-span-3">
              <span className="mb-1 block font-medium text-[#1F2420]">Client ID (UUID)</span>
              <input
                value={draftFilters.clientId}
                onChange={(e) => setDraftFilters((f) => ({ ...f, clientId: e.target.value }))}
                placeholder="Optional exact client UUID"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-xs"
              />
            </label>
          </div>

          {filterChips.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {filterChips.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-border bg-[#FFF9EE] px-3 py-1 text-xs text-[#5C4F42]"
                >
                  {c}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm">
          {listStatus === "loading" ? (
            <div className="flex items-center gap-2 p-6 text-sm text-[#7A6A58]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading invoices…
            </div>
          ) : null}
          {listStatus === "error" ? (
            <p className="p-6 text-sm text-danger">{listError}</p>
          ) : null}
          {listStatus === "ready" && rows.length === 0 ? (
            <p className="p-6 text-sm text-[#7A6A58]">No invoices match the current filters.</p>
          ) : null}
          {listStatus === "ready" && rows.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[#7A6A58]">
                      <th className="px-4 py-3 font-medium">Invoice</th>
                      <th className="px-4 py-3 font-medium">Client</th>
                      <th className="px-4 py-3 font-medium">Booking</th>
                      <th className="px-4 py-3 font-medium">Invoice status</th>
                      <th className="px-4 py-3 font-medium">Payment</th>
                      <th className="px-4 py-3 font-medium text-right">Total</th>
                      <th className="px-4 py-3 font-medium text-right">Paid</th>
                      <th className="px-4 py-3 font-medium text-right">Remaining</th>
                      <th className="px-4 py-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-b border-border/60 transition hover:bg-[#FFF9EE]"
                        onClick={() => openDrawer(row.id)}
                      >
                        <td className="px-4 py-3 font-medium text-[#1F2420]">{row.invoiceNumber}</td>
                        <td className="px-4 py-3 text-[#5C4F42]">
                          {row.client?.fullName ?? "—"}
                          {row.client?.phone ? (
                            <span className="mt-0.5 block text-xs text-[#7A6A58]">{row.client.phone}</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[#5C4F42]">
                          {row.booking?.reference ?? bookingRefFromId(row.bookingId)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${invoiceStatusBadgeClass(row.status)}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${paymentStatusBadgeClass(row.paymentStatus)}`}
                          >
                            {row.paymentStatus ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#1F2420]">
                          {formatEGP(row.totalAmount)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#7A6A58]">
                          {formatEGP(row.paidAmount)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#7A6A58]">
                          {formatEGP(row.remainingAmount)}
                        </td>
                        <td className="px-4 py-3 text-[#7A6A58]">{formatDateTimeAmPm(row.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
                <p className="text-xs text-[#7A6A58]">
                  {meta
                    ? `Page ${meta.page} of ${Math.max(1, meta.totalPages)} · ${meta.totalItems} total`
                    : null}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!meta?.hasNextPage}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {generateOpen ? (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-[#2A1722]/40 p-4 sm:items-center"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setGenerateOpen(false);
                resetGenerateModal();
              }
            }}
          >
            <div
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-[#FFFDF9] p-6 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="generate-invoice-title"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="generate-invoice-title" className="text-lg font-semibold text-[#1F2420]">
                    Generate invoice
                  </h2>
                  <p className="mt-1 text-sm text-[#7A6A58]">
                    Pick a booking from search, or use advanced entry when you already have the UUID
                    or reference.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-border bg-white p-2 text-[#1F2420]"
                  onClick={() => {
                    setGenerateOpen(false);
                    resetGenerateModal();
                  }}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form className="mt-5 space-y-5" onSubmit={onGenerateInvoice}>
                {canSearchBookings ? (
                  <div>
                    <label className="text-sm font-medium text-[#1F2420]">Booking search</label>
                    <div className="relative mt-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A89480]" />
                      <input
                        value={bookingSearch}
                        onChange={(e) => {
                          setBookingSearch(e.target.value);
                          setSelectedBookingId(null);
                        }}
                        placeholder="Client name, phone, or booking fragment…"
                        className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm"
                      />
                    </div>
                    {bookingSearchLoading ? (
                      <p className="mt-2 flex items-center gap-2 text-xs text-[#7A6A58]">
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        Searching…
                      </p>
                    ) : null}
                    {bookingHits.length > 0 ? (
                      <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-white p-2">
                        {bookingHits.map((b) => {
                          const ref = bookingRefFromId(b.id);
                          const selected = selectedBookingId === b.id;
                          return (
                            <li key={b.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBookingId(b.id);
                                  setAdvancedBookingInput("");
                                }}
                                className={`w-full rounded-md px-2 py-2 text-left text-sm transition ${
                                  selected ? "bg-[#FFF9EE] ring-1 ring-primary/30" : "hover:bg-[#FFF9EE]/80"
                                }`}
                              >
                                <span className="font-medium text-[#1F2420]">
                                  {b.client?.fullName ?? "Walk-in / unknown"}
                                </span>
                                <span className="mt-0.5 block text-xs text-[#7A6A58]">
                                  {ref}
                                  {b.slot?.date ? (
                                    <>
                                      {" "}
                                      · {formatDayLabel(b.slot.date)} {b.slot.startTime ? formatWallClock12h(b.slot.startTime) : ""}
                                    </>
                                  ) : null}
                                  {" · "}
                                  {b.status}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    You do not have booking list access. Use advanced UUID entry below, or ask an
                    admin for <span className="font-mono">bookings.read</span> to enable search.
                  </p>
                )}

                <div className="rounded-xl border border-border bg-white/80 p-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left text-sm font-semibold text-[#1F2420]"
                    onClick={() => setAdvancedExpanded((v) => !v)}
                  >
                    Advanced: UUID / reference fallback
                    <span className="text-xs font-normal text-[#7A6A58]">
                      {advancedExpanded ? "Hide" : "Show"}
                    </span>
                  </button>
                  {advancedExpanded ? (
                    <label className="mt-3 block text-sm">
                      <span className="mb-1 block text-[#5C4F42]">
                        Paste booking UUID (dashed or 32 hex), RB- reference, or any fragment that
                        resolves to a single booking.
                      </span>
                      <textarea
                        value={advancedBookingInput}
                        onChange={(e) => {
                          setAdvancedBookingInput(e.target.value);
                          setSelectedBookingId(null);
                        }}
                        rows={2}
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-xs"
                      />
                    </label>
                  ) : null}
                </div>

                {generateError ? (
                  <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                    {generateError}
                  </p>
                ) : null}

                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium"
                    onClick={() => {
                      setGenerateOpen(false);
                      resetGenerateModal();
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={generateLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {generateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Generate invoice
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {paymentOpen && detail ? (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-[#2A1722]/40 p-4 sm:items-center"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closePaymentModal();
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-border bg-[#FFFDF9] p-6 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="record-payment-title"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="record-payment-title" className="text-lg font-semibold text-[#1F2420]">
                    Record payment
                  </h2>
                  <p className="mt-1 text-sm text-[#7A6A58]">
                    {detail.invoiceNumber} · Remaining {formatEGP(detail.remainingAmount)}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-border bg-white p-2"
                  onClick={closePaymentModal}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form className="mt-5 space-y-4" onSubmit={onRecordPayment}>
                <label className="block text-sm">
                  <span className="font-medium text-[#1F2420]">Amount (EGP)</span>
                  <input
                    inputMode="decimal"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 ${
                      paymentFieldErrors.amount ? "border-red-400" : "border-border"
                    }`}
                  />
                  {paymentFieldErrors.amount ? (
                    <span className="mt-1 block text-xs text-danger">{paymentFieldErrors.amount}</span>
                  ) : null}
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-[#1F2420]">Method</span>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 ${
                      paymentFieldErrors.method ? "border-red-400" : "border-border"
                    }`}
                  >
                    {PAYMENT_METHOD_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  {paymentFieldErrors.method ? (
                    <span className="mt-1 block text-xs text-danger">{paymentFieldErrors.method}</span>
                  ) : null}
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-[#1F2420]">Reference (optional)</span>
                  <input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-[#1F2420]">Notes (optional)</span>
                  <textarea
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  />
                </label>
                {paymentSubmitError ? (
                  <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                    {paymentSubmitError}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closePaymentModal}
                    className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={paymentLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {paymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Record payment
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {drawerOpen ? (
          <div
            className="fixed inset-0 z-50 flex justify-end bg-[#2A1722]/35"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeDrawer();
            }}
          >
            <aside className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-[#FFFDF9] shadow-xl">
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                    Invoice
                  </p>
                  <h2 className="truncate text-lg font-semibold text-[#1F2420]">
                    {detail?.invoiceNumber ?? (detailLoading ? "Loading…" : "—")}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="shrink-0 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium"
                >
                  Close
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {detailLoading ? (
                  <div className="flex items-center gap-2 text-sm text-[#7A6A58]">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading invoice…
                  </div>
                ) : null}
                {detailError ? (
                  <p className="rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                    {detailError}
                  </p>
                ) : null}

                {detail ? (
                  <div className="space-y-4 pb-8">
                    <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        Summary
                      </h3>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${invoiceStatusBadgeClass(detail.status)}`}
                        >
                          {detail.status}
                        </span>
                        {detail.paymentStatus ? (
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${paymentStatusBadgeClass(detail.paymentStatus)}`}
                          >
                            {detail.paymentStatus}
                          </span>
                        ) : null}
                      </div>
                      <dl className="mt-4 grid gap-2 text-sm text-[#1F2420] sm:grid-cols-2">
                        <div>
                          <dt className="text-xs text-[#7A6A58]">Total</dt>
                          <dd className="font-semibold">{formatEGP(detail.totalAmount)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[#7A6A58]">Remaining</dt>
                          <dd>{formatEGP(detail.remainingAmount)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[#7A6A58]">Payment method</dt>
                          <dd>{detail.paymentMethod ?? "Not set"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[#7A6A58]">Cashier</dt>
                          <dd>{detail.cashierName ?? "—"}</dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {detail.status === "FINALIZED" && canPrint ? (
                          <a
                            href={`/dashboard/invoices/${detail.id}/receipt`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-[#FFF9EE] px-3 py-2 text-xs font-semibold text-[#1F2420]"
                          >
                            <Receipt className="h-3.5 w-3.5" aria-hidden />
                            Print receipt
                          </a>
                        ) : null}
                        {canRecordPayment &&
                        detail.status === "FINALIZED" &&
                        detail.remainingAmount > 0 ? (
                          <button
                            type="button"
                            onClick={() => openPaymentModal(detail)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                          >
                            <Wallet className="h-3.5 w-3.5" aria-hidden />
                            Record payment
                          </button>
                        ) : null}
                      </div>
                    </section>

                    <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        Customer
                      </h3>
                      {detail.client ? (
                        <dl className="mt-3 space-y-2 text-sm">
                          <div>
                            <dt className="text-xs text-[#7A6A58]">Name</dt>
                            <dd className="font-medium text-[#1F2420]">{detail.client.fullName}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#7A6A58]">Phone</dt>
                            <dd>{detail.client.phone ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#7A6A58]">Email</dt>
                            <dd className="break-all">{detail.client.email ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#7A6A58]">Client ID</dt>
                            <dd className="break-all font-mono text-xs">{detail.client.id}</dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="mt-2 text-sm text-[#7A6A58]">No client on file.</p>
                      )}
                    </section>

                    <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        Booking
                      </h3>
                      {detail.booking ? (
                        <dl className="mt-3 space-y-2 text-sm">
                          <div>
                            <dt className="text-xs text-[#7A6A58]">Reference</dt>
                            <dd className="font-medium text-[#1F2420]">{detail.booking.reference}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#7A6A58]">Source</dt>
                            <dd>{detail.booking.source}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#7A6A58]">Branch</dt>
                            <dd>{detail.booking.branchName ?? detail.branch?.name ?? "—"}</dd>
                          </div>
                          <div className="flex items-start gap-2">
                            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[#A89480]" aria-hidden />
                            <div>
                              <dt className="text-xs text-[#7A6A58]">Slot</dt>
                              <dd>
                                {detail.booking.slot
                                  ? `${detail.booking.source === "WALK_IN" ? "Walk-in · " : ""}${formatDayLabel(detail.booking.slot.date)} · ${formatWallClockRange12h(detail.booking.slot.startTime, detail.booking.slot.endTime)}`
                                  : "—"}
                              </dd>
                            </div>
                          </div>
                          <div>
                            <dt className="text-xs text-[#7A6A58]">Services</dt>
                            <dd className="text-[#5C4F42]">{detail.booking.servicesSummary || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#7A6A58]">Line items</dt>
                            <dd>{detail.booking.itemCount}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#7A6A58]">Booking ID</dt>
                            <dd className="break-all font-mono text-xs">{detail.booking.id}</dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="mt-2 text-sm text-[#7A6A58]">No booking metadata.</p>
                      )}
                    </section>

                    <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        Lines
                      </h3>
                      {detail.lines.length === 0 ? (
                        <p className="mt-2 text-sm text-[#7A6A58]">No lines on this invoice.</p>
                      ) : (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full min-w-[480px] border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-border text-left text-[#7A6A58]">
                                <th className="py-2 pr-2 font-medium">Item</th>
                                <th className="py-2 pr-2 font-medium">Type</th>
                                <th className="py-2 pr-2 font-medium text-right">Qty</th>
                                <th className="py-2 pr-2 font-medium text-right">Unit</th>
                                <th className="py-2 font-medium text-right">Line</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.lines.map((line) => {
                                const lineDiscount = line.discountAmount ?? 0;
                                const lineTotal = Math.max(0, line.priceSnapshot * line.quantity - lineDiscount);
                                return (
                                  <tr key={line.id} className="border-b border-border/60">
                                    <td className="py-2 pr-2 font-medium text-[#1F2420]">
                                      {line.nameSnapshot}
                                    </td>
                                    <td className="py-2 pr-2 text-[#5C4F42]">{line.itemType}</td>
                                    <td className="py-2 pr-2 text-right tabular-nums">{line.quantity}</td>
                                    <td className="py-2 pr-2 text-right tabular-nums">
                                      {formatEGP(line.priceSnapshot)}
                                      {lineDiscount > 0 ? (
                                        <span className="block text-[11px] text-[#8B4428]">−{formatEGP(lineDiscount)}</span>
                                      ) : null}
                                    </td>
                                    <td className="py-2 text-right tabular-nums font-medium">
                                      {formatEGP(lineTotal)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>

                    <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        Totals
                      </h3>
                      <dl className="mt-3 space-y-1 text-sm text-[#1F2420]">
                        <div className="flex justify-between gap-4">
                          <dt className="text-[#7A6A58]">Subtotal</dt>
                          <dd className="tabular-nums">{formatEGP(detail.subtotal)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-[#7A6A58]">Discount</dt>
                          <dd className="tabular-nums">{formatEGP(detail.discountAmount)}</dd>
                        </div>
                        {detail.discountAmount > 0 && detail.discountReason ? (
                          <div className="rounded-lg border border-[#F0EBE3] bg-[#FFFCF7] px-3 py-2">
                            <dt className="text-xs font-medium text-[#7A6A58]">Discount reason</dt>
                            <dd className="mt-1 text-sm leading-relaxed text-[#1F2420]">
                              {detail.discountReason}
                            </dd>
                          </div>
                        ) : null}
                        <div className="flex justify-between gap-4">
                          <dt className="text-[#7A6A58]">VAT ({(detail.vatRate * 100).toFixed(0)}%)</dt>
                          <dd className="tabular-nums">{formatEGP(detail.vatAmount)}</dd>
                        </div>
                        <div className="flex justify-between gap-4 font-semibold">
                          <dt>Total</dt>
                          <dd className="tabular-nums">{formatEGP(detail.totalAmount)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-[#7A6A58]">Paid</dt>
                          <dd className="tabular-nums">{formatEGP(detail.paidAmount)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-[#7A6A58]">Remaining</dt>
                          <dd className="tabular-nums">{formatEGP(detail.remainingAmount)}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        Payments
                      </h3>
                      {!detail.payments || detail.payments.length === 0 ? (
                        <p className="mt-2 text-sm text-[#7A6A58]">No recorded payments.</p>
                      ) : (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full min-w-[520px] border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-border text-left text-[#7A6A58]">
                                <th className="py-2 pr-2 font-medium">When</th>
                                <th className="py-2 pr-2 font-medium">Method</th>
                                <th className="py-2 pr-2 font-medium text-right">Amount</th>
                                <th className="py-2 pr-2 font-medium">Status</th>
                                <th className="py-2 pr-2 font-medium">Ref</th>
                                <th className="py-2 font-medium">Cashier</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.payments.map((p) => (
                                <tr key={p.id} className="border-b border-border/60">
                                  <td className="py-2 pr-2 text-[#5C4F42]">
                                    {formatDateTimeAmPm(p.paidAt)}
                                  </td>
                                  <td className="py-2 pr-2">{p.method}</td>
                                  <td className="py-2 pr-2 text-right tabular-nums font-medium">
                                    {formatEGP(p.amount)}
                                  </td>
                                  <td className="py-2 pr-2">{p.status}</td>
                                  <td className="py-2 pr-2 font-mono text-[10px] text-[#5C4F42]">
                                    {p.referenceNumber ?? "—"}
                                  </td>
                                  <td className="py-2">{p.cashierName ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>

                    <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                        Metadata
                      </h3>
                      <dl className="mt-3 grid gap-2 font-mono text-[11px] text-[#5C4F42] sm:grid-cols-2">
                        <div>
                          <dt className="font-sans text-xs text-[#7A6A58]">Invoice ID</dt>
                          <dd className="break-all">{detail.id}</dd>
                        </div>
                        <div>
                          <dt className="font-sans text-xs text-[#7A6A58]">Branch ID</dt>
                          <dd className="break-all">{detail.branch?.id ?? detail.booking?.branchId ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="font-sans text-xs text-[#7A6A58]">Created</dt>
                          <dd className="break-all">{formatDateTimeAmPm(detail.createdAt)}</dd>
                        </div>
                        <div>
                          <dt className="font-sans text-xs text-[#7A6A58]">Updated</dt>
                          <dd className="break-all">{formatDateTimeAmPm(detail.updatedAt)}</dd>
                        </div>
                        {detail.finalizedAt ? (
                          <div>
                            <dt className="font-sans text-xs text-[#7A6A58]">Finalized</dt>
                            <dd className="break-all">{formatDateTimeAmPm(detail.finalizedAt)}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </section>

                    {canEdit ? (
                      <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                          Restricted edit
                        </h3>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="text-sm">
                            <span className="mb-1 block font-medium text-[#1F2420]">Status</span>
                            <select
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value)}
                              className="w-full rounded-lg border border-border bg-white px-3 py-2"
                            >
                              <option value="">No change</option>
                              <option value="CANCELLED">CANCELLED</option>
                            </select>
                          </label>
                          <label className="text-sm">
                            <span className="mb-1 block font-medium text-[#1F2420]">
                              Payment method
                            </span>
                            <select
                              value={editPaymentMethod}
                              onChange={(e) => setEditPaymentMethod(e.target.value)}
                              className="w-full rounded-lg border border-border bg-white px-3 py-2"
                            >
                              <option value="">Unset</option>
                              {PAYMENT_METHOD_OPTIONS.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            disabled={editLoading}
                            onClick={() => void onPatchInvoice()}
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                          >
                            {editLoading ? "Updating…" : "Update invoice"}
                          </button>
                        </div>
                        {editError ? (
                          <p className="mt-3 rounded-lg border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                            {editError}
                          </p>
                        ) : null}
                      </section>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        ) : null}
      </section>
    </PermissionGuard>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF9EE] text-[#5C4030]">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-[#7A6A58]">{label}</p>
          <p className="mt-1 truncate text-lg font-semibold tracking-tight text-[#1F2420]">{value}</p>
          {hint ? <p className="mt-1 text-xs text-[#A89480]">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}
