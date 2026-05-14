"use client";

import {
  ApiClientError,
  getDashboardBookingById,
  getDashboardBranches,
  getDashboardClients,
  getDashboardQueue,
  getDashboardStaffAvailability,
  postDashboardQueueInvoiceFinalize,
  postDashboardQueuePayment,
  postDashboardQueueEntryAction,
  postDashboardQueueEntryAppendBookingItems,
  postDashboardWalkInQueue,
  type DashboardBookingDetail,
  type DashboardBranch,
  type DashboardClient,
  type DashboardQueueEntry,
  type DashboardStaffAvailabilityResponse,
} from "@rouby/api-client";
import { cairoTodayYmd, formatDateTimeAmPm } from "@rouby/wall-clock";
import {
  AlertCircle,
  Building2,
  ClipboardList,
  ExternalLink,
  Loader2,
  Plus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DashboardServiceVariantLinesBlock,
  type DashboardServiceVariantLinesBlockHandle,
  type ServiceLineRow,
} from "@/components/dashboard-service-variant-lines-block";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

function toDateInput(value: Date): string {
  const y = value.getFullYear();
  const m = `${value.getMonth() + 1}`.padStart(2, "0");
  const d = `${value.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds) || seconds < 0) {
    return "—";
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 120) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  if (m === 0) {
    return `${s}s`;
  }
  return `${m}m ${s}s`;
}

function formatBookingRef(id: string): string {
  const tail = id.replace(/-/g, "").slice(-8).toUpperCase();
  return `RB-${tail}`;
}

function collectPendingServiceLines(booking: DashboardBookingDetail) {
  return booking.items.filter((it) => {
    const st = it.lineStatus ?? "PENDING";
    if (st !== "PENDING") return false;
    if (it.itemType !== "SERVICE" && it.itemType !== "SERVICE_VARIANT") return false;
    return Boolean(it.catalogServiceId);
  });
}

function formatEGP(amount: number): string {
  return `EGP ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "BRANCH_ID_REQUIRED") {
      return "Please select a branch first.";
    }
    if (error.code === "WALK_IN_CLIENT_UNRESOLVED") {
      return "Select an existing client or provide a phone number so a client record can be matched or created.";
    }
    if (error.code === "WALK_IN_ITEMS_REQUIRED") {
      return "Add at least one service before check-in.";
    }
    if (error.code === "ENHANCEMENT_INACTIVE" || error.code === "ENHANCEMENT_NOT_PRICEABLE") {
      return "An add-on is not bookable right now (inactive or missing price). Update your selection.";
    }
    if (error.code === "INVOICE_FINALIZED_BLOCKS_ITEMS") {
      return "This booking has a finalized invoice — line items cannot be changed.";
    }
    if (error.code === "QUEUE_START_SINGLE_SERVICE_ONLY") {
      return "Only one service can be started at a time for this visit.";
    }
    if (error.code === "QUEUE_ACTIVE_FOR_BOOKING") {
      return "This booking already has an active queue entry.";
    }
    if (error.code === "INVALID_QUEUE_TRANSITION") {
      return "That queue action is not allowed for the current status.";
    }
    if (error.code === "INVOICE_REQUIRED") {
      return "Finalize invoice before completing this visit or collecting payment.";
    }
    if (error.code === "PAYMENT_REQUIRED") {
      return "Full payment is required before visit completion.";
    }
    if (error.statusCode === 403) {
      const msg = error.message?.trim();
      if (msg && !/^forbidden$/i.test(msg)) {
        return msg;
      }
      return "You do not have permission for this action.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error.";
}

function sourceBadgeClass(source: DashboardQueueEntry["source"]): string {
  return source === "BOOKING"
    ? "border border-[#B8D4EA]/90 bg-[#EEF6FC] text-[#1E4A6E]"
    : "border border-[#E8D4A0]/80 bg-[#FFF9ED] text-[#6B5420]";
}

