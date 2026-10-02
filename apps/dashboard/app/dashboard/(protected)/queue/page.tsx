"use client";

import {
  ApiClientError,
  deleteDashboardBookingItem,
  getDashboardBookingById,
  getDashboardBookings,
  getDashboardBranches,
  getDashboardClients,
  getDashboardQueue,
  getDashboardStaffAvailability,
  postDashboardBookingAction,
  postDashboardBookingQueueCheckIn,
  postDashboardBookingServiceItemComplete,
  postDashboardBookingServiceItemStart,
  postDashboardQueueInvoiceFinalize,
  postDashboardQueuePayment,
  postDashboardQueueEntryAction,
  postDashboardQueueEntryAppendBookingItems,
  postDashboardWalkInQueue,
  type DashboardBookingDetail,
  type DashboardBookingsListItem,
  type DashboardBranch,
  type DashboardClient,
  type DashboardQueueEntry,
  type DashboardStaffAvailabilityResponse,
} from "@rouby/api-client";
import { cairoTodayYmd, formatDateTimeAmPm } from "@rouby/wall-clock";
import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  CreditCard,
  ExternalLink,
  Loader2,
  Plus,
  Printer,
  ReceiptText,
  Search,
  X,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DashboardServiceVariantLinesBlock,
  type DashboardServiceVariantLinesBlockHandle,
  type ServiceLineRow,
} from "@/components/dashboard-service-variant-lines-block";
import { PermissionGuard } from "@/components/auth-required";
import { OverrideReasonDialog } from "@/components/override-reason-dialog";
import { useSystemDialog } from "@/components/system-dialog-provider";
import { useDashboardAuth } from "@/lib/dashboard-auth";

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

