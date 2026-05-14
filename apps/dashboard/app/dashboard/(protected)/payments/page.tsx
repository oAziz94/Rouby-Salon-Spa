"use client";

import {
  ApiClientError,
  getDashboardBookingById,
  getDashboardBookingPayments,
  getDashboardBookings,
  getDashboardBranches,
  getDashboardInvoiceById,
  getDashboardInvoices,
  getDashboardPaymentDetail,
  getDashboardPayments,
  patchDashboardBookingPaymentStatus,
  patchDashboardPayment,
  postDashboardBookingPayment,
  postDashboardInvoicePayment,
  type DashboardBookingsListItem,
  type DashboardBranch,
  type DashboardInvoiceListItem,
  type DashboardPayment,
  type DashboardPaymentDetailResponse,
  type DashboardPaymentListRow,
  type SimplePaymentAggregateStatus,
} from "@rouby/api-client";
import { formatDateTimeAmPm } from "@rouby/wall-clock";
import {
  Banknote,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileText,
  Filter,
  Loader2,
  MoreHorizontal,
  Printer,
  RefreshCw,
  Search,
  Smartphone,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

const PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "INSTAPAY",
  "MOBILE_WALLET",
  "BANK_TRANSFER",
] as const;

type ListPhase = "idle" | "loading" | "ready" | "empty" | "error";

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

function methodLabel(m: string): string {
  switch (m) {
    case "CASH":
      return "Cash";
    case "CARD":
      return "Card";
    case "INSTAPAY":
      return "Instapay";
    case "MOBILE_WALLET":
      return "Wallet";
    case "BANK_TRANSFER":
      return "Bank transfer";
    default:
      return m;
  }
}

function methodIcon(m: string) {
  switch (m) {
    case "CASH":
      return Banknote;
    case "CARD":
      return CreditCard;
    case "INSTAPAY":
    case "MOBILE_WALLET":
      return Smartphone;
    case "BANK_TRANSFER":
      return Building2;
    default:
      return Wallet;
  }
}

function paymentRowStatusLabel(status: string): string {
  switch (status) {
    case "PAID":
      return "Successful";
    case "CANCELLED":
      return "Cancelled";
    case "REFUNDED":
      return "Refunded";
    case "UNPAID":
    case "PARTIALLY_PAID":
      return "Recorded";
    default:
      return status;
  }
}

function paymentRowStatusClass(status: string): string {
  switch (status) {
    case "PAID":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "CANCELLED":
      return "border-neutral-200 bg-neutral-100 text-neutral-700";
    case "REFUNDED":
      return "border-amber-200 bg-amber-50 text-amber-900";
    default:
      return "border-[#E8E0D4] bg-[#FFFCF7] text-[#5C5348]";
  }
}

function bookingSourceLabel(source: string): string {
  switch (source) {
    case "WALK_IN":
      return "Walk-in";
    case "WEBSITE":
      return "Online";
    case "DASHBOARD":
      return "Dashboard";
    case "PHONE":
      return "Phone";
    case "WHATSAPP":
      return "WhatsApp";
    case "INSTAGRAM":
      return "Instagram";
    case "FACEBOOK":
      return "Facebook";
    default:
      return source;
  }
}