function QueueCard({
  row,
  canManageQueue,
  canProgressVisit,
  canAddItems,
  onStart,
  onComplete,
  onCancel,
  onAddItems,
  onFinalizeInvoice,
  onCollectPayment,
  busyId,
  startVisitModalOpen,
}: {
  row: DashboardQueueEntry;
  canManageQueue: boolean;
  canProgressVisit: boolean;
  canAddItems: boolean;
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onAddItems: (row: DashboardQueueEntry) => void;
  onFinalizeInvoice: (row: DashboardQueueEntry) => void;
  onCollectPayment: (row: DashboardQueueEntry) => void;
  busyId: string | null;
  startVisitModalOpen: boolean;
}) {
  const busy = busyId === row.id;
  const sourceLabel = row.source === "BOOKING" ? "Booking" : "Walk-in";
  const showAddItems =
    canAddItems &&
    Boolean(row.bookingId) &&
    (row.status === "WAITING" || row.status === "IN_SERVICE");
  const canFinalizeInvoice =
    (row.status === "WAITING" || row.status === "IN_SERVICE") && !row.hasFinalizedInvoice;
  const canCollectPayment =
    (row.status === "WAITING" || row.status === "IN_SERVICE") &&
    Boolean(row.invoiceSummary) &&
    (row.invoiceSummary?.remainingAmount ?? 0) > 0;
  const canPrintReceipt = Boolean(row.invoiceSummary);
  const canCompleteVisit =
    row.status === "IN_SERVICE" &&
    (!row.bookingId || (row.hasFinalizedInvoice && row.paymentSummary?.isPaid === true));

  return (
    <article className="rounded-2xl border border-[#E8E0D4]/80 bg-white p-4 shadow-sm ring-1 ring-[#F7F4EE]/80">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#1F2420]">{row.clientNameSnapshot}</p>
          {row.clientPhoneSnapshot ? (
            <p className="mt-0.5 text-xs text-[#7A6A58]">{row.clientPhoneSnapshot}</p>
          ) : null}
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${sourceBadgeClass(row.source)}`}
        >
          {sourceLabel}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-[#5E574C]">
        <span className="font-medium text-[#7A6A58]">Services: </span>
        {row.serviceSummarySnapshot ?? "—"}
      </p>

      <dl className="mt-3 grid gap-1 text-[0.7rem] text-[#7A6A58]">
        <div className="flex justify-between gap-2">
          <dt>Check-in</dt>
          <dd className="text-right font-medium text-[#4A3C2F]">
            {formatDateTimeAmPm(row.checkedInAt)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Waiting</dt>
          <dd className="text-right font-medium text-[#4A3C2F]">
            {formatDuration(row.waitingDurationSeconds)}
          </dd>
        </div>
        {row.status === "IN_SERVICE" ? (
          <div className="flex justify-between gap-2">
            <dt>In service</dt>
            <dd className="text-right font-medium text-[#4A3C2F]">
              {formatDuration(row.inServiceDurationSeconds)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt>Status</dt>
          <dd className="text-right font-semibold capitalize tracking-wide text-[#062A2D]/85">
            {row.status.replace(/_/g, " ").toLowerCase()}
          </dd>
        </div>
      </dl>

      {row.notes ? (
        <p className="mt-3 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] px-3 py-2 text-xs leading-relaxed text-[#5E574C]">
          <span className="font-semibold text-[#7A6A58]">Notes: </span>
          {row.notes}
        </p>
      ) : null}

      {row.bookingId ? (
        <div className="mt-3 space-y-1">
          <p className="text-xs text-[#5E574C]">
            <span className="font-medium text-[#7A6A58]">Booking </span>
            <span className="font-mono font-semibold text-[#1F2420]">{formatBookingRef(row.bookingId)}</span>
          </p>
          <Link
            href={`/dashboard/bookings?bookingId=${row.bookingId}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#062A2D] underline-offset-4 hover:underline"
          >
            Open booking
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      ) : null}

      {row.bookingSummary != null && row.bookingSummary.totalAmount !== null ? (
        <p className="mt-2 text-xs text-[#5E574C]">
          Booking total: <span className="font-semibold text-[#1F2420]">{formatEGP(row.bookingSummary.totalAmount)}</span>
        </p>
      ) : null}

      {row.invoiceSummary ? (
        <div className="mt-2 rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2 text-xs text-[#5E574C]">
          <p>
            Invoice <span className="font-semibold text-[#1F2420]">{row.invoiceSummary.invoiceNumber}</span> ·{" "}
            <span className="font-semibold text-[#1F2420]">{formatEGP(row.invoiceSummary.totalAmount)}</span>
          </p>
          <p className="mt-1">
            Remaining: <span className="font-semibold text-[#1F2420]">{formatEGP(row.invoiceSummary.remainingAmount)}</span>
          </p>
        </div>
      ) : null}

      {row.paymentSummary?.isPaid ? (
        <p className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-800">
          Paid
        </p>
      ) : null}

      {showAddItems || canFinalizeInvoice || canCollectPayment || canPrintReceipt ? (
        <div className="mt-3 space-y-2">
          {showAddItems ? (
          <button
            type="button"
            disabled={busy || row.hasFinalizedInvoice}
            onClick={() => onAddItems(row)}
            className="inline-flex w-full items-center justify-center rounded-xl border border-[#B9974A]/45 bg-[#FBF6E8] px-3 py-2 text-xs font-semibold text-[#5C4A18] shadow-sm transition hover:bg-[#F5ECD4] disabled:opacity-50"
          >
            Add to visit
          </button>
          ) : null}
          {canFinalizeInvoice ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onFinalizeInvoice(row)}
              className="inline-flex w-full items-center justify-center rounded-xl border border-[#062A2D]/35 bg-[#EEF6F3] px-3 py-2 text-xs font-semibold text-[#0A3F35] shadow-sm transition hover:bg-[#E2F0EC] disabled:opacity-50"
            >
              Generate Invoice
            </button>
          ) : null}
          {canCollectPayment ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onCollectPayment(row)}
              className="inline-flex w-full items-center justify-center rounded-xl border border-[#062A2D]/35 bg-[#EDF5FF] px-3 py-2 text-xs font-semibold text-[#1E4A6E] shadow-sm transition hover:bg-[#E3F0FF] disabled:opacity-50"
            >
              Collect Payment
            </button>
          ) : null}
          {canPrintReceipt ? (
            <Link
              href={`/dashboard/invoices/${row.invoiceSummary?.invoiceId}/receipt`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center rounded-xl border border-[#062A2D]/35 bg-white px-3 py-2 text-xs font-semibold text-[#062A2D] shadow-sm transition hover:bg-[#F7FBFA]"
            >
              Print Receipt
            </Link>
          ) : null}
        </div>
      ) : null}

      {canManageQueue && row.status !== "COMPLETED" && row.status !== "CANCELLED" ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-[#F0EBE3] pt-3">
          {row.bookingId && !canProgressVisit ? (
            <p className="text-[0.65rem] leading-relaxed text-[#B5A896]">
              Start and complete require <span className="font-medium">bookings.status.progress</span> when a booking
              is linked.
            </p>
          ) : null}
          {row.status === "WAITING" ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || startVisitModalOpen || (Boolean(row.bookingId) && !canProgressVisit)}
                onClick={() => onStart(row.id)}
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-[#062A2D] px-3 py-2 text-xs font-semibold text-[#F6F2EA] shadow-sm transition hover:bg-[#0A3F35] disabled:opacity-50"
              >
                Start
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onCancel(row.id)}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-[#E7B9A4]/90 bg-[#FFF9F6] px-3 py-2 text-xs font-semibold text-[#8B4428] shadow-sm transition hover:bg-[#FFF1EC] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : null}
          {row.status === "IN_SERVICE" ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={
                  busy ||
                  (Boolean(row.bookingId) && !canProgressVisit) ||
                  (Boolean(row.bookingId) && !canCompleteVisit)
                }
                onClick={() => onComplete(row.id)}
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-[#062A2D] px-3 py-2 text-xs font-semibold text-[#F6F2EA] shadow-sm transition hover:bg-[#0A3F35] disabled:opacity-50"
              >
                Complete
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onCancel(row.id)}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-[#E7B9A4]/90 bg-[#FFF9F6] px-3 py-2 text-xs font-semibold text-[#8B4428] shadow-sm transition hover:bg-[#FFF1EC] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function DashboardQueuePage() {
  const { token, user, hasPermission } = useDashboardAuth();
  const canReadBranches = hasPermission("branches.read");
  const canManageQueue = hasPermission("queue.manage");
  const canWalkIn = canManageQueue && hasPermission("bookings.create");
  const canAddQueueItems = canManageQueue && hasPermission("bookings.update");
  const canProgressVisit = canManageQueue && hasPermission("bookings.status.progress");

  const [branches, setBranches] = useState<DashboardBranch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(() => cairoTodayYmd());
  const [rows, setRows] = useState<DashboardQueueEntry[]>([]);
  const [metaDate, setMetaDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [walkOpen, setWalkOpen] = useState(false);
  const [walkMode, setWalkMode] = useState<"new" | "existing">("new");
  const [walkName, setWalkName] = useState("");
  const [walkPhone, setWalkPhone] = useState("");
  const [walkNotes, setWalkNotes] = useState("");
  const [walkClientId, setWalkClientId] = useState("");
  const [walkPickLabel, setWalkPickLabel] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientHits, setClientHits] = useState<DashboardClient[]>([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [walkSubmitting, setWalkSubmitting] = useState(false);
  const [walkError, setWalkError] = useState("");
  const [walkLines, setWalkLines] = useState<ServiceLineRow[]>([
    { key: "line-1", serviceId: "", variantId: "" },
  ]);
  const walkLinesBlockRef = useRef<DashboardServiceVariantLinesBlockHandle>(null);
  const [walkLinesKey, setWalkLinesKey] = useState(0);

  const [addItemsOpen, setAddItemsOpen] = useState(false);
  const [addItemsEntryId, setAddItemsEntryId] = useState("");
  const [addItemsBookingId, setAddItemsBookingId] = useState("");
  const [addItemsDetail, setAddItemsDetail] = useState<DashboardBookingDetail | null>(null);
  const [addItemsDetailLoading, setAddItemsDetailLoading] = useState(false);
  const [addItemsLines, setAddItemsLines] = useState<ServiceLineRow[]>([
    { key: "add-1", serviceId: "", variantId: "" },
  ]);
  const addItemsLinesKey = addItemsOpen ? addItemsEntryId : "closed";
  const addItemsLinesRef = useRef<DashboardServiceVariantLinesBlockHandle>(null);
  const [addItemsSubmitting, setAddItemsSubmitting] = useState(false);
  const [addItemsError, setAddItemsError] = useState("");

  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizeRow, setFinalizeRow] = useState<DashboardQueueEntry | null>(null);
  const [finalizeSubmitting, setFinalizeSubmitting] = useState(false);
  const [finalizeError, setFinalizeError] = useState("");

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentRow, setPaymentRow] = useState<DashboardQueueEntry | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const [startVisitOpen, setStartVisitOpen] = useState(false);
  const [startVisitEntryId, setStartVisitEntryId] = useState("");
  const [startVisitBranchId, setStartVisitBranchId] = useState("");
  const [startVisitBooking, setStartVisitBooking] = useState<DashboardBookingDetail | null>(null);
  const [startVisitLoading, setStartVisitLoading] = useState(false);
  const [startVisitAvailLoading, setStartVisitAvailLoading] = useState(false);
  const [startVisitSelections, setStartVisitSelections] = useState<Record<string, string>>({});
  const [startVisitChosenItemId, setStartVisitChosenItemId] = useState("");
  const [startVisitAvail, setStartVisitAvail] = useState<
    Record<string, DashboardStaffAvailabilityResponse["staff"]>
  >({});
  const [startVisitSubmitting, setStartVisitSubmitting] = useState(false);
  const [startVisitError, setStartVisitError] = useState("");

  function resetWalkInForm() {
    setWalkMode("new");
    setWalkName("");
    setWalkPhone("");
    setWalkNotes("");
    setWalkClientId("");
    setWalkPickLabel("");
    setClientSearch("");
    setClientHits([]);
    setWalkError("");
    setWalkLines([{ key: `line-${Date.now()}`, serviceId: "", variantId: "" }]);
    setWalkLinesKey((k) => k + 1);
  }

  function openWalkInModal() {
    resetWalkInForm();
    setWalkOpen(true);
  }

  function openAddItemsModal(row: DashboardQueueEntry) {
    if (!row.bookingId || !token) {
      return;
    }
    setAddItemsError("");
    setAddItemsEntryId(row.id);
    setAddItemsBookingId(row.bookingId);
    setAddItemsLines([{ key: `add-${Date.now()}`, serviceId: "", variantId: "" }]);
    setAddItemsDetail(null);
    setAddItemsOpen(true);
    setAddItemsDetailLoading(true);
    void getDashboardBookingById(token, row.bookingId)
      .then((d) => {
        setAddItemsDetail(d);
      })
      .catch(() => {
        setAddItemsDetail(null);
      })
      .finally(() => {
        setAddItemsDetailLoading(false);
      });
  }

  function openFinalizeInvoiceModal(row: DashboardQueueEntry) {
    setFinalizeRow(row);
    setFinalizeError("");
    setFinalizeOpen(true);
  }

  function openCollectPaymentModal(row: DashboardQueueEntry) {
    setPaymentRow(row);
    setPaymentAmount(String(row.invoiceSummary?.remainingAmount ?? 0));
    setPaymentMethod("CASH");
    setPaymentReference("");
    setPaymentNotes("");
    setPaymentError("");
    setPaymentOpen(true);
  }

  const canAccessMultipleBranches = useMemo(
    () => user?.branchId === null && canReadBranches,
    [canReadBranches, user?.branchId],
  );

  const loadQueue = useCallback(async () => {
    if (!token) {
      return;
    }
    if (!branchId) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await getDashboardQueue(token, {
        date,
        branchId: branchId || undefined,
      });
      setRows(res.data);
      setMetaDate(res.meta.date);
    } catch (requestError) {
      setError(formatApiError(requestError));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [branchId, canAccessMultipleBranches, date, token]);

  useEffect(() => {
    if (!token || !canReadBranches) {
      return;
    }
    void getDashboardBranches(token).then((result) => {
      setBranches(result);
      if (!branchId && !user?.branchId && canAccessMultipleBranches && result[0]) {
        setBranchId(result[0].id);
      }
    });
  }, [branchId, canAccessMultipleBranches, canReadBranches, token, user?.branchId]);

  useEffect(() => {
    if (!token) {
      return;
    }
    if (!branchId && user?.branchId) {
      setBranchId(user.branchId);
    }
  }, [branchId, token, user?.branchId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (!startVisitOpen || !token || !startVisitBooking || !startVisitBranchId || !startVisitChosenItemId) {
      return;
    }
    const lines = collectPendingServiceLines(startVisitBooking);
    const it = lines.find((l) => l.id === startVisitChosenItemId);
    if (!it) {
      return;
    }
    let cancelled = false;
    setStartVisitAvailLoading(true);
    const dateStr = startVisitBooking.slot?.date ?? cairoTodayYmd();
    void (async () => {
      const sid = it.catalogServiceId as string;
      try {
        const res = await getDashboardStaffAvailability(token, {
          branchId: startVisitBranchId,
          serviceId: sid,
          date: dateStr,
        });
        if (cancelled) return;
        setStartVisitAvail({ [it.id]: res.staff });
        const pick =
          res.staff.find((s) => s.status === "AVAILABLE")?.staffProfileId ??
          res.staff.find((s) => s.status === "BUSY")?.staffProfileId ??
          "";
        setStartVisitSelections((prev) => ({ ...prev, [it.id]: pick }));
      } finally {
        if (!cancelled) {
          setStartVisitAvailLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startVisitOpen, startVisitBooking, startVisitBranchId, startVisitChosenItemId, token]);

  useEffect(() => {
    if (!walkOpen || walkMode !== "existing" || !token || !canManageQueue) {
      return;
    }
    const q = clientSearch.trim();
    if (q.length < 2) {
      setClientHits([]);
      setClientSearchLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setClientSearchLoading(true);
      void getDashboardClients(token, { search: q, pageSize: 15 })
        .then((res) => {
          setClientHits(Array.isArray(res.data) ? res.data : []);
        })
        .catch(() => {
          setClientHits([]);
        })
        .finally(() => {
          setClientSearchLoading(false);
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [walkOpen, walkMode, clientSearch, token, canManageQueue]);

  const waiting = useMemo(() => rows.filter((r) => r.status === "WAITING"), [rows]);
  const inService = useMemo(() => rows.filter((r) => r.status === "IN_SERVICE"), [rows]);
  const completed = useMemo(() => rows.filter((r) => r.status === "COMPLETED"), [rows]);

  async function prepareStartVisit(id: string): Promise<void> {
    if (!token) {
      return;
    }
    const row = rows.find((r) => r.id === id);
    if (!row?.bookingId) {
      setError("This queue row is not linked to a booking.");
      return;
    }
    setStartVisitLoading(true);
    setStartVisitError("");
    try {
      const booking = await getDashboardBookingById(token, row.bookingId);
      const lines = collectPendingServiceLines(booking);
      if (lines.length === 0) {
        setError(
          "No pending catalog service lines to start. Ensure each line has a resolvable service (check Bookings if needed).",
        );
        return;
      }
      setStartVisitEntryId(id);
      setStartVisitBranchId(row.branchId);
      setStartVisitBooking(booking);
      setStartVisitChosenItemId(lines[0]?.id ?? "");
      setStartVisitSelections({});
      setStartVisitAvail({});
      setStartVisitOpen(true);
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setStartVisitLoading(false);
    }
  }

  async function submitStartVisit(): Promise<void> {
    if (!token || !startVisitEntryId || !startVisitBooking) {
      return;
    }
    const lines = collectPendingServiceLines(startVisitBooking);
    const it =
      lines.find((l) => l.id === startVisitChosenItemId) ?? lines[0];
    if (!it) {
      setStartVisitError("No pending service line to start.");
      return;
    }
    setStartVisitError("");
    const picked = startVisitSelections[it.id]?.trim();
    if (!picked) {
      setStartVisitError(`Choose a staff member for “${it.nameSnapshot}”.`);
      return;
    }
    const starts = [{ bookingItemId: it.id, staffProfileId: picked }];
    setStartVisitSubmitting(true);
    try {
      await postDashboardQueueEntryAction(token, startVisitEntryId, "start", { starts });
      setStartVisitOpen(false);
      setStartVisitBooking(null);
      setStartVisitEntryId("");
      setStartVisitChosenItemId("");
      await loadQueue();
    } catch (requestError) {
      setStartVisitError(formatApiError(requestError));
    } finally {
      setStartVisitSubmitting(false);
    }
  }

  async function runAction(
    id: string,
    action: "start" | "complete" | "cancel",
  ): Promise<void> {
    if (!token) {
      return;
    }
    const row = rows.find((r) => r.id === id);
    if (!row) {
      return;
    }
    setError("");
    if (action === "start") {
      setBusyId(id);
      try {
        await prepareStartVisit(id);
      } finally {
        setBusyId(null);
      }
      return;
    }
    setBusyId(id);
    try {
      await postDashboardQueueEntryAction(token, id, action);
      await loadQueue();
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setBusyId(null);
    }
  }

  async function submitWalkIn(): Promise<void> {
    if (!token || !branchId) {
      return;
    }
    if (walkMode === "existing") {
      if (!walkClientId) {
        setWalkError("Select a client from the list.");
        return;
      }
    } else {
      if (!walkName.trim()) {
        setWalkError("Enter the client name.");
        return;
      }
      if (!walkPhone.trim()) {
        setWalkError("Phone is required for new visitors so a client record can be created or matched.");
        return;
      }
    }
    const built = walkLinesBlockRef.current?.buildBookingItems();
    if (!built?.ok) {
      setWalkError(built?.error ?? "Add at least one valid service line.");
      return;
    }
    setWalkSubmitting(true);
    setWalkError("");
    try {
      if (walkMode === "existing") {
        await postDashboardWalkInQueue(token, {
          branchId,
          clientId: walkClientId,
          notes: walkNotes.trim() || undefined,
          items: built.items,
        });
      } else {
        await postDashboardWalkInQueue(token, {
          branchId,
          clientName: walkName.trim(),
          phone: walkPhone.trim(),
          notes: walkNotes.trim() || undefined,
          items: built.items,
        });
      }
      setWalkOpen(false);
      resetWalkInForm();
      await loadQueue();
    } catch (requestError) {
      setWalkError(formatApiError(requestError));
    } finally {
      setWalkSubmitting(false);
    }
  }

  async function submitAddItems(): Promise<void> {
    if (!token || !addItemsEntryId) {
      return;
    }
    if (addItemsDetail?.finalizedInvoice) {
      setAddItemsError("This booking has a finalized invoice — items cannot be added.");
      return;
    }
    const built = addItemsLinesRef.current?.buildBookingItems();
    if (!built?.ok) {
      setAddItemsError(built?.error ?? "Add at least one valid service line.");
      return;
    }
    setAddItemsSubmitting(true);
    setAddItemsError("");
    try {
      await postDashboardQueueEntryAppendBookingItems(token, addItemsEntryId, {
        items: built.items,
      });
      setAddItemsOpen(false);
      setAddItemsEntryId("");
      setAddItemsBookingId("");
      setAddItemsDetail(null);
      await loadQueue();
    } catch (requestError) {
      setAddItemsError(formatApiError(requestError));
    } finally {
      setAddItemsSubmitting(false);
    }
  }

  async function submitFinalizeInvoice(): Promise<void> {
    if (!token || !finalizeRow) return;
    setFinalizeSubmitting(true);
    setFinalizeError("");
    try {
      await postDashboardQueueInvoiceFinalize(token, finalizeRow.id);
      setFinalizeOpen(false);
      setFinalizeRow(null);
      await loadQueue();
    } catch (requestError) {
      setFinalizeError(formatApiError(requestError));
    } finally {
      setFinalizeSubmitting(false);
    }
  }

  async function submitCollectPayment(): Promise<void> {
    if (!token || !paymentRow) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Enter a valid payment amount.");
      return;
    }
    setPaymentSubmitting(true);
    setPaymentError("");
    try {
      await postDashboardQueuePayment(token, paymentRow.id, {
        amount,
        method: paymentMethod,
        referenceNumber: paymentReference.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
      });
      setPaymentOpen(false);
      setPaymentRow(null);
      await loadQueue();
    } catch (requestError) {
      setPaymentError(formatApiError(requestError));
    } finally {
      setPaymentSubmitting(false);
    }
  }

  return (
    <PermissionGuard permission="queue.read">
      <div className="min-h-[calc(100vh-4rem)] bg-[#FBF8F2] px-4 py-8 text-[#1F2420] sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1400px] space-y-8">
          <header className="flex flex-col gap-4 border-b border-[#E8E0D4]/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#062A2D] text-[#F6F2EA] shadow-lg shadow-[#062A2D]/15">
                <ClipboardList className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-[#062A2D]">Queue</h1>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-[#7A6A58]">
                  Live operational board for walk-ins and booking check-ins. Completed visits shown for{" "}
                  <span className="font-medium text-[#4A3C2F]">{metaDate || date}</span>
                  {waiting.length + inService.length > 0 ? (
                    <span className="block text-xs text-[#B5A896]">
                      Open visits may span earlier check-ins until completed or cancelled.
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {canWalkIn ? (
                <button
                  type="button"
                  onClick={() => openWalkInModal()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#B9974A] px-4 py-2.5 text-sm font-semibold text-[#1F1810] shadow-sm transition hover:bg-[#c9a855]"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Walk-in
                </button>
              ) : null}
            </div>
          </header>

          <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-[#E8E0D4]/70 bg-white p-4 shadow-sm ring-1 ring-[#F7F4EE]/80">
            {canAccessMultipleBranches ? (
              <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-medium text-[#7A6A58]">
                Branch
                <span className="flex items-center gap-2 rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-3 py-2">
                  <Building2 className="h-4 w-4 text-[#B9974A]" aria-hidden />
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full bg-transparent text-sm font-medium text-[#1F2420] outline-none"
                  >
                    <option value="">Select branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            ) : (
              <div className="flex items-center gap-2 text-sm text-[#7A6A58]">
                <Building2 className="h-4 w-4 text-[#B9974A]" aria-hidden />
                <span className="font-medium text-[#1F2420]">
                  {branches.find((b) => b.id === branchId)?.name ?? "Branch"}
                </span>
              </div>
            )}
            <label className="flex min-w-[160px] flex-col gap-1 text-xs font-medium text-[#7A6A58]">
              Day (completed column)
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-[#B9974A]/50"
              />
            </label>
          </div>

          {error ? (
            <p className="flex items-center gap-2 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-4 py-3 text-sm text-[#8B4428]">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#B9974A]" aria-label="Loading" />
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#B9974A]/85">
                  <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />
                  Waiting ({waiting.length})
                </h2>
                <div className="space-y-3">
                  {waiting.length === 0 ? (
                    <EmptyColumn />
                  ) : (
                    waiting.map((row) => (
                      <QueueCard
                        key={row.id}
                        row={row}
                        canManageQueue={canManageQueue}
                        canProgressVisit={canProgressVisit}
                        canAddItems={canAddQueueItems}
                        onStart={(id) => void runAction(id, "start")}
                        onComplete={(id) => void runAction(id, "complete")}
                        onCancel={(id) => void runAction(id, "cancel")}
                        onAddItems={(r) => openAddItemsModal(r)}
                        onFinalizeInvoice={(r) => openFinalizeInvoiceModal(r)}
                        onCollectPayment={(r) => openCollectPaymentModal(r)}
                        busyId={busyId}
                        startVisitModalOpen={startVisitOpen}
                      />
                    ))
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#B9974A]/85">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                  In service ({inService.length})
                </h2>
                <div className="space-y-3">
                  {inService.length === 0 ? (
                    <EmptyColumn />
                  ) : (
                    inService.map((row) => (
                      <QueueCard
                        key={row.id}
                        row={row}
                        canManageQueue={canManageQueue}
                        canProgressVisit={canProgressVisit}
                        canAddItems={canAddQueueItems}
                        onStart={(id) => void runAction(id, "start")}
                        onComplete={(id) => void runAction(id, "complete")}
                        onCancel={(id) => void runAction(id, "cancel")}
                        onAddItems={(r) => openAddItemsModal(r)}
                        onFinalizeInvoice={(r) => openFinalizeInvoiceModal(r)}
                        onCollectPayment={(r) => openCollectPaymentModal(r)}
                        busyId={busyId}
                        startVisitModalOpen={startVisitOpen}
                      />
                    ))
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#B9974A]/85">
                  <span className="h-2 w-2 rounded-full bg-[#062A2D]" aria-hidden />
                  Completed today ({completed.length})
                </h2>
                <div className="space-y-3">
                  {completed.length === 0 ? (
                    <EmptyColumn />
                  ) : (
                    completed.map((row) => (
                      <QueueCard
                        key={row.id}
                        row={row}
                        canManageQueue={false}
                        canProgressVisit={false}
                        canAddItems={false}
                        onStart={() => {}}
                        onComplete={() => {}}
                        onCancel={() => {}}
                        onAddItems={() => {}}
                        onFinalizeInvoice={() => {}}
                        onCollectPayment={() => {}}
                        busyId={busyId}
                        startVisitModalOpen={false}
                      />
                    ))
                  )}
                </div>
              </section>
            </div>
          )}
        </div>

        {walkOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="walk-in-title"
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#E8E0D4] bg-[#FFFCF7] p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <UserRound className="h-5 w-5 text-[#B9974A]" aria-hidden />
                  <h2 id="walk-in-title" className="text-lg font-semibold text-[#062A2D]">
                    Walk-in check-in
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setWalkOpen(false);
                    resetWalkInForm();
                  }}
                  className="rounded-lg px-2 py-1 text-sm text-[#7A6A58] hover:bg-[#F4F1EC]"
                >
                  Close
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#7A6A58]">
                Creates a same-day walk-in booking and a queue entry. At least one service line is required.
              </p>
              <div className="mt-4 flex gap-2 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setWalkMode("new");
                    setWalkClientId("");
                    setWalkPickLabel("");
                    setClientSearch("");
                    setClientHits([]);
                    setWalkError("");
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    walkMode === "new"
                      ? "bg-[#062A2D] text-[#F6F2EA] shadow-sm"
                      : "text-[#7A6A58] hover:bg-white/80"
                  }`}
                >
                  New visitor
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWalkMode("existing");
                    setWalkName("");
                    setWalkPhone("");
                    setWalkError("");
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    walkMode === "existing"
                      ? "bg-[#062A2D] text-[#F6F2EA] shadow-sm"
                      : "text-[#7A6A58] hover:bg-white/80"
                  }`}
                >
                  Existing client
                </button>
              </div>
              <p className="mt-2 text-[0.65rem] leading-relaxed text-[#B5A896]">
                Search uses the same branch rules as Clients. Phone/email on results follow your{" "}
                <span className="font-medium text-[#7A6A58]">clients.contact.view</span> permission.
              </p>

              <div className="mt-4 space-y-3">
                {walkMode === "existing" ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#7A6A58]">
                      Search client (name or phone)
                      <div className="relative mt-1">
                        <input
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                          autoComplete="off"
                          className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 pr-9 text-sm shadow-sm outline-none focus:border-[#B9974A]/50"
                          placeholder="Type at least 2 characters…"
                        />
                        {clientSearchLoading ? (
                          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#B9974A]" />
                        ) : null}
                      </div>
                    </label>
                    {walkClientId ? (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-[#B9974A]/35 bg-[#FBF6E8] px-3 py-2 text-sm">
                        <span className="font-medium text-[#1F2420]">{walkPickLabel}</span>
                        <button
                          type="button"
                          className="text-xs font-semibold text-[#8B4428] underline-offset-2 hover:underline"
                          onClick={() => {
                            setWalkClientId("");
                            setWalkPickLabel("");
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    ) : null}
                    {clientSearch.trim().length >= 2 &&
                    !clientSearchLoading &&
                    clientHits.length === 0 &&
                    !walkClientId ? (
                      <p className="rounded-xl border border-dashed border-[#E8E0D4] bg-white/80 px-3 py-2 text-xs text-[#7A6A58]">
                        No clients match. Try another name or phone fragment.
                      </p>
                    ) : null}
                    {clientHits.length > 0 && !walkClientId ? (
                      <ul
                        className="relative z-[1] max-h-48 overflow-auto rounded-xl border border-[#E8E0D4] bg-white text-sm shadow-md"
                        role="listbox"
                      >
                        {clientHits.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-[#FFFCF7]"
                              onClick={() => {
                                setWalkClientId(c.id);
                                setWalkPickLabel(
                                  `${c.fullName ?? "Client"}${c.phone ? ` · ${c.phone}` : ""}`,
                                );
                                setClientSearch(c.fullName ?? "");
                              }}
                            >
                              <span className="font-medium text-[#1F2420]">{c.fullName}</span>
                              {c.phone ? (
                                <span className="text-xs text-[#7A6A58]">{c.phone}</span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <label className="block text-xs font-medium text-[#7A6A58]">
                      Client name
                      <input
                        value={walkName}
                        onChange={(e) => setWalkName(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-[#B9974A]/50"
                        placeholder="Full name"
                      />
                    </label>
                    <label className="block text-xs font-medium text-[#7A6A58]">
                      Phone (optional)
                      <input
                        value={walkPhone}
                        onChange={(e) => setWalkPhone(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-[#B9974A]/50"
                        placeholder="+20…"
                      />
                    </label>
                  </>
                )}
                {branchId && token ? (
                  <DashboardServiceVariantLinesBlock
                    key={walkLinesKey}
                    ref={walkLinesBlockRef}
                    token={token}
                    branchId={branchId}
                    lines={walkLines}
                    setLines={setWalkLines}
                    disabled={walkSubmitting}
                  />
                ) : null}
                <label className="block text-xs font-medium text-[#7A6A58]">
                  Notes (optional)
                  <textarea
                    value={walkNotes}
                    onChange={(e) => setWalkNotes(e.target.value)}
                    rows={3}
                    className="mt-1 w-full resize-none rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-[#B9974A]/50"
                    placeholder="Optional"
                  />
                </label>
              </div>
              {walkError ? (
                <p className="mt-3 flex gap-2 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-3 py-2 text-xs text-[#8B4428]">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  {walkError}
                </p>
              ) : null}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWalkOpen(false);
                    resetWalkInForm();
                  }}
                  className="rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm font-semibold text-[#1F2420] shadow-sm hover:border-[#B9974A]/45"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    walkSubmitting ||
                    (walkMode === "new"
                      ? !walkName.trim() || !walkPhone.trim()
                      : !walkClientId)
                  }
                  onClick={() => void submitWalkIn()}
                  className="rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] shadow-sm hover:bg-[#0A3F35] disabled:opacity-50"
                >
                  {walkSubmitting ? "Saving…" : "Check in"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {addItemsOpen && token && branchId ? (
          <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-queue-items-title"
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#E8E0D4] bg-[#FFFCF7] p-6 shadow-2xl"
            >
              <h2 id="add-queue-items-title" className="text-lg font-semibold text-[#062A2D]">
                Add to visit
              </h2>
              <p className="mt-1 text-xs text-[#7A6A58]">
                Add services, packages, or add-ons. New lines are priced from the catalog and update the linked booking total.
              </p>
              {addItemsBookingId ? (
                <p className="mt-2 text-xs text-[#5E574C]">
                  Booking{" "}
                  <span className="font-mono font-semibold text-[#1F2420]">
                    {formatBookingRef(addItemsBookingId)}
                  </span>
                  {addItemsDetail && !addItemsDetailLoading ? (
                    <span className="block pt-1 text-[#7A6A58]">
                      Current total:{" "}
                      <span className="font-semibold text-[#1F2420]">
                        {formatEGP(addItemsDetail.totalAmount)}
                      </span>
                    </span>
                  ) : null}
                </p>
              ) : null}
              {addItemsDetailLoading ? (
                <p className="mt-3 flex items-center gap-2 text-xs text-[#7A6A58]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading booking…
                </p>
              ) : null}
              {addItemsDetail?.finalizedInvoice ? (
                <p className="mt-3 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-3 py-2 text-xs text-[#8B4428]">
                  Invoice {addItemsDetail.finalizedInvoice.invoiceNumber} is finalized — items cannot be added.
                </p>
              ) : null}
              <div className="mt-4">
                <DashboardServiceVariantLinesBlock
                  key={addItemsLinesKey}
                  ref={addItemsLinesRef}
                  token={token}
                  branchId={branchId}
                  lines={addItemsLines}
                  setLines={setAddItemsLines}
                  disabled={addItemsSubmitting || Boolean(addItemsDetail?.finalizedInvoice)}
                />
              </div>
              {addItemsError ? (
                <p className="mt-3 flex gap-2 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-3 py-2 text-xs text-[#8B4428]">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  {addItemsError}
                </p>
              ) : null}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddItemsOpen(false);
                    setAddItemsEntryId("");
                    setAddItemsBookingId("");
                    setAddItemsDetail(null);
                    setAddItemsError("");
                  }}
                  className="rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm font-semibold text-[#1F2420] shadow-sm hover:border-[#B9974A]/45"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={
                    addItemsSubmitting ||
                    Boolean(addItemsDetail?.finalizedInvoice) ||
                    addItemsDetailLoading
                  }
                  onClick={() => void submitAddItems()}
                  className="rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] shadow-sm hover:bg-[#0A3F35] disabled:opacity-50"
                >
                  {addItemsSubmitting ? "Saving…" : "Add to booking"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {startVisitOpen && startVisitBooking ? (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#E8E0D4] bg-[#FFFCF7] p-6 shadow-2xl">
              <h2 className="text-lg font-semibold text-[#062A2D]">Start visit — assign staff</h2>
              <p className="mt-2 text-xs text-[#7A6A58]">
                Begin with one service; assign staff for that line. Additional services are started one at a time from
                the booking (or here after the visit is in service).
              </p>
              {collectPendingServiceLines(startVisitBooking).length > 1 ? (
                <label className="mt-4 block text-xs font-medium text-[#7A6A58]">
                  Service to begin now
                  <select
                    className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm"
                    value={startVisitChosenItemId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setStartVisitChosenItemId(next);
                      setStartVisitSelections({});
                      setStartVisitAvail({});
                    }}
                  >
                    {collectPendingServiceLines(startVisitBooking).map((line) => (
                      <option key={line.id} value={line.id}>
                        {line.nameSnapshot}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {startVisitAvailLoading ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-[#7A6A58]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading staff availability…
                </p>
              ) : null}
              <div className="mt-4 space-y-4">
                {(() => {
                  const lines = collectPendingServiceLines(startVisitBooking);
                  const it = lines.find((l) => l.id === startVisitChosenItemId) ?? lines[0];
                  if (!it) {
                    return null;
                  }
                  const options = startVisitAvail[it.id] ?? [];
                  return (
                    <div key={it.id} className="rounded-xl border border-[#F0EBE3] bg-white p-3">
                      <p className="text-sm font-semibold text-[#1F2420]">{it.nameSnapshot}</p>
                      <label className="mt-2 block text-xs font-medium text-[#7A6A58]">
                        Staff
                        <select
                          className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm"
                          value={startVisitSelections[it.id] ?? ""}
                          onChange={(e) =>
                            setStartVisitSelections((prev) => ({
                              ...prev,
                              [it.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Select…</option>
                          {options.map((s) => (
                            <option key={s.staffProfileId} value={s.staffProfileId}>
                              {s.displayName} ({s.status}
                              {s.reason ? ` — ${s.reason}` : ""})
                            </option>
                          ))}
                        </select>
                      </label>
                      {!startVisitAvailLoading && options.length === 0 ? (
                        <p className="mt-2 text-xs text-[#B26A2A]">
                          No qualified staff found for this service at this time.
                        </p>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
              {startVisitError ? (
                <p className="mt-4 flex gap-2 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-3 py-2 text-xs text-[#8B4428]">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  {startVisitError}
                </p>
              ) : null}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStartVisitOpen(false);
                    setStartVisitBooking(null);
                    setStartVisitEntryId("");
                    setStartVisitChosenItemId("");
                    setStartVisitError("");
                  }}
                  className="rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm font-semibold text-[#1F2420]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={startVisitSubmitting || startVisitAvailLoading}
                  onClick={() => void submitStartVisit()}
                  className="rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] disabled:opacity-50"
                >
                  {startVisitSubmitting ? "Starting…" : "Confirm & start"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {finalizeOpen && finalizeRow ? (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div className="w-full max-w-md rounded-3xl border border-[#E8E0D4] bg-[#FFFCF7] p-6 shadow-2xl">
              <h2 className="text-lg font-semibold text-[#062A2D]">Generate invoice</h2>
              <p className="mt-2 text-xs text-[#7A6A58]">
                After finalizing the invoice, services can no longer be edited for this visit.
              </p>
              {finalizeRow.bookingSummary != null && finalizeRow.bookingSummary.totalAmount !== null ? (
                <p className="mt-2 text-sm text-[#1F2420]">
                  Booking total: <span className="font-semibold">{formatEGP(finalizeRow.bookingSummary.totalAmount)}</span>
                </p>
              ) : null}
              {finalizeError ? (
                <p className="mt-3 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-3 py-2 text-xs text-[#8B4428]">
                  {finalizeError}
                </p>
              ) : null}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFinalizeOpen(false);
                    setFinalizeRow(null);
                  }}
                  className="rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm font-semibold text-[#1F2420]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={finalizeSubmitting}
                  onClick={() => void submitFinalizeInvoice()}
                  className="rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] disabled:opacity-50"
                >
                  {finalizeSubmitting ? "Generating..." : "Generate Invoice"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {paymentOpen && paymentRow ? (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div className="w-full max-w-md rounded-3xl border border-[#E8E0D4] bg-[#FFFCF7] p-6 shadow-2xl">
              <h2 className="text-lg font-semibold text-[#062A2D]">Collect payment</h2>
              <p className="mt-1 text-xs text-[#7A6A58]">
                Remaining amount: {formatEGP(paymentRow.invoiceSummary?.remainingAmount ?? 0)}
              </p>
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-medium text-[#7A6A58]">
                  Amount
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-[#7A6A58]">
                  Method
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm"
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="INSTAPAY">Instapay</option>
                    <option value="MOBILE_WALLET">Wallet</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-[#7A6A58]">
                  Reference (optional)
                  <input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-[#7A6A58]">
                  Notes (optional)
                  <textarea
                    rows={2}
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    className="mt-1 w-full resize-none rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>
              {paymentError ? (
                <p className="mt-3 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-3 py-2 text-xs text-[#8B4428]">
                  {paymentError}
                </p>
              ) : null}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentOpen(false);
                    setPaymentRow(null);
                  }}
                  className="rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm font-semibold text-[#1F2420]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={paymentSubmitting}
                  onClick={() => void submitCollectPayment()}
                  className="rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] disabled:opacity-50"
                >
                  {paymentSubmitting ? "Saving..." : "Submit Payment"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PermissionGuard>
  );
}

function EmptyColumn() {
  return (
    <p className="rounded-2xl border border-dashed border-[#E8E0D4] bg-white/60 px-4 py-8 text-center text-xs text-[#B5A896]">
      No entries
    </p>
  );
}