function formatTimeAmPm(value: string | undefined | null): string {
  if (!value) return "—";
  const normalized = value.includes("T") ? value.slice(11, 16) : value.slice(0, 5);
  const [rawHour, rawMinute] = normalized.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function collectPendingServiceLines(booking: DashboardBookingDetail) {
  return booking.items.filter((it) => {
    const st = it.lineStatus ?? "PENDING";
    if (st !== "PENDING") return false;
    if (it.itemType !== "SERVICE" && it.itemType !== "SERVICE_VARIANT") return false;
    return Boolean(it.catalogServiceId);
  });
}

function collectInProgressServiceLines(booking: DashboardBookingDetail) {
  return booking.items.filter((it) => (it.lineStatus ?? "PENDING") === "IN_PROGRESS");
}

function serviceWorkLines(booking: DashboardBookingDetail | null | undefined) {
  return (
    booking?.items.filter(
      (item) =>
        (item.itemType === "SERVICE" || item.itemType === "SERVICE_VARIANT") &&
        Boolean(item.catalogServiceId) &&
        (item.lineStatus ?? "PENDING") !== "CANCELLED",
    ) ?? []
  );
}

function allServicesCompleted(booking: DashboardBookingDetail | null | undefined): boolean {
  const lines = serviceWorkLines(booking);
  return lines.length > 0 && lines.every((item) => (item.lineStatus ?? "PENDING") === "COMPLETED");
}

function staffSummaryFromBooking(booking: DashboardBookingDetail | null | undefined): string {
  if (!booking) return "Not assigned";
  const names = Array.from(
    new Set(
      booking.items
        .map((item) => item.staffDisplayName?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  );
  return names.length > 0 ? names.join(", ") : "Not assigned";
}

function serviceSummaryFromBooking(booking: DashboardBookingsListItem | DashboardBookingDetail): string {
  if ("servicesSummary" in booking && booking.servicesSummary) {
    return booking.servicesSummary;
  }
  if ("itemsPreview" in booking && booking.itemsPreview?.length) {
    const first = booking.itemsPreview[0]?.nameSnapshot ?? "Service";
    return booking.itemsPreview.length === 1 ? first : `${first} +${booking.itemsPreview.length - 1} more`;
  }
  if ("items" in booking && booking.items.length > 0) {
    const first = booking.items[0]?.nameSnapshot ?? "Service";
    return booking.items.length === 1 ? first : `${first} +${booking.items.length - 1} more`;
  }
  return "—";
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
      if (!msg || msg === "Insufficient permissions") {
        return "Your role doesn't allow this action. Ask a manager to do it or to update your permissions.";
      }
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
              href={`/dashboard/invoices/${row.invoiceSummary?.invoiceId}/receipt?print=1`}
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

void QueueCard;

type QueueStageKey = "expected" | "waiting" | "inService" | "readyToPay" | "completed";

const STAGE_META: Record<QueueStageKey, { label: string; dot: string; tone: string }> = {
  expected: { label: "Expected Today", dot: "bg-sky-500", tone: "border-sky-100 bg-sky-50/65" },
  waiting: { label: "Waiting", dot: "bg-amber-500", tone: "border-amber-100 bg-amber-50/70" },
  inService: { label: "In Service", dot: "bg-emerald-600", tone: "border-emerald-100 bg-emerald-50/65" },
  readyToPay: { label: "Ready to Pay", dot: "bg-[#7B55C7]", tone: "border-[#E4D8FF] bg-[#F7F1FF]/75" },
  completed: { label: "Completed Today", dot: "bg-[#8A9B8F]", tone: "border-[#E2E8E0] bg-[#F3F6F1]/80" },
};

function paymentLabel(row: DashboardQueueEntry): string {
  if (!row.invoiceSummary) return "No invoice";
  if (row.invoiceSummary.paymentStatus === "PAID") return "Paid";
  if (row.invoiceSummary.paymentStatus === "PARTIALLY_PAID") {
    return `Partial · ${formatEGP(row.invoiceSummary.remainingAmount)} due`;
  }
  return `Unpaid · ${formatEGP(row.invoiceSummary.remainingAmount)} due`;
}

function CommandQueueCard({
  row,
  stage,
  detail,
  busyId,
  canManageQueue,
  canProgressVisit,
  canAddItems,
  startVisitModalOpen,
  onStart,
  onFinishService,
  onComplete,
  onCancel,
  onAddItems,
  onCollectPayment,
  onDiscount,
  onOpenDetails,
  onCompleteLine,
  onRemoveLine,
}: {
  row: DashboardQueueEntry;
  stage: Exclude<QueueStageKey, "expected">;
  detail?: DashboardBookingDetail | null;
  busyId: string | null;
  canManageQueue: boolean;
  canProgressVisit: boolean;
  canAddItems: boolean;
  startVisitModalOpen: boolean;
  onStart: (id: string) => void;
  onFinishService: (row: DashboardQueueEntry) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onAddItems: (row: DashboardQueueEntry) => void;
  onCollectPayment: (row: DashboardQueueEntry) => void;
  onDiscount: (row: DashboardQueueEntry) => void;
  onOpenDetails: (row: DashboardQueueEntry) => void;
  onCompleteLine: (row: DashboardQueueEntry, lineId: string) => void;
  onRemoveLine: (row: DashboardQueueEntry, line: { id: string; name: string; lineStatus: string }) => void;
}) {
  const busy = busyId === row.id;
  const assignedStaff = row.assignedStaffNames?.length
    ? row.assignedStaffNames.join(", ")
    : staffSummaryFromBooking(detail);
  const delayed = row.status === "WAITING" && (row.waitingDurationSeconds ?? 0) >= 20 * 60;
  const unpaid = (row.invoiceSummary?.remainingAmount ?? 0) > 0;
  const noStaff = row.status === "IN_SERVICE" && assignedStaff === "Not assigned";
  const lineCounts = row.serviceLineCounts ?? { total: 0, pending: 0, inProgress: 0, completed: 0 };
  const lines = row.lines ?? [];
  const pendingLineNames = lines.filter((l) => l.lineStatus === "PENDING").map((l) => l.name);
  const canFinish =
    row.status === "IN_SERVICE" &&
    Boolean(row.bookingId) &&
    (lineCounts.total > 0 ? lineCounts.pending === 0 : allServicesCompleted(detail));
  const canVisitComplete = row.hasFinalizedInvoice;
  const completeLabel = row.paymentSummary?.isPaid === true ? "Complete" : "Close with balance";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(row)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetails(row);
        }
      }}
      className="rounded-2xl border border-[#E8E0D4]/80 bg-white p-4 text-left shadow-sm ring-1 ring-[#F7F4EE]/80 transition hover:-translate-y-0.5 hover:border-[#D8CBB8] hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#1F2420]">{row.clientNameSnapshot}</p>
          <p className="mt-0.5 truncate text-xs text-[#7A6A58]">{row.clientPhoneSnapshot ?? "No phone"}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${sourceBadgeClass(row.source)}`}>
          {row.source === "BOOKING" ? "Booking" : "Walk-in"}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {delayed ? <WarningBadge label="Delayed" tone="amber" /> : null}
        {noStaff ? <WarningBadge label="No staff" tone="red" /> : null}
        {unpaid ? <WarningBadge label="Unpaid" tone="purple" /> : null}
      </div>

      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[#5E574C]">
        <span className="font-medium text-[#7A6A58]">Services: </span>
        {detail ? serviceSummaryFromBooking(detail) : row.serviceSummarySnapshot ?? "—"}
      </p>
      <p className="mt-1 truncate text-xs text-[#5E574C]">
        <span className="font-medium text-[#7A6A58]">Staff: </span>
        {assignedStaff}
      </p>
      {stage === "inService" && lines.length > 0 ? (
        <ul className="mt-2 space-y-1" onClick={(event) => event.stopPropagation()}>
          {lines.map((line) => (
            <li
              key={line.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-[#FBF8F2] px-2 py-1 text-[0.7rem]"
            >
              <span className="min-w-0 truncate text-[#4A3C2F]">
                {line.lineStatus === "COMPLETED" ? "✓ " : line.lineStatus === "IN_PROGRESS" ? "● " : "○ "}
                {line.name}
                {line.staffDisplayName ? <span className="text-[#9A8B7A]"> · {line.staffDisplayName}</span> : null}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {line.lineStatus === "IN_PROGRESS" && canProgressVisit ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCompleteLine(row, line.id)}
                    className="rounded-md border border-[#0A5A45]/40 bg-white px-2 py-0.5 font-semibold text-[#0A5A45] hover:bg-[#EEF7F3] disabled:opacity-50"
                  >
                    Done
                  </button>
                ) : line.lineStatus === "PENDING" ? (
                  <span className="text-[#9A8B7A]">not started</span>
                ) : null}
                {canAddItems && !row.hasFinalizedInvoice && lines.length > 1 && (line.lineStatus === "PENDING" || line.lineStatus === "IN_PROGRESS") ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRemoveLine(row, line)}
                    aria-label={`Remove ${line.name}`}
                    title={line.lineStatus === "IN_PROGRESS" ? "Stop & remove (not charged)" : "Remove"}
                    className="rounded-md border border-[#E7B9A4]/70 bg-white px-1.5 py-0.5 text-[#8B4428] hover:bg-[#FFF1EC] disabled:opacity-50"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="mt-3 grid gap-1 text-[0.7rem] text-[#7A6A58]">
        <div className="flex justify-between gap-2">
          <dt>{row.status === "IN_SERVICE" ? "Service time" : "Waiting"}</dt>
          <dd className="font-medium text-[#4A3C2F]">
            {row.status === "IN_SERVICE"
              ? formatDuration(row.inServiceDurationSeconds)
              : formatDuration(row.waitingDurationSeconds)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Booking</dt>
          <dd className="font-mono font-semibold text-[#1F2420]">
            {row.bookingId ? formatBookingRef(row.bookingId) : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Total</dt>
          <dd className="font-semibold text-[#1F2420]">
            {formatEGP(row.invoiceSummary?.totalAmount ?? row.bookingSummary?.totalAmount ?? 0)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Payment</dt>
          <dd className="text-right font-medium text-[#4A3C2F]">{paymentLabel(row)}</dd>
        </div>
      </dl>

      <div className="mt-3 space-y-2" onClick={(event) => event.stopPropagation()}>
        {stage === "waiting" ? (
          <button
            type="button"
            disabled={busy || startVisitModalOpen || (Boolean(row.bookingId) && !canProgressVisit)}
            onClick={() => onStart(row.id)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#062A2D] px-3 py-2 text-xs font-semibold text-[#F6F2EA] shadow-sm transition hover:bg-[#0A3F35] disabled:opacity-50"
          >
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            Start Service
          </button>
        ) : null}
        {stage === "inService" ? (
          <>
          <button
            type="button"
            disabled={busy || !canFinish}
            onClick={() => onFinishService(row)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0A5A45] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0B6B51] disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Finish Service
          </button>
          {!canFinish ? (
            <p className="text-center text-[0.65rem] leading-relaxed text-[#9A8B7A]">
              {pendingLineNames.length > 0
                ? `Start first: ${pendingLineNames.join(", ")}`
                : "No service lines to finish."}
            </p>
          ) : null}
          </>
        ) : null}
        {stage === "readyToPay" ? (
          <div className="grid gap-2">
            <button
              type="button"
              disabled={busy || !canVisitComplete}
              onClick={() => onComplete(row.id)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#062A2D] px-3 py-2 text-xs font-semibold text-[#F6F2EA] shadow-sm transition hover:bg-[#0A3F35] disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {completeLabel}
            </button>
            <button
              type="button"
              disabled={busy || !row.invoiceSummary || (row.invoiceSummary.remainingAmount ?? 0) <= 0}
              onClick={() => onCollectPayment(row)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6D4BB0] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#5B3E91] disabled:opacity-50"
            >
              <CreditCard className="h-3.5 w-3.5" aria-hidden />
              Take Payment
            </button>
            <button
              type="button"
              disabled={busy || !row.bookingId || !row.invoiceSummary}
              onClick={() => onDiscount(row)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#B9974A]/55 bg-[#FBF6E8] px-3 py-2 text-xs font-semibold text-[#5C4A18] shadow-sm transition hover:bg-[#F5ECD4] disabled:opacity-50"
            >
              <ReceiptText className="h-3.5 w-3.5" aria-hidden />
              Make Discount
            </button>
            {row.invoiceSummary ? (
              <Link
                href={`/dashboard/invoices/${row.invoiceSummary.invoiceId}/receipt?print=1`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#D8CBB8] bg-white px-3 py-2 text-xs font-semibold text-[#062A2D] shadow-sm transition hover:bg-[#F7FBFA]"
              >
                <ReceiptText className="h-3.5 w-3.5" aria-hidden />
                Print Receipt
              </Link>
            ) : null}
          </div>
        ) : null}
        {stage === "completed" && row.invoiceSummary ? (
          <Link
            href={`/dashboard/invoices/${row.invoiceSummary.invoiceId}/receipt?print=1`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#D8CBB8] bg-white px-3 py-2 text-xs font-semibold text-[#062A2D] shadow-sm transition hover:bg-[#F7FBFA]"
          >
            <ReceiptText className="h-3.5 w-3.5" aria-hidden />
            Print Receipt
          </Link>
        ) : null}

        {stage !== "readyToPay" && stage !== "completed" ? (
        <div className="grid grid-cols-2 gap-2">
          {canAddItems && row.bookingId && (row.status === "WAITING" || row.status === "IN_SERVICE") ? (
            <button
              type="button"
              disabled={busy || row.hasFinalizedInvoice}
              onClick={() => onAddItems(row)}
              className="rounded-xl border border-[#B9974A]/45 bg-[#FBF6E8] px-3 py-2 text-xs font-semibold text-[#5C4A18] shadow-sm transition hover:bg-[#F5ECD4] disabled:opacity-50"
            >
              Add Service
            </button>
          ) : null}
          {row.invoiceSummary ? (
            <Link
              href={`/dashboard/invoices/${row.invoiceSummary.invoiceId}/receipt?print=1`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-[#D8CBB8] bg-white px-3 py-2 text-center text-xs font-semibold text-[#062A2D] shadow-sm transition hover:bg-[#F7FBFA]"
            >
              Print
            </Link>
          ) : null}
          {canVisitComplete ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onComplete(row.id)}
              className="rounded-xl bg-[#062A2D] px-3 py-2 text-xs font-semibold text-[#F6F2EA] shadow-sm transition hover:bg-[#0A3F35] disabled:opacity-50"
            >
              Complete
            </button>
          ) : null}
          {canManageQueue && row.status !== "COMPLETED" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onCancel(row.id)}
              className="rounded-xl border border-[#E7B9A4]/90 bg-[#FFF9F6] px-3 py-2 text-xs font-semibold text-[#8B4428] shadow-sm transition hover:bg-[#FFF1EC] disabled:opacity-50"
            >
              Cancel
            </button>
          ) : null}
        </div>
        ) : null}
      </div>
    </article>
  );
}

function ExpectedBookingCard({
  booking,
  busy,
  canCheckIn,
  onCheckIn,
  onOpenDetails,
  onCancel,
  onNoShow,
}: {
  booking: DashboardBookingsListItem;
  busy: boolean;
  canCheckIn: boolean;
  onCheckIn: (booking: DashboardBookingsListItem) => void;
  onOpenDetails: (booking: DashboardBookingsListItem) => void;
  onCancel: (booking: DashboardBookingsListItem) => void;
  onNoShow: (booking: DashboardBookingsListItem) => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(booking)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetails(booking);
        }
      }}
      className="rounded-2xl border border-[#DDECF8] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#B8D4EA] hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#1F2420]">{booking.client?.fullName ?? "Client"}</p>
          <p className="mt-0.5 truncate text-xs text-[#7A6A58]">{booking.client?.phone ?? "No phone"}</p>
        </div>
        <span className="shrink-0 rounded-full border border-[#B8D4EA]/90 bg-[#EEF6FC] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[#1E4A6E]">
          Booking
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[#5E574C]">
        <span className="font-medium text-[#7A6A58]">Services: </span>
        {serviceSummaryFromBooking(booking)}
      </p>
      <dl className="mt-3 grid gap-1 text-[0.7rem] text-[#7A6A58]">
        <div className="flex justify-between gap-2">
          <dt>Time</dt>
          <dd className="font-medium text-[#4A3C2F]">{formatTimeAmPm(booking.slot?.startTime)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Booking</dt>
          <dd className="font-mono font-semibold text-[#1F2420]">{formatBookingRef(booking.id)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Estimated total</dt>
          <dd className="font-semibold text-[#1F2420]">{formatEGP(booking.totalAmount)}</dd>
        </div>
      </dl>
      <div className="mt-3 space-y-2" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          disabled={busy || !canCheckIn}
          onClick={() => onCheckIn(booking)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0E4E75] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0A3F62] disabled:opacity-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Check In
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onNoShow(booking)}
            className="rounded-xl border border-[#E7B9A4]/90 bg-[#FFF9F6] px-3 py-2 text-xs font-semibold text-[#8B4428] shadow-sm transition hover:bg-[#FFF1EC] disabled:opacity-50"
          >
            No-show
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel(booking)}
            className="rounded-xl border border-[#E7B9A4]/90 bg-[#FFF9F6] px-3 py-2 text-xs font-semibold text-[#8B4428] shadow-sm transition hover:bg-[#FFF1EC] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </article>
  );
}

function QueueToast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onClose, 10_000);
    return () => window.clearTimeout(id);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-[80] mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-[#E7B9A4] bg-[#FFF1EC] px-4 py-3 text-sm text-[#8B4428] shadow-lg"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="rounded-md px-1 text-[#8B4428] hover:bg-[#F7DED3]">
        ×
      </button>
    </div>
  );
}

function WarningBadge({ label, tone }: { label: string; tone: "amber" | "red" | "purple" }) {
  const classes =
    tone === "amber"
      ? "bg-amber-100 text-amber-800"
      : tone === "red"
        ? "bg-[#FFF1EC] text-[#8B4428]"
        : "bg-[#F4EDFF] text-[#5B3E91]";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${classes}`}>
      {label}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] px-3 py-2">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#9A8B7A]">{label}</p>
      <p className="mt-1 text-base font-semibold text-[#1F2420]">{value}</p>
    </div>
  );
}

