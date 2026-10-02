"use client";

import {
  ApiClientError,
  getDashboardClients,
  getDashboardSlots,
  postDashboardCreateBooking,
  type DashboardBookingDetail,
  type DashboardCreateBookingInput,
  type DashboardBranch,
  type DashboardClient,
  type DashboardSlot,
} from "@rouby/api-client";
import { formatDayLabel, formatWallClockRange12h } from "@rouby/wall-clock";
import { AlertCircle, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  DashboardServiceVariantLinesBlock,
  type DashboardServiceVariantLinesBlockHandle,
  type ServiceLineRow,
} from "./dashboard-service-variant-lines-block";

const BOOKING_SOURCES = [
  "PHONE",
  "WALK_IN",
  "DASHBOARD",
  "WHATSAPP",
  "INSTAGRAM",
  "FACEBOOK",
] as const;

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "SLOT_AT_CAPACITY") {
      return "Slot is at capacity.";
    }
    if (error.code === "SERVICE_VARIANT_REQUIRED") {
      return "That service needs a variant — pick the variant option below the service.";
    }
    if (error.code === "STAFF_PRICE_REQUIRED") {
      return "Enter a staff price (and duration if needed) for that service — it is not priced for online booking.";
    }
    if (error.code === "STAFF_OVERRIDE_PRICE_INVALID" || error.code === "STAFF_OVERRIDE_DURATION_INVALID") {
      return "Check the staff price and duration values (numbers only).";
    }
    if (error.code === "INVALID_BOOKING_SOURCE") {
      return "Invalid booking source for dashboard.";
    }
    if (error.code === "ENHANCEMENT_INACTIVE" || error.code === "ENHANCEMENT_NOT_PRICEABLE") {
      return "That add-on cannot be booked (inactive or missing price).";
    }
    if (error.statusCode === 403) {
      return "You do not have permission to create this booking.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error.";
}

type DashboardCreateBookingDialogProps = {
  open: boolean;
  onClose: () => void;
  token: string;
  branches: DashboardBranch[];
  initialBranchId: string;
  branchSelectDisabled: boolean;
  onCreated: (detail: DashboardBookingDetail) => void;
  /** When opening from a client row, pre-select that client in the form. */
  presetClient?: { id: string; fullName: string; phone?: string | null } | null;
};