function invoicePayBadgeClass(s: string | null | undefined): string {
  switch (s) {
    case "PAID":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "PARTIALLY_PAID":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "UNPAID":
    default:
      return "border-[#E8E0D4] bg-white text-[#5C5348]";
  }
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidV4(value: string): boolean {
  return UUID_V4_RE.test(value.trim());
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

type FilterForm = {
  search: string;
  method: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  branchId: string;
};

export default function DashboardPaymentsPage() {
  const { token, hasPermission, user } = useDashboardAuth();
  const canRead = hasPermission("payments.read");
  const canRecord = hasPermission("payments.record");
  const canPrint = hasPermission("invoices.print") || hasPermission("invoices.read");
  const canOpenInvoice = hasPermission("invoices.read");
  const canOpenBooking = hasPermission("bookings.read");
  const canUpdatePayment = hasPermission("payments.record") || hasPermission("payments.refund");
  const canRecordSimple = hasPermission("payments.record_simple");
  const canReadBranches = hasPermission("branches.read");
  const canAccessMultipleBranches = user?.branchId === null && canReadBranches;

  const defaultFilters = useMemo<FilterForm>(
    () => ({
      search: "",
      method: "",
      status: "",
      dateFrom: "",
      dateTo: "",
      branchId: "",
    }),
    [],
  );

  const [draftFilters, setDraftFilters] = useState<FilterForm>({ ...defaultFilters });
  const [appliedFilters, setAppliedFilters] = useState<FilterForm>({ ...defaultFilters });
  const filtersDefault = useMemo(
    () =>
      !appliedFilters.search.trim() &&
      !appliedFilters.method &&
      !appliedFilters.status &&
      !appliedFilters.dateFrom &&
      !appliedFilters.dateTo &&
      !appliedFilters.branchId,
    [appliedFilters],
  );
  const [page, setPage] = useState(1);
  const [listPhase, setListPhase] = useState<ListPhase>("idle");
  const [listError, setListError] = useState("");
  const [rows, setRows] = useState<DashboardPaymentListRow[]>([]);
  const [summary, setSummary] = useState<{
    totalCollected: number;
    cashCollected: number;
    cardDigitalCollected: number;
    outstandingBalance: number;
    paymentsTodayCount: number;
    paymentsTodayTotal: number;
  } | null>(null);
  const [meta, setMeta] = useState<{
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
  } | null>(null);

  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [drawerData, setDrawerData] = useState<DashboardPaymentDetailResponse | null>(null);
  const [techOpen, setTechOpen] = useState(false);

  const [recordOpen, setRecordOpen] = useState(false);
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [invoiceRows, setInvoiceRows] = useState<DashboardInvoiceListItem[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<DashboardInvoiceListItem | null>(null);
  const [recordAmount, setRecordAmount] = useState("");
  const [recordMethod, setRecordMethod] = useState<string>("CASH");
  const [recordReference, setRecordReference] = useState("");
  const [recordNotes, setRecordNotes] = useState("");
  const [recordError, setRecordError] = useState("");
  const [recordSaving, setRecordSaving] = useState(false);
  const [advancedInvoiceId, setAdvancedInvoiceId] = useState("");
  const [advancedInvoiceOpen, setAdvancedInvoiceOpen] = useState(false);

  const [legacyOpen, setLegacyOpen] = useState(false);
  const [bookingRows, setBookingRows] = useState<DashboardBookingsListItem[]>([]);
  const [bookingLoad, setBookingLoad] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [legacyPayments, setLegacyPayments] = useState<DashboardPayment[]>([]);
  const [legacySummary, setLegacySummary] = useState<Awaited<
    ReturnType<typeof getDashboardBookingById>
  > | null>(null);
  const [legacyPaymentsLoad, setLegacyPaymentsLoad] = useState(false);
  const [simpleStatus, setSimpleStatus] = useState<SimplePaymentAggregateStatus>("UNPAID");
  const [simpleAmount, setSimpleAmount] = useState("");
  const [simpleError, setSimpleError] = useState("");
  const [simpleSaving, setSimpleSaving] = useState(false);
  const [bookingPayModal, setBookingPayModal] = useState(false);
  const [bookingPayAmount, setBookingPayAmount] = useState("");
  const [bookingPayMethod, setBookingPayMethod] = useState("CASH");
  const [bookingPayStatus, setBookingPayStatus] = useState("PAID");
  const [bookingPayRef, setBookingPayRef] = useState("");
  const [bookingPayPaidAt, setBookingPayPaidAt] = useState("");
  const [bookingPayError, setBookingPayError] = useState("");
  const [bookingPaySaving, setBookingPaySaving] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<DashboardPayment | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMethod, setEditMethod] = useState("CASH");
  const [editStatus, setEditStatus] = useState("PAID");
  const [editReference, setEditReference] = useState("");
  const [editPaidAt, setEditPaidAt] = useState("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!token || !canReadBranches) {
      setBranches([]);
      return;
    }
    let cancelled = false;
    void getDashboardBranches(token)
      .then((b) => {
        if (!cancelled) setBranches(Array.isArray(b) ? b : []);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canReadBranches, token]);

  const buildListQuery = useCallback(() => {
    const q: Parameters<typeof getDashboardPayments>[1] = {
      page,
      pageSize: 20,
      search: appliedFilters.search.trim() || undefined,
      dateFrom: appliedFilters.dateFrom || undefined,
      dateTo: appliedFilters.dateTo || undefined,
    };
    if (appliedFilters.method) q.method = appliedFilters.method;
    if (appliedFilters.status) q.status = appliedFilters.status;
    if (appliedFilters.branchId && isUuidV4(appliedFilters.branchId)) {
      q.branchId = appliedFilters.branchId.trim();
    }
    return q;
  }, [appliedFilters, page]);

  const loadPaymentsList = useCallback(async () => {
    if (!token || !canRead) return;
    setListPhase("loading");
    setListError("");
    try {
      const res = await getDashboardPayments(token, buildListQuery());
      const data = Array.isArray(res.data) ? res.data : [];
      const total = res.meta?.totalItems ?? 0;
      setRows(data);
      setMeta(res.meta ?? null);
      setSummary(res.summary ?? null);
      if (total === 0 && filtersDefault) {
        setListPhase("empty");
      } else {
        setListPhase("ready");
      }
    } catch (e) {
      setListError(formatApiError(e));
      setListPhase("error");
      setRows([]);
      setMeta(null);
      setSummary(null);
    }
  }, [buildListQuery, canRead, filtersDefault, token]);

  useEffect(() => {
    void loadPaymentsList();
  }, [loadPaymentsList]);

  const openDrawerForPayment = useCallback(
    async (paymentId: string) => {
      if (!token || !canRead) return;
      setDrawerOpen(true);
      setDrawerLoading(true);
      setDrawerError("");
      setDrawerData(null);
      setTechOpen(false);
      try {
        const d = await getDashboardPaymentDetail(token, paymentId);
        setDrawerData(d);
      } catch (e) {
        setDrawerError(formatApiError(e));
      } finally {
        setDrawerLoading(false);
      }
    },
    [canRead, token],
  );

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setDrawerData(null);
    setDrawerError("");
    setTechOpen(false);
  }, []);

  const loadLegacyBookings = useCallback(async () => {
    if (!token || !canRead) return;
    setBookingLoad(true);
    setBookingError("");
    try {
      const res = await getDashboardBookings(token, { page: 1, pageSize: 50 });
      const list = Array.isArray(res.data) ? res.data : [];
      setBookingRows(list);
      setSelectedBookingId((prev) => prev || list[0]?.id || "");
    } catch (e) {
      setBookingError(formatApiError(e));
    } finally {
      setBookingLoad(false);
    }
  }, [canRead, token]);

  useEffect(() => {
    if (legacyOpen) void loadLegacyBookings();
  }, [legacyOpen, loadLegacyBookings]);

  const loadLegacyPayments = useCallback(async () => {
    if (!token || !selectedBookingId || !canRead) return;
    setLegacyPaymentsLoad(true);
    try {
      const [bookingRes, payRes] = await Promise.all([
        getDashboardBookingById(token, selectedBookingId),
        getDashboardBookingPayments(token, selectedBookingId),
      ]);
      setLegacySummary(bookingRes);
      setLegacyPayments(payRes.payments);
    } catch {
      setLegacySummary(null);
      setLegacyPayments([]);
    } finally {
      setLegacyPaymentsLoad(false);
    }
  }, [canRead, selectedBookingId, token]);

  useEffect(() => {
    if (legacyOpen && selectedBookingId) void loadLegacyPayments();
  }, [legacyOpen, loadLegacyPayments, selectedBookingId]);

  const loadInvoicesForModal = useCallback(async () => {
    if (!token || !canOpenInvoice || !recordOpen) return;
    setInvoiceLoading(true);
    try {
      const res = await getDashboardInvoices(token, {
        status: "FINALIZED",
        page: 1,
        pageSize: 80,
        search: invoiceQuery.trim() || undefined,
      });
      setInvoiceRows(Array.isArray(res.data) ? res.data : []);
    } catch {
      setInvoiceRows([]);
    } finally {
      setInvoiceLoading(false);
    }
  }, [canOpenInvoice, invoiceQuery, recordOpen, token]);

  useEffect(() => {
    if (!recordOpen) return;
    const t = window.setTimeout(() => {
      void loadInvoicesForModal();
    }, 280);
    return () => window.clearTimeout(t);
  }, [loadInvoicesForModal, recordOpen]);

  const selectableInvoices = useMemo(
    () => invoiceRows.filter((inv) => inv.status === "FINALIZED" && inv.remainingAmount > 0.009),
    [invoiceRows],
  );

  const applyAdvancedInvoiceId = useCallback(async () => {
    const id = normalizeUuidInput(advancedInvoiceId);
    if (!token || !id || !canOpenInvoice) return;
    setInvoiceLoading(true);
    try {
      const inv = await getDashboardInvoiceById(token, id);
      if (inv.status === "FINALIZED" && inv.remainingAmount > 0) {
        setSelectedInvoice(inv);
        setRecordAmount(String(inv.remainingAmount));
        setAdvancedInvoiceOpen(false);
        setAdvancedInvoiceId("");
      } else {
        setRecordError("Invoice must be finalized with an outstanding balance.");
      }
    } catch (e) {
      setRecordError(formatApiError(e));
    } finally {
      setInvoiceLoading(false);
    }
  }, [advancedInvoiceId, canOpenInvoice, token]);

  const onRecordInvoicePayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !selectedInvoice) return;
    const amt = Number(recordAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setRecordError("Enter a valid amount greater than zero.");
      return;
    }
    if (amt > selectedInvoice.remainingAmount + 0.001) {
      setRecordError("Amount cannot exceed the invoice remaining balance.");
      return;
    }
    if (!recordMethod) {
      setRecordError("Select a payment method.");
      return;
    }
    if (recordMethod !== "CASH" && !recordReference.trim()) {
      setRecordError("Reference number is recommended for non-cash methods.");
      return;
    }
    setRecordSaving(true);
    setRecordError("");
    try {
      const res = await postDashboardInvoicePayment(token, selectedInvoice.id, {
        amount: amt,
        method: recordMethod,
        referenceNumber: recordReference.trim() || undefined,
        notes: recordNotes.trim() || undefined,
      });
      setRecordOpen(false);
      setSelectedInvoice(null);
      setRecordAmount("");
      setRecordReference("");
      setRecordNotes("");
      setToast({ message: "Payment recorded successfully.", tone: "success" });
      await loadPaymentsList();
      void openDrawerForPayment(res.payment.id);
    } catch (err) {
      setRecordError(formatApiError(err));
    } finally {
      setRecordSaving(false);
    }
  };

  const onApplyFilters = (e?: FormEvent) => {
    e?.preventDefault();
    setAppliedFilters({ ...draftFilters });
    setPage(1);
  };

  const onClearFilters = () => {
    setDraftFilters({ ...defaultFilters });
    setAppliedFilters({ ...defaultFilters });
    setPage(1);
  };

  const chips = useMemo(() => {
    const c: { key: string; label: string }[] = [];
    if (appliedFilters.search.trim()) {
      c.push({ key: "search", label: `Search: ${appliedFilters.search.trim()}` });
    }
    if (appliedFilters.method) {
      c.push({ key: "method", label: `Method: ${methodLabel(appliedFilters.method)}` });
    }
    if (appliedFilters.status) {
      c.push({ key: "status", label: `Status: ${paymentRowStatusLabel(appliedFilters.status)}` });
    }
    if (appliedFilters.dateFrom) {
      c.push({ key: "df", label: `From: ${appliedFilters.dateFrom}` });
    }
    if (appliedFilters.dateTo) {
      c.push({ key: "dt", label: `To: ${appliedFilters.dateTo}` });
    }
    if (appliedFilters.branchId) {
      const name = branches.find((b) => b.id === appliedFilters.branchId)?.name;
      c.push({ key: "br", label: `Branch: ${name ?? "Selected"}` });
    }
    return c;
  }, [appliedFilters, branches]);

  const removeChip = (key: string) => {
    const next = { ...draftFilters };
    if (key === "search") next.search = "";
    if (key === "method") next.method = "";
    if (key === "status") next.status = "";
    if (key === "df") next.dateFrom = "";
    if (key === "dt") next.dateTo = "";
    if (key === "br") next.branchId = "";
    setDraftFilters(next);
    setAppliedFilters(next);
    setPage(1);
  };

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

  async function onUpdatePayment(ev: FormEvent) {
    ev.preventDefault();
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
      await loadLegacyPayments();
      await loadPaymentsList();
    } catch (err) {
      setEditError(formatApiError(err));
    } finally {
      setEditSaving(false);
    }
  }

  async function onBookingRecordPayment(ev: FormEvent) {
    ev.preventDefault();
    if (!token || !selectedBookingId) return;
    setBookingPaySaving(true);
    setBookingPayError("");
    try {
      await postDashboardBookingPayment(token, selectedBookingId, {
        amount: Number(bookingPayAmount),
        method: bookingPayMethod,
        status: bookingPayStatus,
        reference: bookingPayRef || null,
        paidAt: bookingPayPaidAt ? new Date(bookingPayPaidAt).toISOString() : null,
      });
      setBookingPayModal(false);
      await loadLegacyPayments();
      await loadPaymentsList();
    } catch (err) {
      setBookingPayError(formatApiError(err));
    } finally {
      setBookingPaySaving(false);
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
      await loadLegacyPayments();
      await loadPaymentsList();
    } catch (err) {
      setSimpleError(formatApiError(err));
    } finally {
      setSimpleSaving(false);
    }
  }

  return (
    <PermissionGuard permission="payments.read">
      <div className="space-y-6 pb-10">
        <header className="flex flex-col gap-4 rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7] p-6 shadow-[0_8px_30px_rgba(31,36,32,0.06)] sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1F2420]">Payments</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#7A6A58]">
              Track collected payments, payment methods, outstanding balances, and customer billing
              activity.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadPaymentsList()}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E8E0D4] bg-white px-4 py-2.5 text-sm font-medium text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            {canRecord ? (
              <button
                type="button"
                onClick={() => {
                  setRecordOpen(true);
                  setSelectedInvoice(null);
                  setRecordAmount("");
                  setRecordMethod("CASH");
                  setRecordReference("");
                  setRecordNotes("");
                  setRecordError("");
                  setInvoiceQuery("");
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0E342B] px-4 py-2.5 text-sm font-semibold text-[#FFFCF7] shadow-md shadow-[#0E342B]/25 transition hover:bg-[#062A2D]"
              >
                Record payment
              </button>
            ) : null}
          </div>
        </header>

        {toast ? (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              toast.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {toast.message}
          </div>
        ) : null}

        {/* Summary */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {listPhase === "loading" && !summary ? (
            <>
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7]/80"
                />
              ))}
            </>
          ) : summary ? (
            <>
              <article className="rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7] p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">
                  Total collected
                </p>
                <p className="mt-2 text-xl font-bold tabular-nums text-[#1F2420]">
                  {formatEGP(summary.totalCollected)}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-[#9A8B7A]">
                  Sum of successful payments matching current filters.
                </p>
              </article>
              <article className="rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7] p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">
                  Cash collected
                </p>
                <p className="mt-2 text-xl font-bold tabular-nums text-[#1F2420]">
                  {formatEGP(summary.cashCollected)}
                </p>
              </article>
              <article className="rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7] p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">
                  Card / digital
                </p>
                <p className="mt-2 text-xl font-bold tabular-nums text-[#1F2420]">
                  {formatEGP(summary.cardDigitalCollected)}
                </p>
              </article>
              <article className="rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7] p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">
                  Outstanding balance
                </p>
                <p className="mt-2 text-xl font-bold tabular-nums text-[#B45309]">
                  {formatEGP(summary.outstandingBalance)}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-[#9A8B7A]">
                  Finalized invoices with balance in your branch scope (not narrowed by payment
                  search).
                </p>
              </article>
              <article className="rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7] p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A58]">
                  Payments today
                </p>
                <p className="mt-2 text-xl font-bold tabular-nums text-[#1F2420]">
                  {summary.paymentsTodayCount}{" "}
                  <span className="text-base font-semibold text-[#7A6A58]">
                    ({formatEGP(summary.paymentsTodayTotal)})
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-[#9A8B7A]">UTC calendar day.</p>
              </article>
            </>
          ) : null}
        </section>

        {/* Filters */}
        <section className="rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7] p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-[#B9974A]" />
            <h2 className="text-sm font-semibold text-[#1F2420]">Filters</h2>
          </div>
          <form
            className="grid gap-3 md:grid-cols-2 lg:grid-cols-12 lg:items-end"
            onSubmit={onApplyFilters}
          >
            <label className="text-sm lg:col-span-4">
              <span className="mb-1 block font-medium text-[#1F2420]">Search</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A8B7A]" />
                <input
                  value={draftFilters.search}
                  onChange={(ev) => setDraftFilters((f) => ({ ...f, search: ev.target.value }))}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      onApplyFilters();
                    }
                  }}
                  placeholder="Invoice, client, phone, reference, booking…"
                  className="w-full rounded-xl border border-[#E8E0D4] bg-white py-2.5 pl-10 pr-3 text-sm text-[#1F2420] shadow-inner"
                />
              </div>
            </label>
            <label className="text-sm lg:col-span-2">
              <span className="mb-1 block font-medium text-[#1F2420]">Method</span>
              <select
                value={draftFilters.method}
                onChange={(ev) => setDraftFilters((f) => ({ ...f, method: ev.target.value }))}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm"
              >
                <option value="">All</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {methodLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm lg:col-span-2">
              <span className="mb-1 block font-medium text-[#1F2420]">Payment status</span>
              <select
                value={draftFilters.status}
                onChange={(ev) => setDraftFilters((f) => ({ ...f, status: ev.target.value }))}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm"
              >
                <option value="">All</option>
                <option value="PAID">Successful</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </label>
            <label className="text-sm lg:col-span-2">
              <span className="mb-1 block font-medium text-[#1F2420]">Date from</span>
              <input
                type="date"
                value={draftFilters.dateFrom}
                onChange={(ev) => setDraftFilters((f) => ({ ...f, dateFrom: ev.target.value }))}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm"
              />
            </label>
            <label className="text-sm lg:col-span-2">
              <span className="mb-1 block font-medium text-[#1F2420]">Date to</span>
              <input
                type="date"
                value={draftFilters.dateTo}
                onChange={(ev) => setDraftFilters((f) => ({ ...f, dateTo: ev.target.value }))}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm"
              />
            </label>
            {canAccessMultipleBranches ? (
              <label className="text-sm lg:col-span-2">
                <span className="mb-1 block font-medium text-[#1F2420]">Branch</span>
                <select
                  value={draftFilters.branchId}
                  onChange={(ev) => setDraftFilters((f) => ({ ...f, branchId: ev.target.value }))}
                  className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">All branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name ?? b.id}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="flex flex-wrap gap-2 lg:col-span-12">
              <button
                type="submit"
                className="rounded-xl bg-[#0E342B] px-4 py-2.5 text-sm font-semibold text-[#FFFCF7] shadow-md"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={onClearFilters}
                className="rounded-xl border border-[#E8E0D4] bg-white px-4 py-2.5 text-sm font-medium text-[#1F2420]"
              >
                Clear filters
              </button>
            </div>
          </form>
          {chips.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => removeChip(c.key)}
                  className="inline-flex items-center gap-1 rounded-full border border-[#B9974A]/40 bg-[#B9974A]/10 px-3 py-1 text-xs font-medium text-[#5C4A22]"
                >
                  {c.label}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {/* List */}
        <section className="rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7] p-4 shadow-sm md:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-[#1F2420]">All payments</h2>
            {meta ? (
              <p className="text-xs text-[#7A6A58]">
                Page {meta.page} of {Math.max(meta.totalPages, 1)} · {meta.totalItems} total
              </p>
            ) : null}
          </div>

          {listPhase === "loading" ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-xl border border-[#E8E0D4] bg-white/60"
                />
              ))}
            </div>
          ) : null}

          {listPhase === "error" ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p className="font-medium">Could not load payments</p>
              <p className="mt-1 text-red-800/90">{listError}</p>
              <button
                type="button"
                onClick={() => void loadPaymentsList()}
                className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium"
              >
                Retry
              </button>
            </div>
          ) : null}

          {listPhase === "empty" && !listError ? (
            <div className="rounded-xl border border-dashed border-[#E8E0D4] bg-white/50 px-6 py-12 text-center">
              <Calendar className="mx-auto h-10 w-10 text-[#B9974A]/70" />
              <p className="mt-3 text-lg font-semibold text-[#1F2420]">No payments recorded yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#7A6A58]">
                Payments will appear here after invoices are paid from bookings, queue visits, or
                this page.
              </p>
              {canRecord ? (
                <button
                  type="button"
                  onClick={() => setRecordOpen(true)}
                  className="mt-6 rounded-xl bg-[#0E342B] px-5 py-2.5 text-sm font-semibold text-[#FFFCF7]"
                >
                  Record payment
                </button>
              ) : null}
            </div>
          ) : null}

          {listPhase === "ready" && rows.length === 0 && !filtersDefault ? (
            <div className="rounded-xl border border-dashed border-[#E8E0D4] bg-white/50 px-6 py-12 text-center">
              <Search className="mx-auto h-10 w-10 text-[#B9974A]/70" />
              <p className="mt-3 text-lg font-semibold text-[#1F2420]">No matching payments</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#7A6A58]">
                Try changing filters or clearing the search.
              </p>
              <button
                type="button"
                onClick={onClearFilters}
                className="mt-6 rounded-xl border border-[#E8E0D4] bg-white px-5 py-2.5 text-sm font-medium text-[#1F2420]"
              >
                Clear filters
              </button>
            </div>
          ) : null}

          {listPhase === "ready" && rows.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E8E0D4] text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                      <th className="py-3 pr-3">Payment</th>
                      <th className="py-3 pr-3">Customer</th>
                      <th className="py-3 pr-3">Invoice</th>
                      <th className="py-3 pr-3">Booking</th>
                      <th className="py-3 pr-3 text-right">Amount</th>
                      <th className="py-3 pr-3">Status</th>
                      <th className="py-3 pr-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const MIcon = methodIcon(r.method);
                      return (
                        <tr
                          key={r.paymentId}
                          className="cursor-pointer border-b border-[#E8E0D4]/60 transition hover:bg-[#FFF9EE]"
                          onClick={() => void openDrawerForPayment(r.paymentId)}
                        >
                          <td className="py-3 pr-3 align-top">
                            <p className="font-medium text-[#1F2420]">{r.paymentReference}</p>
                            <p className="mt-0.5 text-xs text-[#7A6A58]">
                              {r.paidAt ? formatDateTimeAmPm(r.paidAt) : formatDateTimeAmPm(r.recordedAt)}
                            </p>
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-[#E8E0D4] bg-white px-2 py-0.5 text-xs font-medium text-[#1F2420]">
                              <MIcon className="h-3.5 w-3.5 text-[#B9974A]" />
                              {methodLabel(r.method)}
                            </span>
                          </td>
                          <td className="py-3 pr-3 align-top">
                            <p className="font-medium text-[#1F2420]">{r.clientName}</p>
                            <p className="text-xs text-[#7A6A58]">{r.clientPhone}</p>
                          </td>
                          <td className="py-3 pr-3 align-top">
                            {r.invoiceNumber ? (
                              <>
                                <p className="font-medium text-[#1F2420]">{r.invoiceNumber}</p>
                                <p className="text-xs text-[#7A6A58]">
                                  {r.invoiceTotal != null ? formatEGP(r.invoiceTotal) : "—"}
                                </p>
                                {r.invoiceId && canOpenInvoice ? (
                                  <Link
                                    href={`/dashboard/invoices?invoiceId=${r.invoiceId}`}
                                    className="mt-1 inline-block text-xs font-medium text-[#0E342B] underline-offset-2 hover:underline"
                                    onClick={(ev) => ev.stopPropagation()}
                                  >
                                    Open invoice
                                  </Link>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-xs text-[#9A8B7A]">No finalized invoice</span>
                            )}
                          </td>
                          <td className="py-3 pr-3 align-top">
                            <p className="font-medium text-[#1F2420]">{r.bookingReference}</p>
                            <span className="mt-1 inline-block rounded-full border border-[#E8E0D4] bg-white px-2 py-0.5 text-xs text-[#5C5348]">
                              {bookingSourceLabel(r.bookingSource)}
                            </span>
                            {r.bookingSlot ? (
                              <p className="mt-1 text-xs text-[#7A6A58]">
                                {r.bookingSlot.date} · {r.bookingSlot.startTime}
                              </p>
                            ) : null}
                          </td>
                          <td className="py-3 pr-3 text-right align-top">
                            <span className="text-lg font-bold tabular-nums text-[#1F2420]">
                              {formatEGP(r.amount)}
                            </span>
                          </td>
                          <td className="py-3 pr-3 align-top">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${paymentRowStatusClass(r.status)}`}
                            >
                              {paymentRowStatusLabel(r.status)}
                            </span>
                          </td>
                          <td className="py-3 pr-3 text-right align-top" onClick={(ev) => ev.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => void openDrawerForPayment(r.paymentId)}
                                className="rounded-lg border border-[#E8E0D4] bg-white px-2 py-1 text-xs font-medium"
                              >
                                View
                              </button>
                              {r.invoiceId && canPrint ? (
                                <Link
                                  href={`/dashboard/invoices/${r.invoiceId}/receipt?print=1`}
                                  className="rounded-lg border border-[#B9974A]/40 bg-[#B9974A]/10 px-2 py-1 text-xs font-medium text-[#5C4A22]"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Print
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {rows.map((r) => {
                  const MIcon = methodIcon(r.method);
                  return (
                    <button
                      key={r.paymentId}
                      type="button"
                      onClick={() => void openDrawerForPayment(r.paymentId)}
                      className="w-full rounded-2xl border border-[#E8E0D4] bg-white p-4 text-left shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-[#1F2420]">{formatEGP(r.amount)}</p>
                          <p className="mt-1 text-xs text-[#7A6A58]">{r.paymentReference}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${paymentRowStatusClass(r.status)}`}
                        >
                          {paymentRowStatusLabel(r.status)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#7A6A58]">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#E8E0D4] bg-[#FFFCF7] px-2 py-0.5 font-medium text-[#1F2420]">
                          <MIcon className="h-3.5 w-3.5 text-[#B9974A]" />
                          {methodLabel(r.method)}
                        </span>
                        <span>{r.clientName}</span>
                        {r.invoiceNumber ? <span>· {r.invoiceNumber}</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              {meta && meta.totalPages > 1 ? (
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!meta.hasNextPage}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        {/* Legacy */}
        {(canRecord || canRecordSimple || canUpdatePayment) && (
          <section className="rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7]/80 shadow-sm">
            <button
              type="button"
              onClick={() => setLegacyOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
            >
              <div>
                <p className="text-sm font-semibold text-[#1F2420]">
                  Advanced · legacy booking payment status
                </p>
                <p className="mt-1 text-xs text-[#7A6A58]">
                  Booking-level recording and simple aggregate status. Prefer invoice-based payments
                  above.
                </p>
              </div>
              {legacyOpen ? (
                <ChevronDown className="h-5 w-5 shrink-0 text-[#7A6A58]" />
              ) : (
                <ChevronRight className="h-5 w-5 shrink-0 text-[#7A6A58]" />
              )}
            </button>
            {legacyOpen ? (
              <div className="space-y-4 border-t border-[#E8E0D4] px-5 py-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Select booking</span>
                    <select
                      value={selectedBookingId}
                      onChange={(ev) => setSelectedBookingId(ev.target.value)}
                      className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Choose booking</option>
                      {bookingRows.map((row) => (
                        <option key={row.id} value={row.id}>
                          {bookingRefFromList(row)} — {row.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  {bookingLoad ? (
                    <p className="self-end text-xs text-[#7A6A58]">Loading bookings…</p>
                  ) : null}
                  {bookingError ? (
                    <p className="self-end text-xs text-red-700">{bookingError}</p>
                  ) : null}
                </div>

                {legacySummary ? (
                  <div className="grid gap-2 text-sm sm:grid-cols-3">
                    <div className="rounded-xl border border-[#E8E0D4] bg-white p-3">
                      <p className="text-xs text-[#7A6A58]">Total</p>
                      <p className="mt-1 font-semibold">{formatEGP(legacySummary.totalAmount)}</p>
                    </div>
                    <div className="rounded-xl border border-[#E8E0D4] bg-white p-3">
                      <p className="text-xs text-[#7A6A58]">Paid</p>
                      <p className="mt-1 font-semibold">{formatEGP(legacySummary.paidAmount)}</p>
                    </div>
                    <div className="rounded-xl border border-[#E8E0D4] bg-white p-3">
                      <p className="text-xs text-[#7A6A58]">Remaining</p>
                      <p className="mt-1 font-semibold">{formatEGP(legacySummary.remainingAmount)}</p>
                    </div>
                  </div>
                ) : null}

                {canRecord ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!selectedBookingId}
                      onClick={() => {
                        setBookingPayAmount("");
                        setBookingPayMethod("CASH");
                        setBookingPayStatus("PAID");
                        setBookingPayRef("");
                        setBookingPayPaidAt("");
                        setBookingPayError("");
                        setBookingPayModal(true);
                      }}
                      className="rounded-xl bg-[#0E342B] px-4 py-2 text-sm font-semibold text-[#FFFCF7] disabled:opacity-50"
                    >
                      Record booking payment
                    </button>
                  </div>
                ) : null}

                {legacyPaymentsLoad ? (
                  <p className="text-xs text-[#7A6A58]">Loading booking payments…</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#E8E0D4] text-[#7A6A58]">
                          <th className="py-2 pr-2">Amount</th>
                          <th className="py-2 pr-2">Method</th>
                          <th className="py-2 pr-2">Status</th>
                          <th className="py-2 pr-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {legacyPayments.map((p) => (
                          <tr key={p.id} className="border-b border-[#E8E0D4]/50">
                            <td className="py-2 pr-2">{formatEGP(p.amount)}</td>
                            <td className="py-2 pr-2">{p.method}</td>
                            <td className="py-2 pr-2">{p.status}</td>
                            <td className="py-2 pr-2">
                              {canUpdatePayment ? (
                                <button
                                  type="button"
                                  onClick={() => openEditModal(p)}
                                  className="rounded border border-[#E8E0D4] bg-white px-2 py-1"
                                >
                                  Update
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {canRecordSimple ? (
                  <div className="rounded-xl border border-[#E8E0D4] bg-white p-4">
                    <p className="text-sm font-semibold text-[#1F2420]">Simple payment status</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <label className="text-sm">
                        <span className="mb-1 block font-medium">Status</span>
                        <select
                          value={simpleStatus}
                          onChange={(ev) =>
                            setSimpleStatus(ev.target.value as SimplePaymentAggregateStatus)
                          }
                          className="w-full rounded-lg border border-[#E8E0D4] px-2 py-2"
                        >
                          <option value="UNPAID">UNPAID</option>
                          <option value="PARTIALLY_PAID">PARTIALLY_PAID</option>
                          <option value="PAID">PAID</option>
                        </select>
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block font-medium">Amount (partial)</span>
                        <input
                          type="number"
                          value={simpleAmount}
                          onChange={(ev) => setSimpleAmount(ev.target.value)}
                          disabled={simpleStatus !== "PARTIALLY_PAID"}
                          className="w-full rounded-lg border border-[#E8E0D4] px-2 py-2 disabled:bg-[#F5F1EA]"
                        />
                      </label>
                      <div className="self-end">
                        <button
                          type="button"
                          disabled={simpleSaving || !selectedBookingId}
                          onClick={() => void onApplySimpleStatus()}
                          className="w-full rounded-lg bg-[#0E342B] px-3 py-2 text-sm font-medium text-[#FFFCF7] disabled:opacity-50"
                        >
                          {simpleSaving ? "Applying…" : "Apply"}
                        </button>
                      </div>
                    </div>
                    {simpleError ? (
                      <p className="mt-2 text-xs text-red-700">{simpleError}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-[#2A1722]/40"
            aria-label="Close drawer"
            onClick={closeDrawer}
          />
          <aside className="relative flex h-full w-full max-w-full flex-col border-l border-[#E8E0D4] bg-[#FFFCF7] shadow-2xl sm:max-w-md">
            <div className="flex items-center justify-between border-b border-[#E8E0D4] px-4 py-3">
              <p className="text-sm font-semibold text-[#1F2420]">Payment details</p>
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-lg p-2 text-[#7A6A58] hover:bg-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {drawerLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[#B9974A]" />
                </div>
              ) : null}
              {drawerError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {drawerError}
                </p>
              ) : null}
              {drawerData ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-3xl font-bold tabular-nums text-[#1F2420]">
                      {formatEGP(drawerData.payment.amount)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#E8E0D4] bg-white px-2.5 py-1 text-xs font-semibold">
                        {(() => {
                          const Ic = methodIcon(drawerData.payment.method);
                          return (
                            <>
                              <Ic className="h-3.5 w-3.5 text-[#B9974A]" />
                              {methodLabel(drawerData.payment.method)}
                            </>
                          );
                        })()}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${paymentRowStatusClass(drawerData.payment.status)}`}
                      >
                        {paymentRowStatusLabel(drawerData.payment.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[#7A6A58]">
                      {drawerData.payment.paidAt
                        ? formatDateTimeAmPm(drawerData.payment.paidAt)
                        : formatDateTimeAmPm(drawerData.payment.createdAt)}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {drawerData.invoice && canOpenInvoice ? (
                        <Link
                          href={`/dashboard/invoices?invoiceId=${drawerData.invoice.id}`}
                          className="inline-flex items-center gap-1 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-xs font-medium text-[#0E342B]"
                        >
                          <FileText className="h-4 w-4" />
                          Open invoice
                        </Link>
                      ) : null}
                      {drawerData.invoice && canPrint ? (
                        <Link
                          href={`/dashboard/invoices/${drawerData.invoice.id}/receipt?print=1`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-xl border border-[#B9974A]/40 bg-[#B9974A]/12 px-3 py-2 text-xs font-medium text-[#5C4A22]"
                        >
                          <Printer className="h-4 w-4" />
                          Print receipt
                        </Link>
                      ) : null}
                      {canOpenBooking ? (
                        <Link
                          href={`/dashboard/bookings?bookingId=${drawerData.booking.id}`}
                          className="inline-flex items-center gap-1 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-xs font-medium text-[#1F2420]"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          Open booking
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-[#7A6A58]">
                      Customer
                    </h3>
                    <p className="mt-1 font-medium text-[#1F2420]">{drawerData.client.fullName}</p>
                    <p className="text-sm text-[#7A6A58]">{drawerData.client.phone}</p>
                    {drawerData.client.email ? (
                      <p className="text-sm text-[#7A6A58]">{drawerData.client.email}</p>
                    ) : null}
                  </section>

                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-[#7A6A58]">
                      Invoice
                    </h3>
                    {drawerData.invoice ? (
                      <div className="mt-1 space-y-1 text-sm">
                        <p>
                          <span className="text-[#7A6A58]">Number: </span>
                          <span className="font-medium">{drawerData.invoice.invoiceNumber}</span>
                        </p>
                        <p>
                          <span className="text-[#7A6A58]">Status: </span>
                          {drawerData.invoice.status}
                        </p>
                        <p>
                          <span className="text-[#7A6A58]">Payment status: </span>
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${invoicePayBadgeClass(drawerData.invoice.paymentStatus)}`}
                          >
                            {drawerData.invoice.paymentStatus.replaceAll("_", " ")}
                          </span>
                        </p>
                        <p>
                          <span className="text-[#7A6A58]">Total: </span>
                          {formatEGP(drawerData.invoice.totalAmount)}
                        </p>
                        <p>
                          <span className="text-[#7A6A58]">Paid: </span>
                          {formatEGP(drawerData.invoice.paidAmount)}
                        </p>
                        <p>
                          <span className="text-[#7A6A58]">Remaining: </span>
                          {formatEGP(drawerData.invoice.remainingAmount)}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-[#9A8B7A]">No finalized invoice linked.</p>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-[#7A6A58]">
                      Booking
                    </h3>
                    <p className="mt-1 font-medium text-[#1F2420]">{drawerData.booking.reference}</p>
                    <p className="text-sm text-[#7A6A58]">
                      {bookingSourceLabel(drawerData.booking.source)} ·{" "}
                      {formatDateTimeAmPm(drawerData.booking.createdAt)}
                    </p>
                    {drawerData.booking.slot ? (
                      <p className="text-sm text-[#7A6A58]">
                        Slot {drawerData.booking.slot.date} {drawerData.booking.slot.startTime}–
                        {drawerData.booking.slot.endTime}
                      </p>
                    ) : null}
                    {drawerData.booking.servicesSummary ? (
                      <p className="mt-2 text-sm text-[#1F2420]">{drawerData.booking.servicesSummary}</p>
                    ) : null}
                  </section>

                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-[#7A6A58]">
                      Payment details
                    </h3>
                    <dl className="mt-1 space-y-1 text-sm">
                      <div>
                        <dt className="text-[#7A6A58]">Method</dt>
                        <dd className="font-medium">{methodLabel(drawerData.payment.method)}</dd>
                      </div>
                      <div>
                        <dt className="text-[#7A6A58]">Reference</dt>
                        <dd>{drawerData.payment.reference ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[#7A6A58]">Notes</dt>
                        <dd>{drawerData.payment.notes ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[#7A6A58]">Cashier</dt>
                        <dd>{drawerData.payment.cashierName ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[#7A6A58]">Branch</dt>
                        <dd>{drawerData.branch.name ?? "—"}</dd>
                      </div>
                    </dl>
                  </section>

                  <section>
                    <button
                      type="button"
                      onClick={() => setTechOpen((v) => !v)}
                      className="flex w-full items-center justify-between rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-left text-xs font-semibold text-[#5C5348]"
                    >
                      Technical details
                      {techOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    {techOpen ? (
                      <div className="mt-2 rounded-xl border border-dashed border-[#E8E0D4] bg-white/80 p-3 font-mono text-[11px] text-[#5C5348]">
                        <p>paymentId: {drawerData.payment.id}</p>
                        {drawerData.invoice ? <p>invoiceId: {drawerData.invoice.id}</p> : null}
                        <p>bookingId: {drawerData.booking.id}</p>
                        <p>clientId: {drawerData.client.id}</p>
                      </div>
                    ) : null}
                  </section>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {/* Record payment modal */}
      {recordOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2A1722]/40 p-4">
          <section className="mx-auto mt-6 w-full max-w-lg rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7] p-6 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-[#1F2420]">Record payment</h2>
              <button
                type="button"
                onClick={() => setRecordOpen(false)}
                className="rounded-lg p-1 text-[#7A6A58] hover:bg-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={onRecordInvoicePayment}>
              <div>
                <label className="text-sm font-medium text-[#1F2420]">Invoice</label>
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A8B7A]" />
                  <input
                    value={invoiceQuery}
                    onChange={(ev) => setInvoiceQuery(ev.target.value)}
                    placeholder="Search invoice #, client, phone…"
                    className="w-full rounded-xl border border-[#E8E0D4] bg-white py-2.5 pl-10 pr-3 text-sm"
                  />
                </div>
                {invoiceLoading ? (
                  <p className="mt-2 text-xs text-[#7A6A58]">Loading invoices…</p>
                ) : (
                  <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-xl border border-[#E8E0D4] bg-white p-1">
                    {selectableInvoices.length === 0 ? (
                      <li className="px-3 py-4 text-center text-xs text-[#7A6A58]">
                        No payable finalized invoices found.
                      </li>
                    ) : (
                      selectableInvoices.map((inv) => (
                        <li key={inv.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setRecordAmount(String(inv.remainingAmount));
                              setRecordError("");
                            }}
                            className={`flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition ${
                              selectedInvoice?.id === inv.id
                                ? "bg-[#B9974A]/15 ring-1 ring-[#B9974A]/40"
                                : "hover:bg-[#FFF9EE]"
                            }`}
                          >
                            <span className="font-semibold text-[#1F2420]">{inv.invoiceNumber}</span>
                            <span className="text-xs text-[#7A6A58]">
                              {inv.client?.fullName ?? "Client"} · Remaining{" "}
                              {formatEGP(inv.remainingAmount)} · {inv.paymentStatus ?? "—"}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => setAdvancedInvoiceOpen((o) => !o)}
                  className="mt-2 text-xs font-medium text-[#0E342B] underline-offset-2 hover:underline"
                >
                  Paste invoice ID (advanced)
                </button>
                {advancedInvoiceOpen ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={advancedInvoiceId}
                      onChange={(ev) => setAdvancedInvoiceId(ev.target.value)}
                      placeholder="Invoice UUID"
                      className="min-w-0 flex-1 rounded-lg border border-[#E8E0D4] px-2 py-2 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => void applyAdvancedInvoiceId()}
                      className="shrink-0 rounded-lg bg-[#0E342B] px-3 py-2 text-xs font-medium text-[#FFFCF7]"
                    >
                      Load
                    </button>
                  </div>
                ) : null}
              </div>

              {selectedInvoice ? (
                <div className="rounded-xl border border-[#E8E0D4] bg-white p-3 text-sm">
                  <p className="font-semibold">{selectedInvoice.invoiceNumber}</p>
                  <p className="text-xs text-[#7A6A58]">
                    Outstanding {formatEGP(selectedInvoice.remainingAmount)}
                  </p>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Amount</span>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    required
                    value={recordAmount}
                    onChange={(ev) => setRecordAmount(ev.target.value)}
                    className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Method</span>
                  <select
                    required
                    value={recordMethod}
                    onChange={(ev) => setRecordMethod(ev.target.value)}
                    className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {methodLabel(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium">Reference (recommended if not cash)</span>
                  <input
                    value={recordReference}
                    onChange={(ev) => setRecordReference(ev.target.value)}
                    className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium">Notes (optional)</span>
                  <textarea
                    value={recordNotes}
                    onChange={(ev) => setRecordNotes(ev.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>

              {recordError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {recordError}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRecordOpen(false)}
                  className="rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordSaving || !selectedInvoice}
                  className="rounded-xl bg-[#0E342B] px-4 py-2 text-sm font-semibold text-[#FFFCF7] disabled:opacity-50"
                >
                  {recordSaving ? "Saving…" : "Save payment"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {/* Booking payment modal (legacy) */}
      {bookingPayModal ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2A1722]/40 p-4">
          <section className="mx-auto mt-8 max-w-xl rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7] p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Record booking payment</h2>
            <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onBookingRecordPayment}>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block font-medium">Amount</span>
                <input
                  type="number"
                  required
                  min={0.01}
                  step="0.01"
                  value={bookingPayAmount}
                  onChange={(ev) => setBookingPayAmount(ev.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Method</span>
                <select
                  value={bookingPayMethod}
                  onChange={(ev) => setBookingPayMethod(ev.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Status</span>
                <select
                  value={bookingPayStatus}
                  onChange={(ev) => setBookingPayStatus(ev.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                >
                  <option value="PAID">PAID</option>
                  <option value="PENDING">PENDING</option>
                  <option value="FAILED">FAILED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block font-medium">Reference</span>
                <input
                  value={bookingPayRef}
                  onChange={(ev) => setBookingPayRef(ev.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block font-medium">Paid at</span>
                <input
                  type="datetime-local"
                  value={bookingPayPaidAt}
                  onChange={(ev) => setBookingPayPaidAt(ev.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </label>
              {bookingPayError ? (
                <p className="text-sm text-red-700 md:col-span-2">{bookingPayError}</p>
              ) : null}
              <div className="flex justify-end gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setBookingPayModal(false)}
                  className="rounded-lg border bg-white px-3 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bookingPaySaving}
                  className="rounded-lg bg-[#0E342B] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {bookingPaySaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editModalOpen && editingPayment ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2A1722]/40 p-4">
          <section className="mx-auto mt-8 max-w-xl rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7] p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Update payment</h2>
            <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onUpdatePayment}>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Amount</span>
                <input
                  type="number"
                  required
                  min={0.01}
                  step="0.01"
                  value={editAmount}
                  onChange={(ev) => setEditAmount(ev.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Method</span>
                <select
                  value={editMethod}
                  onChange={(ev) => setEditMethod(ev.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Status</span>
                <select
                  value={editStatus}
                  onChange={(ev) => setEditStatus(ev.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                >
                  <option value="PAID">PAID</option>
                  <option value="PENDING">PENDING</option>
                  <option value="FAILED">FAILED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Paid at</span>
                <input
                  type="datetime-local"
                  value={editPaidAt}
                  onChange={(ev) => setEditPaidAt(ev.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block font-medium">Reference</span>
                <input
                  value={editReference}
                  onChange={(ev) => setEditReference(ev.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </label>
              {editError ? <p className="text-sm text-red-700 md:col-span-2">{editError}</p> : null}
              <div className="flex justify-end gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="rounded-lg border bg-white px-3 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="rounded-lg bg-[#0E342B] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {editSaving ? "Saving…" : "Update"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </PermissionGuard>
  );
}

function bookingRefFromList(row: DashboardBookingsListItem): string {
  const tail = row.id.replace(/-/g, "").slice(-8).toUpperCase();
  return `RB-${tail}`;
}
