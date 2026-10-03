"use client";

import type { DashboardBookingDetail, DashboardSlot } from "@rouby/api-client";
import { formatDayLabel, formatWallClockRange12h } from "@rouby/wall-clock";
import { AlertCircle, History, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { slotStatusLabel } from "@/lib/labels";

export type DrawerAction =
  | "confirm"
  | "reject"
  | "reschedule"
  | "confirm-reschedule"
  | "cancel"
  | "mark-arrived"
  | "mark-in-progress"
  | "mark-no-show"
  | "recalculate-pricing"
  | "discount";

export type DrawerPanel = "reschedule" | "discount" | null;

const primaryActionClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#062A2D] px-3.5 py-2 text-xs font-semibold text-[#F6F2EA] shadow-sm transition hover:bg-[#0A3F35] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryActionClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E8E0D4] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45 hover:text-[#062A2D] disabled:cursor-not-allowed disabled:opacity-50";
const dangerOutlineClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E7B9A4]/90 bg-[#FFF9F6] px-3.5 py-2 text-xs font-semibold text-[#8B4428] shadow-sm transition hover:bg-[#FFF1EC] disabled:cursor-not-allowed disabled:opacity-50";
const menuItemClass =
  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#1F2420] transition hover:bg-[#F7F4EE] focus:bg-[#F7F4EE] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-[#B9974A]/50";

export type BookingActionBarProps = {
  detail: DashboardBookingDetail;
  canConfirm: boolean;
  canReject: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  canUpdate: boolean;
  canDiscount: boolean;
  canProgress: boolean;
  canQueueRead: boolean;
  canReadAudit: boolean;
  /** Spec v2 §6: only once the appointment start has passed. */
  canMarkNoShow: boolean;
  canDirectChange: boolean;
  canQueueCheckIn: boolean;
  busy: boolean;
  checkInLoading: boolean;
  actionError: string;
  panel: DrawerPanel;
  onPanelChange: (panel: DrawerPanel) => void;
  onAction: (action: DrawerAction) => void;
  onCheckIn: () => void;
  slots: DashboardSlot[];
  rescheduleDate: string;
  onRescheduleDateChange: (ymd: string) => void;
  rescheduleSlotId: string;
  onRescheduleSlotChange: (id: string) => void;
  discountAmount: string;
  onDiscountAmountChange: (v: string) => void;
  discountReason: string;
  onDiscountReasonChange: (v: string) => void;
};

export function BookingActionBar(props: BookingActionBarProps) {
  const {
    detail,
    canConfirm,
    canReject,
    canCancel,
    canReschedule,
    canUpdate,
    canDiscount,
    canProgress,
    canQueueRead,
    canReadAudit,
    canMarkNoShow,
    canDirectChange,
    canQueueCheckIn,
    busy,
    checkInLoading,
    actionError,
    panel,
    onPanelChange,
    onAction,
    onCheckIn,
  } = props;
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [moreOpen]);

  const status = detail.status;
  const inQueue = Boolean(detail.activeQueueEntryId);
  const pending = status === "PENDING";
  const rescheduleAllowed = canReschedule && canDirectChange;
  const cancelAllowed = canCancel && canDirectChange;
  const confirmRescheduleAllowed = rescheduleAllowed && canConfirm && status === "RESCHEDULED";
  const queueActive = status === "ARRIVED" || status === "IN_PROGRESS";
  const checkInInBar = canQueueCheckIn && (status === "CONFIRMED" || status === "RESCHEDULED" || (status === "ARRIVED" && !inQueue));
  const showOpenQueue = queueActive && canQueueRead;
  const showReceipt = status === "COMPLETED" && Boolean(detail.finalizedInvoice);
  // Reschedule / Cancel sit in the bar for confirmed bookings; for the other states they move to "More".
  const bookingChangeInBar = status === "CONFIRMED" || status === "RESCHEDULED";

  const noShowItem = canProgress && canMarkNoShow;
  const moreHasReschedule = rescheduleAllowed && !bookingChangeInBar;
  const moreHasCancel = cancelAllowed && !bookingChangeInBar;
  const hasMore =
    noShowItem || canDiscount || canUpdate || canReadAudit || moreHasReschedule || moreHasCancel;

  function choose(fn: () => void) {
    setMoreOpen(false);
    fn();
  }

  const hasAnyBarAction =
    (pending && (canConfirm || canReject)) ||
    checkInInBar ||
    showOpenQueue ||
    showReceipt ||
    confirmRescheduleAllowed ||
    (bookingChangeInBar && (rescheduleAllowed || cancelAllowed)) ||
    hasMore;

  if (!hasAnyBarAction && !actionError && panel === null) {
    return null;
  }

  const selectableSlots = props.slots.filter((slot) => slot.id !== detail.slotId);

  return (
    <div className="shrink-0 border-t border-[#E8E0D4] bg-white/95 px-4 py-3 shadow-[0_-6px_18px_rgba(31,36,32,0.06)] sm:px-5">
      {actionError ? (
        <p
          role="alert"
          className="mb-3 flex gap-2 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-3 py-2 text-sm text-[#8B4428]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {actionError}
        </p>
      ) : null}

      {panel === "reschedule" && rescheduleAllowed ? (
        <div className="mb-3 space-y-2 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3">
          <p className="text-xs font-semibold text-[#1F2420]">Move to a new day and time</p>
          <input
            type="date"
            aria-label="New day"
            value={props.rescheduleDate}
            onChange={(event) => props.onRescheduleDateChange(event.target.value)}
            className={inputClass}
          />
          <select
            aria-label="New time"
            id="reschedule-slot"
            value={props.rescheduleSlotId}
            onChange={(event) => props.onRescheduleSlotChange(event.target.value)}
            className={inputClass}
          >
            <option value="">{selectableSlots.length > 0 ? "Select a time" : "No slots on this day"}</option>
            {selectableSlots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {formatDayLabel(slot.date)} · {formatWallClockRange12h(slot.startTime, slot.endTime, " – ")}
                {slot.status !== "AVAILABLE" ? ` (${slotStatusLabel(slot.status).toLowerCase()})` : ""}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAction("reschedule")}
              disabled={busy || !props.rescheduleSlotId}
              className={primaryActionClass}
            >
              Move booking
            </button>
            <button type="button" onClick={() => onPanelChange(null)} className={secondaryActionClass}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {panel === "discount" && canDiscount ? (
        <div className="mb-3 space-y-2 rounded-xl border border-[#F0EBE3] bg-[#FFFCF7] p-3">
          <p className="text-xs font-semibold text-[#1F2420]">Discount on the whole booking</p>
          <input
            type="number"
            min={0}
            value={props.discountAmount}
            onChange={(event) => props.onDiscountAmountChange(event.target.value)}
            placeholder="Discount amount"
            aria-label="Discount amount"
            className={inputClass}
          />
          <input
            value={props.discountReason}
            onChange={(event) => props.onDiscountReasonChange(event.target.value)}
            placeholder="Reason (optional)"
            aria-label="Discount reason"
            className={inputClass}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onAction("discount")} disabled={busy} className={primaryActionClass}>
              Apply discount
            </button>
            <button type="button" onClick={() => onPanelChange(null)} className={secondaryActionClass}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {pending && canConfirm ? (
          <button type="button" onClick={() => onAction("confirm")} disabled={busy} className={primaryActionClass}>
            Confirm
          </button>
        ) : null}

        {checkInInBar ? (
          <button
            type="button"
            onClick={onCheckIn}
            disabled={checkInLoading || busy || inQueue}
            className={status === "ARRIVED" ? secondaryActionClass : primaryActionClass}
          >
            {checkInLoading ? "Checking in…" : inQueue ? "In queue" : "Check in"}
          </button>
        ) : null}

        {showOpenQueue ? (
          <Link
            href="/dashboard/queue"
            className={checkInInBar || (status === "ARRIVED" && !inQueue) ? secondaryActionClass : primaryActionClass}
          >
            Open in queue
          </Link>
        ) : null}

        {showReceipt && detail.finalizedInvoice ? (
          <Link
            href={`/dashboard/invoices/${detail.finalizedInvoice.id}/receipt`}
            target="_blank"
            rel="noreferrer"
            className={primaryActionClass}
          >
            View receipt
          </Link>
        ) : null}

        {confirmRescheduleAllowed ? (
          <button
            type="button"
            onClick={() => onAction("confirm-reschedule")}
            disabled={busy}
            className={checkInInBar ? secondaryActionClass : primaryActionClass}
          >
            Confirm reschedule
          </button>
        ) : null}

        {bookingChangeInBar && rescheduleAllowed ? (
          <button
            type="button"
            onClick={() => onPanelChange(panel === "reschedule" ? null : "reschedule")}
            aria-expanded={panel === "reschedule"}
            disabled={busy}
            className={secondaryActionClass}
          >
            Reschedule
          </button>
        ) : null}

        {pending && canReject ? (
          <button type="button" onClick={() => onAction("reject")} disabled={busy} className={dangerOutlineClass}>
            Reject
          </button>
        ) : null}

        {bookingChangeInBar && cancelAllowed ? (
          <button type="button" onClick={() => onAction("cancel")} disabled={busy} className={dangerOutlineClass}>
            Cancel booking
          </button>
        ) : null}

        {hasMore ? (
          <div
            ref={moreRef}
            className="relative ml-auto"
            onKeyDown={(event) => {
              if (event.key === "Escape" && moreOpen) {
                event.stopPropagation();
                setMoreOpen(false);
                moreButtonRef.current?.focus();
              }
            }}
          >
            <button
              ref={moreButtonRef}
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              className={secondaryActionClass}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
              More
            </button>
            {moreOpen ? (
              <div
                role="menu"
                className="absolute bottom-full right-0 z-10 mb-2 w-52 rounded-xl border border-[#E8E0D4] bg-white p-1 shadow-[0_8px_30px_rgba(31,36,32,0.15)]"
              >
                {moreHasReschedule ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    onClick={() => choose(() => onPanelChange("reschedule"))}
                  >
                    Reschedule
                  </button>
                ) : null}
                {noShowItem ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    className={`${menuItemClass} text-[#8B4428]`}
                    onClick={() => choose(() => onAction("mark-no-show"))}
                  >
                    Mark no-show
                  </button>
                ) : null}
                {canDiscount ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    onClick={() => choose(() => onPanelChange("discount"))}
                  >
                    Discount
                  </button>
                ) : null}
                {canUpdate ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    className={menuItemClass}
                    onClick={() => choose(() => onAction("recalculate-pricing"))}
                  >
                    Recalculate pricing
                  </button>
                ) : null}
                {moreHasCancel ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    className={`${menuItemClass} text-[#8B4428]`}
                    onClick={() => choose(() => onAction("cancel"))}
                  >
                    Cancel booking
                  </button>
                ) : null}
                {canReadAudit ? (
                  <Link
                    role="menuitem"
                    href={`/dashboard/audit-logs?bookingId=${encodeURIComponent(detail.id)}`}
                    className={menuItemClass}
                  >
                    <History className="h-3.5 w-3.5" aria-hidden />
                    History
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