export function DashboardCreateBookingDialog({
  open,
  onClose,
  token,
  branches,
  initialBranchId,
  branchSelectDisabled,
  onCreated,
  presetClient = null,
}: DashboardCreateBookingDialogProps) {
  const [branchId, setBranchId] = useState(initialBranchId);
  const [clientSearch, setClientSearch] = useState("");
  const [clientSearchDebounced, setClientSearchDebounced] = useState("");
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clients, setClients] = useState<DashboardClient[]>([]);
  const [clientId, setClientId] = useState("");
  const [slotDate, setSlotDate] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slots, setSlots] = useState<DashboardSlot[]>([]);
  const [slotId, setSlotId] = useState("");
  const [source, setSource] = useState<string>("PHONE");
  const [initialStatus, setInitialStatus] = useState<string>("PENDING");
  const [adminNotes, setAdminNotes] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  const [lines, setLines] = useState<ServiceLineRow[]>([{ key: "a", serviceId: "", variantId: "" }]);
  const linesBlockRef = useRef<DashboardServiceVariantLinesBlockHandle>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");


  useEffect(() => {
    if (!open) {
      return;
    }
    setBranchId(initialBranchId || branches[0]?.id || "");
  }, [open, initialBranchId, branches]);

  useEffect(() => {
    if (!open || !presetClient?.id) {
      return;
    }
    setClientId(presetClient.id);
    const label = [presetClient.fullName, presetClient.phone].filter(Boolean).join(" · ");
    setClientSearch(label);
    setClients([]);
  }, [open, presetClient?.id, presetClient?.fullName, presetClient?.phone]);

  useEffect(() => {
    const t = setTimeout(() => setClientSearchDebounced(clientSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [clientSearch]);

  useEffect(() => {
    if (!open || !branchId || !/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) {
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    void getDashboardSlots(token, branchId, {
      dateFrom: slotDate,
      dateTo: slotDate,
      page: 1,
      pageSize: 100,
    })
      .then((res) => {
        if (!cancelled) {
          setSlots(res.data);
          setSlotId((prev) => {
            if (prev && res.data.some((s) => s.id === prev)) {
              return prev;
            }
            return res.data[0]?.id ?? "";
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSlots([]);
          setSlotId("");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSlotsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, branchId, slotDate]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const today = new Date();
    const pad = (n: number) => `${n}`.padStart(2, "0");
    setSlotDate(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  }, [open]);

  useEffect(() => {
    if (!open || !clientSearchDebounced) {
      setClients([]);
      return;
    }
    let cancelled = false;
    setClientsLoading(true);
    void getDashboardClients(token, { search: clientSearchDebounced, page: 1, pageSize: 25 })
      .then((res) => {
        if (!cancelled) {
          setClients(res.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClients([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setClientsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, clientSearchDebounced]);


  function resetForm() {
    setClientSearch("");
    setClientSearchDebounced("");
    setClients([]);
    setClientId("");
    setSlotId("");
    setAdminNotes("");
    setClientNotes("");
    setSource("PHONE");
    setInitialStatus("PENDING");
    setLines([{ key: `${Date.now()}`, serviceId: "", variantId: "" }]);
    setError("");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!clientId) {
      setError("Select a client.");
      return;
    }
    if (!branchId) {
      setError("Select a branch.");
      return;
    }
    if (!slotId) {
      setError("Select an appointment slot.");
      return;
    }
    const built = linesBlockRef.current?.buildBookingItems();
    if (!built) {
      setError("Treatments are still loading. Please try again.");
      return;
    }
    if (!built.ok) {
      setError(built.error);
      return;
    }
    const items = built.items;
    setSubmitting(true);
    try {
      const detail = await postDashboardCreateBooking(token, {
        clientId,
        branchId,
        slotId,
        source: source as DashboardCreateBookingInput["source"],
        initialStatus: initialStatus || undefined,
        adminNotes: adminNotes.trim() || undefined,
        clientNotes: clientNotes.trim() || undefined,
        items,
      });
      onCreated(detail);
      handleClose();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#062A2D]/45 p-4">
      <div className="mx-auto flex min-h-full max-w-lg items-center justify-center py-8">
        <button
          type="button"
          className="fixed inset-0 cursor-default"
          aria-label="Close"
          onClick={handleClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-booking-title"
          className="relative z-10 w-full max-w-lg rounded-2xl border border-[#E8E0D4]/90 bg-[#FFFCF7] p-6 shadow-[0_20px_60px_rgba(6,42,45,0.2)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="create-booking-title" className="text-lg font-semibold text-[#1F2420]">
                New booking
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[#7A6A58]">
                Create a manual appointment for a client. The booking appears in the list and in change requests if
                you add a follow-up request.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-[#E8E0D4] bg-white p-2 text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Branch</span>
              <select
                value={branchId}
                disabled={branchSelectDisabled}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setSlotId("");
                }}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50 disabled:cursor-not-allowed disabled:bg-[#F5F1EA]"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Client</span>
              <input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Search by name or phone"
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none placeholder:text-[#B5A896] focus:border-[#B9974A]/50"
              />
              {clientsLoading ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-[#7A6A58]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Searching…
                </p>
              ) : null}
              {clientSearchDebounced && clients.length > 0 ? (
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-[#F0EBE3] bg-white text-sm shadow-sm">
                  {clients.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setClientId(c.id);
                          setClientSearch(`${c.fullName} · ${c.phone ?? ""}`.trim());
                          setClients([]);
                        }}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition hover:bg-[#FFFCF7]"
                      >
                        <span className="font-medium text-[#1F2420]">{c.fullName}</span>
                        <span className="text-xs text-[#7A6A58] tabular-nums">{c.phone ?? "—"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {clientId ? (
                <p className="mt-2 text-xs font-medium text-[#0E342B]">Selected client ID is set — adjust search to change.</p>
              ) : null}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                Appointment date
              </span>
              <input
                type="date"
                value={slotDate}
                onChange={(e) => setSlotDate(e.target.value)}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Slot</span>
              <select
                value={slotId}
                onChange={(e) => setSlotId(e.target.value)}
                disabled={slotsLoading || slots.length === 0}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">{slotsLoading ? "Loading slots…" : slots.length === 0 ? "No slots this day" : "Select slot"}</option>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatDayLabel(s.date)} · {formatWallClockRange12h(s.startTime, s.endTime)}{s.status !== "AVAILABLE" ? ` (${s.status.toLowerCase()})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">Source</span>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
                >
                  {BOOKING_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                  Initial status
                </span>
                <select
                  value={initialStatus}
                  onChange={(e) => setInitialStatus(e.target.value)}
                  className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2.5 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
                >
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                </select>
              </label>
            </div>

            {branchId ? (
              <DashboardServiceVariantLinesBlock
                ref={linesBlockRef}
                token={token}
                branchId={branchId}
                lines={lines}
                setLines={setLines}
                disabled={submitting}
                clientId={clientId || null}
              />
            ) : null}

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                Client notes (optional)
              </span>
              <textarea
                value={clientNotes}
                onChange={(e) => setClientNotes(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
                Internal notes (optional)
              </span>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm text-[#1F2420] shadow-sm outline-none focus:border-[#B9974A]/50"
              />
            </label>

            {error ? (
              <div className="flex gap-2 rounded-xl border border-[#E7B9A4]/70 bg-[#FFF1EC] px-3 py-2 text-sm text-[#8B4428]">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F0EBE3] pt-4">
              <Link
                href="/dashboard/clients"
                className="text-xs font-semibold text-[#062A2D] underline-offset-2 hover:underline"
                onClick={handleClose}
              >
                Add or edit clients
              </Link>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl border border-[#E8E0D4] bg-white px-4 py-2 text-sm font-semibold text-[#1F2420] shadow-sm transition hover:border-[#B9974A]/45"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] shadow-sm transition hover:bg-[#0A3F35] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Create booking
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