function StageSection({
  stage,
  count,
  activeStage,
  children,
}: {
  stage: Exclude<QueueStageKey, "completed">;
  count: number;
  activeStage: QueueStageKey;
  children: React.ReactNode;
}) {
  const meta = STAGE_META[stage];
  return (
    <section className={`${activeStage === stage ? "block" : "hidden"} space-y-3 lg:block`}>
      <div className={`rounded-2xl border px-3 py-3 ${meta.tone}`}>
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#5E574C]">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} aria-hidden />
          {meta.label} ({count})
        </h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function QueueDetailsDrawer({
  open,
  row,
  booking,
  bookingId,
  loading,
  error,
  serviceStartItem,
  staffOptions,
  selectedStaffId,
  staffLoading,
  serviceBusy,
  serviceError,
  onSelectedStaffChange,
  onStartService,
  onSubmitStartService,
  onCancelStartService,
  onCompleteService,
  onRemoveService,
  canRemoveService,
  onClose,
}: {
  open: boolean;
  row: DashboardQueueEntry | null;
  booking: DashboardBookingDetail | null;
  bookingId: string;
  loading: boolean;
  error: string;
  serviceStartItem: DashboardBookingDetail["items"][number] | null;
  staffOptions: DashboardStaffAvailabilityResponse["staff"];
  selectedStaffId: string;
  staffLoading: boolean;
  serviceBusy: boolean;
  serviceError: string;
  onSelectedStaffChange: (staffId: string) => void;
  onStartService: (item: DashboardBookingDetail["items"][number]) => void;
  onSubmitStartService: () => void;
  onCancelStartService: () => void;
  onCompleteService: (item: DashboardBookingDetail["items"][number]) => void;
  onRemoveService: (item: DashboardBookingDetail["items"][number]) => void;
  canRemoveService: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  const activeItemCount = (booking?.items ?? []).filter((it) => (it.lineStatus ?? "PENDING") !== "CANCELLED").length;
  const removeAllowed =
    canRemoveService &&
    !row?.hasFinalizedInvoice &&
    !booking?.finalizedInvoice &&
    activeItemCount > 1 &&
    (row?.status === "WAITING" || row?.status === "IN_SERVICE");
  const invoice = booking?.finalizedInvoice ?? row?.invoiceSummary ?? null;
  const payments = booking?.payments ?? [];
  const timeline = [
    row?.checkedInAt ? { label: "Checked in", value: formatDateTimeAmPm(row.checkedInAt) } : null,
    row?.startedAt ? { label: "Service started", value: formatDateTimeAmPm(row.startedAt) } : null,
    invoice ? { label: "Invoice finalized", value: "finalizedAt" in invoice ? formatDateTimeAmPm(invoice.finalizedAt) : "Finalized" } : null,
    row?.completedAt ? { label: "Completed", value: formatDateTimeAmPm(row.completedAt) } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <div className="fixed inset-0 z-[65]" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-[#062A2D]/35 backdrop-blur-[2px]"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-[#E8E0D4] bg-[#FFFCF7] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#E8E0D4] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#B9974A]">Visit details</p>
            <h2 className="mt-1 text-xl font-semibold text-[#062A2D]">
              {booking?.client?.fullName ?? row?.clientNameSnapshot ?? "Booking"}
            </h2>
            <p className="mt-1 text-sm text-[#7A6A58]">
              {booking?.client?.phone ?? row?.clientPhoneSnapshot ?? "No phone"} ·{" "}
              {bookingId ? formatBookingRef(bookingId) : "No booking"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#E8E0D4] bg-white p-2 text-[#5E574C] shadow-sm hover:border-[#B9974A]/45"
            aria-label="Close details"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {loading ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-[#7A6A58]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading details…
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-3 py-2 text-xs text-[#8B4428]">
            {error}
          </p>
        ) : null}

        <div className="mt-5 space-y-5">
          <DetailSection title="Booking Details">
            <DetailRow label="Status" value={booking?.status ?? row?.status ?? "—"} />
            <DetailRow label="Source" value={booking?.source ?? row?.source ?? "—"} />
            <DetailRow label="Date" value={booking?.slot?.date ?? "—"} />
            <DetailRow label="Time" value={booking?.slot ? `${formatTimeAmPm(booking.slot.startTime)} - ${formatTimeAmPm(booking.slot.endTime)}` : "—"} />
          </DetailSection>

          <DetailSection title="Services">
            {serviceError ? (
              <p className="mb-3 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-3 py-2 text-xs text-[#8B4428]">
                {serviceError}
              </p>
            ) : null}
            {booking?.items?.length ? (
              <div className="space-y-2">
                {booking.items.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-xl border border-[#F0EBE3] px-3 py-2 ${(item.lineStatus ?? "PENDING") === "CANCELLED" ? "bg-[#F7F4EE] opacity-70" : "bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-sm font-semibold ${(item.lineStatus ?? "PENDING") === "CANCELLED" ? "text-[#7A6A58] line-through" : "text-[#1F2420]"}`}>
                          {item.nameSnapshot}
                        </p>
                        <p className="mt-0.5 text-xs text-[#7A6A58]">
                          {(item.lineStatus ?? "PENDING") === "CANCELLED"
                            ? `Removed · not charged${item.staffDisplayName ? ` · ${item.staffDisplayName}` : ""}`
                            : `${item.lineStatus ?? "PENDING"} · ${item.staffDisplayName ?? "No staff assigned"}`}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className={`text-xs font-semibold ${(item.lineStatus ?? "PENDING") === "CANCELLED" ? "text-[#9A8B7A] line-through" : "text-[#1F2420]"}`}>
                          {formatEGP(item.priceSnapshot * item.quantity)}
                        </span>
                        {removeAllowed && ((item.lineStatus ?? "PENDING") === "PENDING" || item.lineStatus === "IN_PROGRESS") ? (
                          <button
                            type="button"
                            disabled={serviceBusy}
                            onClick={() => onRemoveService(item)}
                            className="rounded-lg border border-[#E7B9A4]/70 bg-white px-2 py-1 text-[0.65rem] font-semibold text-[#8B4428] hover:bg-[#FFF1EC] disabled:opacity-50"
                          >
                            {item.lineStatus === "IN_PROGRESS" ? "Stop & remove" : "Remove"}
                          </button>
                        ) : null}
                      </span>
                    </div>
                    {(item.itemType === "SERVICE" || item.itemType === "SERVICE_VARIANT") && item.catalogServiceId && (item.lineStatus ?? "PENDING") !== "CANCELLED" ? (
                      <div className="mt-3 border-t border-[#F0EBE3] pt-3">
                        {(item.lineStatus ?? "PENDING") === "PENDING" ? (
                          serviceStartItem?.id === item.id ? (
                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-[#7A6A58]">
                                Staff assignment
                                <select
                                  value={selectedStaffId}
                                  onChange={(event) => onSelectedStaffChange(event.target.value)}
                                  disabled={staffLoading || serviceBusy}
                                  className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm"
                                >
                                  <option value="">Select staff</option>
                                  {staffOptions.map((staff) => (
                                    <option key={staff.staffProfileId} value={staff.staffProfileId}>
                                      {staff.displayName} ({staff.status}
                                      {staff.reason ? ` - ${staff.reason}` : ""})
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {staffLoading ? (
                                <p className="flex items-center gap-2 text-xs text-[#7A6A58]">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                  Loading staff availability...
                                </p>
                              ) : null}
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={onCancelStartService}
                                  disabled={serviceBusy}
                                  className="rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-xs font-semibold text-[#1F2420]"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={onSubmitStartService}
                                  disabled={staffLoading || serviceBusy || !selectedStaffId}
                                  className="rounded-xl bg-[#062A2D] px-3 py-2 text-xs font-semibold text-[#F6F2EA] disabled:opacity-50"
                                >
                                  {serviceBusy ? "Starting..." : "Start service"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onStartService(item)}
                              disabled={serviceBusy || row?.status !== "IN_SERVICE"}
                              className="rounded-xl bg-[#062A2D] px-3 py-2 text-xs font-semibold text-[#F6F2EA] disabled:opacity-50"
                            >
                              Start service
                            </button>
                          )
                        ) : null}
                        {(item.lineStatus ?? "PENDING") === "IN_PROGRESS" ? (
                          <button
                            type="button"
                            onClick={() => onCompleteService(item)}
                            disabled={serviceBusy}
                            className="rounded-xl bg-[#0A5A45] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {serviceBusy ? "Saving..." : "Mark service done"}
                          </button>
                        ) : null}
                        {(item.lineStatus ?? "PENDING") === "COMPLETED" ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-800">
                            Done
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#7A6A58]">{row?.serviceSummarySnapshot ?? "No services loaded."}</p>
            )}
          </DetailSection>

          <DetailSection title="Invoice Summary">
            <DetailRow label="Invoice" value={invoice ? ("invoiceNumber" in invoice ? invoice.invoiceNumber : "Finalized") : "No finalized invoice"} />
            <DetailRow label="Total" value={formatEGP(invoice?.totalAmount ?? booking?.totalAmount ?? row?.bookingSummary?.totalAmount ?? 0)} />
            <DetailRow label="Paid" value={formatEGP(invoice?.paidAmount ?? booking?.paidAmount ?? 0)} />
            <DetailRow label="Remaining" value={formatEGP(invoice?.remainingAmount ?? booking?.remainingAmount ?? 0)} />
            {row?.invoiceSummary ? (
              <Link
                href={`/dashboard/invoices/${row.invoiceSummary.invoiceId}/receipt?print=1`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-2 rounded-xl border border-[#D8CBB8] bg-white px-3 py-2 text-xs font-semibold text-[#062A2D] shadow-sm transition hover:bg-[#F7FBFA]"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden />
                Print receipt
              </Link>
            ) : null}
          </DetailSection>

          <DetailSection title="Payment History">
            {payments.length > 0 ? (
              <div className="space-y-2">
                {payments.map((payment) => (
                  <DetailRow
                    key={payment.id}
                    label={`${payment.method} · ${payment.status}`}
                    value={`${formatEGP(payment.amount)} · ${payment.paidAt ? formatDateTimeAmPm(payment.paidAt) : "Pending"}`}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#7A6A58]">No payments recorded.</p>
            )}
          </DetailSection>

          <DetailSection title="Notes">
            <p className="text-sm leading-relaxed text-[#5E574C]">
              {row?.notes ?? booking?.adminNotes ?? booking?.clientNotes ?? "No notes."}
            </p>
          </DetailSection>

          <DetailSection title="Visit Timeline">
            {timeline.length > 0 ? (
              <div className="space-y-2">
                {timeline.map((item) => (
                  <DetailRow key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#7A6A58]">No queue timeline yet.</p>
            )}
          </DetailSection>
        </div>
      </aside>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#B9974A]">{title}</h3>
      <div className="mt-2 rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7] p-3">{children}</div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-[#7A6A58]">{label}</span>
      <span className="text-right font-medium text-[#1F2420]">{value}</span>
    </div>
  );
}

function EmptyColumn({ label = "No entries" }: { label?: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-[#E8E0D4] bg-white/60 px-4 py-8 text-center text-xs text-[#B5A896]">
      {label}
    </p>
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
  const [expectedBookings, setExpectedBookings] = useState<DashboardBookingsListItem[]>([]);
  const [metaDate, setMetaDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [overrideRequest, setOverrideRequest] = useState<{
    message: string;
    resolve: (reason: string | null) => void;
  } | null>(null);
  const askOverride = useCallback(
    (message: string) =>
      new Promise<string | null>((resolve) => {
        setOverrideRequest({ message, resolve });
      }),
    [],
  );
  const { confirm } = useSystemDialog();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bookingBusyId, setBookingBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeStage, setActiveStage] = useState<QueueStageKey>("waiting");
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const [detailCache, setDetailCache] = useState<Record<string, DashboardBookingDetail>>({});
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedQueueRow, setSelectedQueueRow] = useState<DashboardQueueEntry | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<DashboardBookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [drawerServiceItem, setDrawerServiceItem] = useState<DashboardBookingDetail["items"][number] | null>(null);
  const [drawerServiceStaff, setDrawerServiceStaff] = useState("");
  const [drawerStaffOptions, setDrawerStaffOptions] = useState<DashboardStaffAvailabilityResponse["staff"]>([]);
  const [drawerStaffLoading, setDrawerStaffLoading] = useState(false);
  const [drawerServiceBusy, setDrawerServiceBusy] = useState(false);
  const [drawerServiceError, setDrawerServiceError] = useState("");

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

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentRow, setPaymentRow] = useState<DashboardQueueEntry | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountRow, setDiscountRow] = useState<DashboardQueueEntry | null>(null);
  const [discountDetail, setDiscountDetail] = useState<DashboardBookingDetail | null>(null);
  const [discountDetailLoading, setDiscountDetailLoading] = useState(false);
  const [discountType, setDiscountType] = useState<"flat" | "percentage">("flat");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [discountSubmitting, setDiscountSubmitting] = useState(false);
  const [discountError, setDiscountError] = useState("");

  const [startVisitOpen, setStartVisitOpen] = useState(false);
  const [startVisitEntryId, setStartVisitEntryId] = useState("");
  const [startVisitBranchId, setStartVisitBranchId] = useState("");
  const [startVisitBooking, setStartVisitBooking] = useState<DashboardBookingDetail | null>(null);
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

  function openCollectPaymentModal(row: DashboardQueueEntry) {
    setPaymentRow(row);
    setPaymentAmount(String(row.invoiceSummary?.remainingAmount ?? 0));
    setPaymentMethod("CASH");
    setPaymentReference("");
    setPaymentNotes("");
    setPaymentError("");
    setPaymentOpen(true);
  }

  function openDiscountModal(row: DashboardQueueEntry) {
    setDiscountRow(row);
    setDiscountDetail(row.bookingId ? detailCache[row.bookingId] ?? null : null);
    setDiscountType("flat");
    setDiscountValue("");
    setDiscountReason("");
    setDiscountError("");
    setDiscountDetailLoading(false);
    setDiscountOpen(true);
    if (!token || !row.bookingId || detailCache[row.bookingId]) {
      return;
    }
    setDiscountDetailLoading(true);
    void getDashboardBookingById(token, row.bookingId)
      .then((booking) => {
        setDiscountDetail(booking);
        setDetailCache((prev) => ({ ...prev, [booking.id]: booking }));
      })
      .catch(() => {
        setDiscountDetail(null);
      })
      .finally(() => {
        setDiscountDetailLoading(false);
      });
  }

  const canAccessMultipleBranches = useMemo(
    () => user?.branchId === null && canReadBranches,
    [canReadBranches, user?.branchId],
  );

  const loadQueue = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token) {
      return;
    }
    if (!branchId) {
      return;
    }
    if (!opts?.silent) {
      setLoading(true);
      setError("");
    }
    try {
      const [res, bookingsRes] = await Promise.all([
        getDashboardQueue(token, {
        date,
        branchId: branchId || undefined,
        }),
        getDashboardBookings(token, {
          dateFrom: date,
          dateTo: date,
          branchId: branchId || undefined,
          pageSize: 100,
        }),
      ]);
      setRows(res.data);
      setMetaDate(res.meta.date);
      setLastUpdatedAt(new Date());
      setExpectedBookings(
        bookingsRes.data.filter((booking) =>
          ["CONFIRMED", "RESCHEDULED", "ARRIVED"].includes(booking.status),
        ),
      );
      setRefreshFailed(false);
    } catch (requestError) {
      if (opts?.silent) {
        // Background refresh: keep the board as it was and flag it quietly.
        setRefreshFailed(true);
        return;
      }
      setError(formatApiError(requestError));
      setRows([]);
      setExpectedBookings([]);
    } finally {
      if (!opts?.silent) {
        setLoading(false);
      }
    }
  }, [branchId, date, token]);

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

  const anyModalOpen =
    walkOpen || addItemsOpen || paymentOpen || discountOpen || startVisitOpen;
  useEffect(() => {
    if (!token || !branchId) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible" || anyModalOpen) return;
      void loadQueue({ silent: true });
    }, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && !anyModalOpen) {
        void loadQueue({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [anyModalOpen, branchId, loadQueue, token]);

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

  const checkedInBookingIds = useMemo(
    () => new Set(rows.map((row) => row.bookingId).filter((id): id is string => Boolean(id))),
    [rows],
  );
  const searchNeedle = search.trim().toLowerCase();
  const matchesQueueSearch = useCallback(
    (row: DashboardQueueEntry) => {
      if (!searchNeedle) return true;
      return [
        row.clientNameSnapshot,
        row.clientPhoneSnapshot,
        row.bookingId ? formatBookingRef(row.bookingId) : "",
        row.invoiceSummary?.invoiceNumber ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchNeedle);
    },
    [searchNeedle],
  );
  const matchesBookingSearch = useCallback(
    (booking: DashboardBookingsListItem) => {
      if (!searchNeedle) return true;
      return [
        booking.client?.fullName ?? "",
        booking.client?.phone ?? "",
        formatBookingRef(booking.id),
        booking.servicesSummary ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchNeedle);
    },
    [searchNeedle],
  );
  const expected = useMemo(
    () =>
      expectedBookings
        .filter((booking) => !checkedInBookingIds.has(booking.id))
        .filter(matchesBookingSearch)
        .sort((a, b) => (a.slot?.startTime ?? "").localeCompare(b.slot?.startTime ?? "")),
    [checkedInBookingIds, expectedBookings, matchesBookingSearch],
  );
  const waiting = useMemo(
    () => rows.filter((r) => r.status === "WAITING").filter(matchesQueueSearch),
    [matchesQueueSearch, rows],
  );
  const readyToPay = useMemo(
    () =>
      rows
        .filter((r) => r.status === "IN_SERVICE")
        .filter((r) => Boolean(r.invoiceSummary))
        .filter(matchesQueueSearch),
    [matchesQueueSearch, rows],
  );
  const inService = useMemo(
    () =>
      rows
        .filter((r) => r.status === "IN_SERVICE")
        .filter((r) => !r.invoiceSummary)
        .filter(matchesQueueSearch),
    [matchesQueueSearch, rows],
  );
  const completed = useMemo(
    () => rows.filter((r) => r.status === "COMPLETED").filter(matchesQueueSearch),
    [matchesQueueSearch, rows],
  );
  const revenueToday = useMemo(
    () =>
      rows.reduce((sum, row) => {
        if (row.invoiceSummary?.paymentStatus === "PAID" || row.paymentSummary?.isPaid) {
          return sum + (row.invoiceSummary?.paidAmount ?? 0);
        }
        return sum;
      }, 0),
    [rows],
  );

  async function openQueueDetails(row: DashboardQueueEntry): Promise<void> {
    setSelectedQueueRow(row);
    setSelectedBookingId(row.bookingId ?? "");
    setDetailOpen(true);
    setDetailError("");
    if (!token || !row.bookingId) {
      setSelectedBooking(null);
      return;
    }
    if (detailCache[row.bookingId]) {
      setSelectedBooking(detailCache[row.bookingId]);
      return;
    }
    setDetailLoading(true);
    try {
      const detail = await getDashboardBookingById(token, row.bookingId);
      setDetailCache((prev) => ({ ...prev, [detail.id]: detail }));
      setSelectedBooking(detail);
    } catch (requestError) {
      setDetailError(formatApiError(requestError));
      setSelectedBooking(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function openBookingDetails(booking: DashboardBookingsListItem): Promise<void> {
    setSelectedQueueRow(null);
    setSelectedBookingId(booking.id);
    setDetailOpen(true);
    setDetailError("");
    if (!token) return;
    if (detailCache[booking.id]) {
      setSelectedBooking(detailCache[booking.id]);
      return;
    }
    setDetailLoading(true);
    try {
      const detail = await getDashboardBookingById(token, booking.id);
      setDetailCache((prev) => ({ ...prev, [detail.id]: detail }));
      setSelectedBooking(detail);
    } catch (requestError) {
      setDetailError(formatApiError(requestError));
      setSelectedBooking(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function openDrawerStartService(item: DashboardBookingDetail["items"][number]): Promise<void> {
    if (!token || !selectedBooking || !selectedQueueRow || !item.catalogServiceId) return;
    setDrawerServiceItem(item);
    setDrawerServiceStaff("");
    setDrawerStaffOptions([]);
    setDrawerServiceError("");
    setDrawerStaffLoading(true);
    try {
      const res = await getDashboardStaffAvailability(token, {
        branchId: selectedQueueRow.branchId,
        serviceId: item.catalogServiceId,
        date: selectedBooking.slot?.date ?? date,
      });
      setDrawerStaffOptions(res.staff);
      setDrawerServiceStaff(
        res.staff.find((staff) => staff.status === "AVAILABLE")?.staffProfileId ??
          res.staff[0]?.staffProfileId ??
          "",
      );
    } catch (requestError) {
      setDrawerServiceError(formatApiError(requestError));
    } finally {
      setDrawerStaffLoading(false);
    }
  }

  async function submitDrawerStartService(): Promise<void> {
    if (!token || !selectedBooking || !drawerServiceItem) return;
    if (!drawerServiceStaff) {
      setDrawerServiceError("Choose a staff member before starting this service.");
      return;
    }
    setDrawerServiceBusy(true);
    setDrawerServiceError("");
    try {
      const body: { staffProfileId: string; overrideReason?: string } = {
        staffProfileId: drawerServiceStaff,
      };
      let updated: DashboardBookingDetail;
      try {
        updated = await postDashboardBookingServiceItemStart(token, selectedBooking.id, drawerServiceItem.id, body);
      } catch (firstError) {
        if (!(firstError instanceof ApiClientError) || !firstError.overridable) throw firstError;
        const reason = await askOverride(firstError.message);
        if (!reason) {
          setDrawerServiceBusy(false);
          return;
        }
        body.overrideReason = reason;
        updated = await postDashboardBookingServiceItemStart(token, selectedBooking.id, drawerServiceItem.id, body);
      }
      setDetailCache((prev) => ({ ...prev, [updated.id]: updated }));
      setSelectedBooking(updated);
      setDrawerServiceItem(null);
      setDrawerServiceStaff("");
      await loadQueue();
    } catch (requestError) {
      setDrawerServiceError(formatApiError(requestError));
    } finally {
      setDrawerServiceBusy(false);
    }
  }

  async function completeDrawerService(item: DashboardBookingDetail["items"][number]): Promise<void> {
    if (!token || !selectedBooking) return;
    setDrawerServiceBusy(true);
    setDrawerServiceError("");
    try {
      const updated = await postDashboardBookingServiceItemComplete(token, selectedBooking.id, item.id);
      setDetailCache((prev) => ({ ...prev, [updated.id]: updated }));
      setSelectedBooking(updated);
      await loadQueue();
    } catch (requestError) {
      setDrawerServiceError(formatApiError(requestError));
    } finally {
      setDrawerServiceBusy(false);
    }
  }

  async function prepareStartVisit(id: string): Promise<void> {
    if (!token) {
      return;
    }
    const row = rows.find((r) => r.id === id);
    if (!row?.bookingId) {
      setError("This queue row is not linked to a booking.");
      return;
    }
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
    const starts: { bookingItemId: string; staffProfileId: string; overrideReason?: string }[] = [
      { bookingItemId: it.id, staffProfileId: picked },
    ];
    setStartVisitSubmitting(true);
    try {
      try {
        await postDashboardQueueEntryAction(token, startVisitEntryId, "start", { starts });
      } catch (firstError) {
        if (!(firstError instanceof ApiClientError) || !firstError.overridable) throw firstError;
        const reason = await askOverride(firstError.message);
        if (!reason) {
          setStartVisitSubmitting(false);
          return;
        }
        starts[0].overrideReason = reason;
        await postDashboardQueueEntryAction(token, startVisitEntryId, "start", { starts });
      }
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
      try {
        await postDashboardQueueEntryAction(token, id, action);
      } catch (firstError) {
        if (
          action !== "complete" ||
          !(firstError instanceof ApiClientError) ||
          !firstError.overridable
        ) {
          throw firstError;
        }
        const reason = await askOverride(firstError.message);
        if (!reason) return;
        await postDashboardQueueEntryAction(token, id, action, { closeWithBalanceReason: reason });
      }
      await loadQueue();
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setBusyId(null);
    }
  }

  async function runBookingAction(
    booking: DashboardBookingsListItem,
    action: "check-in" | "cancel" | "mark-no-show",
  ): Promise<void> {
    if (!token) return;
    setBookingBusyId(booking.id);
    setError("");
    try {
      if (action === "check-in") {
        await postDashboardBookingQueueCheckIn(token, booking.id);
      } else {
        await postDashboardBookingAction(token, booking.id, action);
      }
      await loadQueue();
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setBookingBusyId(null);
    }
  }

  /**
   * Remove a service line during a visit. PENDING → plain confirm + delete.
   * IN_PROGRESS → the API answers with an overridable 409; we ask for a reason and retry,
   * and the line is kept as CANCELLED (not charged).
   */
  async function removeBookingLine(
    bookingId: string,
    line: { id: string; name: string; lineStatus: string },
  ): Promise<DashboardBookingDetail | null> {
    if (!token) return null;
    if (line.lineStatus === "PENDING") {
      const ok = await confirm({
        title: "Remove service?",
        message: `Remove “${line.name}” from this visit? The total will be recalculated.`,
        tone: "danger",
        confirmLabel: "Remove",
      });
      if (!ok) return null;
    }
    try {
      return await deleteDashboardBookingItem(token, bookingId, line.id);
    } catch (firstError) {
      if (!(firstError instanceof ApiClientError) || !firstError.overridable) throw firstError;
      const reason = await askOverride(firstError.message);
      if (!reason) return null;
      return await deleteDashboardBookingItem(token, bookingId, line.id, { reason });
    }
  }

  async function removeLine(row: DashboardQueueEntry, line: { id: string; name: string; lineStatus: string }): Promise<void> {
    if (!token || !row.bookingId) return;
    setBusyId(row.id);
    setError("");
    try {
      const refreshed = await removeBookingLine(row.bookingId, line);
      if (refreshed) {
        setDetailCache((prev) => ({ ...prev, [refreshed.id]: refreshed }));
        if (selectedBookingId === row.bookingId) setSelectedBooking(refreshed);
        await loadQueue({ silent: true });
      }
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setBusyId(null);
    }
  }

  async function removeDrawerService(item: DashboardBookingDetail["items"][number]): Promise<void> {
    if (!token || !selectedBooking) return;
    setDrawerServiceBusy(true);
    setDrawerServiceError("");
    try {
      const refreshed = await removeBookingLine(selectedBooking.id, {
        id: item.id,
        name: item.nameSnapshot,
        lineStatus: item.lineStatus ?? "PENDING",
      });
      if (refreshed) {
        setDetailCache((prev) => ({ ...prev, [refreshed.id]: refreshed }));
        setSelectedBooking(refreshed);
        await loadQueue({ silent: true });
      }
    } catch (requestError) {
      setDrawerServiceError(formatApiError(requestError));
    } finally {
      setDrawerServiceBusy(false);
    }
  }

  async function completeLine(row: DashboardQueueEntry, lineId: string): Promise<void> {
    if (!token || !row.bookingId) return;
    setBusyId(row.id);
    setError("");
    try {
      const refreshed = await postDashboardBookingServiceItemComplete(token, row.bookingId, lineId);
      setDetailCache((prev) => ({ ...prev, [refreshed.id]: refreshed }));
      if (selectedBookingId === row.bookingId) {
        setSelectedBooking(refreshed);
      }
      await loadQueue({ silent: true });
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setBusyId(null);
    }
  }

  async function finishService(row: DashboardQueueEntry): Promise<void> {
    if (!token || !row.bookingId) return;
    setBusyId(row.id);
    setError("");
    try {
      const detail = detailCache[row.bookingId] ?? (await getDashboardBookingById(token, row.bookingId));
      setDetailCache((prev) => ({ ...prev, [detail.id]: detail }));
      const activeLines = collectInProgressServiceLines(detail);
      for (const line of activeLines) {
        await postDashboardBookingServiceItemComplete(token, detail.id, line.id);
      }
      if (!row.hasFinalizedInvoice) {
        await postDashboardQueueInvoiceFinalize(token, row.id);
      }
      await loadQueue();
      const refreshed = await getDashboardBookingById(token, row.bookingId);
      setDetailCache((prev) => ({ ...prev, [refreshed.id]: refreshed }));
      if (selectedBookingId === row.bookingId) {
        setSelectedBooking(refreshed);
      }
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
      const bookingIdToRefresh = addItemsBookingId;
      setAddItemsOpen(false);
      setAddItemsEntryId("");
      setAddItemsBookingId("");
      setAddItemsDetail(null);
      if (bookingIdToRefresh) {
        setDetailCache((prev) => {
          const next = { ...prev };
          delete next[bookingIdToRefresh];
          return next;
        });
        if (selectedBookingId === bookingIdToRefresh) {
          const refreshedBooking = await getDashboardBookingById(token, bookingIdToRefresh);
          setDetailCache((prev) => ({ ...prev, [refreshedBooking.id]: refreshedBooking }));
          setSelectedBooking(refreshedBooking);
        }
      }
      await loadQueue();
    } catch (requestError) {
      setAddItemsError(formatApiError(requestError));
    } finally {
      setAddItemsSubmitting(false);
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

  async function submitDiscount(): Promise<void> {
    if (!token || !discountRow?.bookingId) return;
    const rawValue = Number(discountValue);
    const reason = discountReason.trim();
    if (!Number.isFinite(rawValue) || rawValue <= 0) {
      setDiscountError("Enter a valid discount value.");
      return;
    }
    if (!reason) {
      setDiscountError("Enter the discount reason (required; discounts above the reception limit need a manager).");
      return;
    }

    const baseAmount =
      discountDetail?.subtotal ??
      discountRow.invoiceSummary?.totalAmount ??
      discountRow.bookingSummary?.totalAmount ??
      0;
    if (baseAmount <= 0) {
      setDiscountError("This visit has no billable total to discount.");
      return;
    }
    if (discountType === "percentage" && rawValue > 100) {
      setDiscountError("Percentage discount cannot be more than 100%.");
      return;
    }

    const discountAmount =
      discountType === "percentage"
        ? Number(((baseAmount * rawValue) / 100).toFixed(2))
        : Number(rawValue.toFixed(2));
    if (discountAmount <= 0) {
      setDiscountError("Enter a valid discount value.");
      return;
    }
    if (discountAmount > baseAmount) {
      setDiscountError(`Discount cannot exceed ${formatEGP(baseAmount)}.`);
      return;
    }

    setDiscountSubmitting(true);
    setDiscountError("");
    try {
      await postDashboardBookingAction(token, discountRow.bookingId, "discount", {
        discountAmount,
        reason,
      });
      const bookingIdToRefresh = discountRow.bookingId;
      setDiscountOpen(false);
      setDiscountRow(null);
      setDiscountDetail(null);
      setDetailCache((prev) => {
        const next = { ...prev };
        delete next[bookingIdToRefresh];
        return next;
      });
      if (selectedBookingId === bookingIdToRefresh) {
        const refreshedBooking = await getDashboardBookingById(token, bookingIdToRefresh);
        setDetailCache((prev) => ({ ...prev, [refreshedBooking.id]: refreshedBooking }));
        setSelectedBooking(refreshedBooking);
      }
      await loadQueue();
    } catch (requestError) {
      setDiscountError(formatApiError(requestError));
    } finally {
      setDiscountSubmitting(false);
    }
  }

  function renderQueueCard(row: DashboardQueueEntry, stage: Exclude<QueueStageKey, "expected">) {
    const detail = row.bookingId ? detailCache[row.bookingId] : null;
    return (
      <CommandQueueCard
        key={row.id}
        row={row}
        stage={stage}
        detail={detail}
        canManageQueue={canManageQueue}
        canProgressVisit={canProgressVisit}
        canAddItems={canAddQueueItems}
        onStart={(id) => void runAction(id, "start")}
        onFinishService={(r) => void finishService(r)}
        onComplete={(id) => void runAction(id, "complete")}
        onCancel={(id) => void runAction(id, "cancel")}
        onAddItems={(r) => openAddItemsModal(r)}
        onCollectPayment={(r) => openCollectPaymentModal(r)}
        onDiscount={(r) => openDiscountModal(r)}
        onOpenDetails={(r) => void openQueueDetails(r)}
        onCompleteLine={(r, lineId) => void completeLine(r, lineId)}
        onRemoveLine={(r, line) => void removeLine(r, line)}
        busyId={busyId}
        startVisitModalOpen={startVisitOpen}
      />
    );
  }

  return (
    <PermissionGuard permission="queue.read">
      <QueueToast message={error} onClose={() => setError("")} />
      <OverrideReasonDialog request={overrideRequest} onClose={() => setOverrideRequest(null)} />
      <div className="min-h-[calc(100vh-4rem)] bg-[#FBF8F2] px-4 py-8 text-[#1F2420] sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1800px] space-y-6">
          <header className="flex flex-col gap-4 border-b border-[#E8E0D4]/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#062A2D] text-[#F6F2EA] shadow-lg shadow-[#062A2D]/15">
                <ClipboardList className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-[#062A2D]">
                  Receptionist Command Center
                </h1>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-[#7A6A58]">
                  Daily client flow for expected bookings, walk-ins, active service, payment, receipts, and completed visits for{" "}
                  <span className="font-medium text-[#4A3C2F]">{metaDate || date}</span>
                  {lastUpdatedAt ? (
                    <span className={refreshFailed ? "text-[#8B4428]" : "text-[#B5A896]"}>
                      {" "}· Updated {lastUpdatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      {refreshFailed ? " (last refresh failed, retrying)" : ""}
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
                  Add Walk-in
                </button>
              ) : null}
            </div>
          </header>

          <div className="rounded-2xl border border-[#E8E0D4]/70 bg-white p-4 shadow-sm ring-1 ring-[#F7F4EE]/80">
            <div className="flex flex-wrap items-end gap-4">
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
              Selected date
              <span className="flex items-center gap-2 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2">
                <CalendarDays className="h-4 w-4 text-[#B9974A]" aria-hidden />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-[#1F2420] outline-none"
              />
              </span>
            </label>
              <label className="flex min-w-[240px] flex-[1.4] flex-col gap-1 text-xs font-medium text-[#7A6A58]">
                Search
                <span className="flex items-center gap-2 rounded-xl border border-[#E8E0D4] bg-white px-3 py-2">
                  <Search className="h-4 w-4 text-[#B9974A]" aria-hidden />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, phone, booking code, invoice"
                    className="w-full bg-transparent text-sm font-medium text-[#1F2420] outline-none placeholder:text-[#B5A896]"
                  />
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {canWalkIn ? (
                  <button
                    type="button"
                    onClick={() => openWalkInModal()}
                    className="rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] shadow-sm transition hover:bg-[#0A3F35]"
                  >
                    Add Walk-in
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="rounded-xl border border-[#E8E0D4] bg-[#FFFCF7] px-4 py-2 text-sm font-semibold text-[#062A2D] shadow-sm transition hover:border-[#B9974A]/45"
                >
                  Check-in Booking
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <Metric label="Expected" value={expected.length} />
              <Metric label="Waiting" value={waiting.length} />
              <Metric label="In Service" value={inService.length} />
              <Metric label="Ready to Pay" value={readyToPay.length} />
              <Metric label="Completed" value={completed.length} />
              <Metric label="Revenue Today" value={formatEGP(revenueToday)} />
            </div>
          </div>

          {error ? (
            <p className="flex items-center gap-2 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-4 py-3 text-sm text-[#8B4428]">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          <div className="lg:hidden">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {(["waiting", "inService", "readyToPay", "completed"] as QueueStageKey[]).map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setActiveStage(stage)}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold ${
                    activeStage === stage
                      ? "border-[#062A2D] bg-[#062A2D] text-white"
                      : "border-[#E8E0D4] bg-white text-[#5E574C]"
                  }`}
                >
                  {STAGE_META[stage].label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#B9974A]" aria-label="Loading" />
            </div>
          ) : (
            <div className="space-y-5">
              <section className="space-y-3">
                <div className={`rounded-2xl border px-3 py-3 ${STAGE_META.expected.tone}`}>
                  <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#5E574C]">
                    <span className={`h-2 w-2 rounded-full ${STAGE_META.expected.dot}`} aria-hidden />
                    Expected Today ({expected.length})
                  </h2>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                {expected.length === 0 ? (
                  <EmptyColumn label="No unchecked bookings" />
                ) : (
                  expected.map((booking) => (
                    <div key={booking.id} className="w-[17.5rem] shrink-0">
                    <ExpectedBookingCard
                      booking={booking}
                      busy={bookingBusyId === booking.id}
                      canCheckIn={canManageQueue && canProgressVisit}
                      onCheckIn={(b) => void runBookingAction(b, "check-in")}
                      onOpenDetails={(b) => void openBookingDetails(b)}
                      onCancel={(b) => void runBookingAction(b, "cancel")}
                      onNoShow={(b) => void runBookingAction(b, "mark-no-show")}
                    />
                    </div>
                  ))
                )}
                </div>
              </section>
              <div className="grid gap-4 lg:grid-cols-4">
              <StageSection stage="waiting" count={waiting.length} activeStage={activeStage}>
                {waiting.length === 0 ? <EmptyColumn /> : waiting.map((row) => renderQueueCard(row, "waiting"))}
              </StageSection>
              <StageSection stage="inService" count={inService.length} activeStage={activeStage}>
                {inService.length === 0 ? <EmptyColumn /> : inService.map((row) => renderQueueCard(row, "inService"))}
              </StageSection>
              <StageSection stage="readyToPay" count={readyToPay.length} activeStage={activeStage}>
                {readyToPay.length === 0 ? <EmptyColumn label="No visits waiting for payment" /> : readyToPay.map((row) => renderQueueCard(row, "readyToPay"))}
              </StageSection>
              <section className={`${activeStage === "completed" ? "block" : "hidden"} space-y-3 lg:block`}>
                <button
                  type="button"
                  onClick={() => setCompletedCollapsed((v) => !v)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left ${STAGE_META.completed.tone}`}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#5E574C]">
                    <span className={`h-2 w-2 rounded-full ${STAGE_META.completed.dot}`} aria-hidden />
                    Completed ({completed.length})
                  </span>
                  <ChevronDown className={`h-4 w-4 text-[#7A6A58] transition ${completedCollapsed ? "" : "rotate-180"}`} aria-hidden />
                </button>
                {!completedCollapsed || activeStage === "completed" ? (
                  <div className="space-y-3">
                    {completed.length === 0 ? <EmptyColumn /> : completed.map((row) => renderQueueCard(row, "completed"))}
                  </div>
                ) : null}
              </section>
              </div>
            </div>
          )}
        </div>

        <QueueDetailsDrawer
          open={detailOpen}
          row={selectedQueueRow}
          booking={selectedBooking}
          bookingId={selectedBookingId}
          loading={detailLoading}
          error={detailError}
          serviceStartItem={drawerServiceItem}
          staffOptions={drawerStaffOptions}
          selectedStaffId={drawerServiceStaff}
          staffLoading={drawerStaffLoading}
          serviceBusy={drawerServiceBusy}
          serviceError={drawerServiceError}
          onSelectedStaffChange={setDrawerServiceStaff}
          onStartService={(item) => void openDrawerStartService(item)}
          onSubmitStartService={() => void submitDrawerStartService()}
          onCancelStartService={() => {
            setDrawerServiceItem(null);
            setDrawerServiceError("");
            setDrawerServiceStaff("");
          }}
          onCompleteService={(item) => void completeDrawerService(item)}
          onRemoveService={(item) => void removeDrawerService(item)}
          canRemoveService={canAddQueueItems}
          onClose={() => {
            setDetailOpen(false);
            setSelectedQueueRow(null);
            setSelectedBookingId("");
            setSelectedBooking(null);
            setDetailError("");
            setDrawerServiceItem(null);
            setDrawerServiceError("");
          }}
        />

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
                    clientId={walkMode === "existing" ? walkClientId || null : null}
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
                  clientId={addItemsDetail?.client?.id ?? null}
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

        {discountOpen && discountRow ? (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div className="w-full max-w-md rounded-3xl border border-[#E8E0D4] bg-[#FFFCF7] p-6 shadow-2xl">
              <h2 className="text-lg font-semibold text-[#062A2D]">Make discount</h2>
              <p className="mt-1 text-xs text-[#7A6A58]">
                Current invoice total: {formatEGP(discountRow.invoiceSummary?.totalAmount ?? 0)}
              </p>
              {discountDetailLoading ? (
                <p className="mt-3 flex items-center gap-2 text-xs text-[#7A6A58]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Loading booking totals...
                </p>
              ) : null}
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-medium text-[#7A6A58]">
                  Discount type
                  <select
                    value={discountType}
                    onChange={(event) => setDiscountType(event.target.value as "flat" | "percentage")}
                    className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm"
                  >
                    <option value="flat">Flat amount</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-[#7A6A58]">
                  Discount value
                  <input
                    type="number"
                    min="0.01"
                    max={discountType === "percentage" ? "100" : undefined}
                    step="0.01"
                    value={discountValue}
                    onChange={(event) => setDiscountValue(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm"
                    placeholder={discountType === "percentage" ? "10" : "100.00"}
                  />
                </label>
                <label className="block text-xs font-medium text-[#7A6A58]">
                  Reason
                  <textarea
                    rows={3}
                    value={discountReason}
                    onChange={(event) => setDiscountReason(event.target.value)}
                    className="mt-1 w-full resize-none rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm"
                    placeholder="Manager approval, service recovery, loyalty gesture..."
                  />
                </label>
              </div>
              {discountError ? (
                <p className="mt-3 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-3 py-2 text-xs text-[#8B4428]">
                  {discountError}
                </p>
              ) : null}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDiscountOpen(false);
                    setDiscountRow(null);
                    setDiscountDetail(null);
                  }}
                  className="rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm font-semibold text-[#1F2420]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={discountSubmitting || discountDetailLoading}
                  onClick={() => void submitDiscount()}
                  className="rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] disabled:opacity-50"
                >
                  {discountSubmitting ? "Applying..." : "Apply Discount"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PermissionGuard>
  );
}
