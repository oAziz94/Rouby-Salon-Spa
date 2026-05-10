"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { ClientApiError, getClientJson, postClientJson } from "@/lib/api/client";
import { getPublicBranches } from "@/lib/api/public";
import {
  bookingReferenceLabel,
  formatSlotRangeLabel,
  isTerminalBookingStatus,
  statusBadgeClassName,
  summarizeItemNames,
} from "@/lib/booking/client-booking-display";
import { isAtLeast24HoursBeforeSlotStartFromApiSlot } from "@/lib/booking/client-change-window";
import { formatWallClockRange12h } from "@rouby/wall-clock";
import { formatEgp } from "@/lib/format/currency";
import { getClientToken } from "@/lib/auth/client-session";

/** Shape returned by `GET /client/bookings` (list only — no nested slot/items). */
type ClientBookingListItem = {
  id: string;
  status: string;
  branchId: string;
  slotId: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
};

type ClientBookingsResponse = {
  data: ClientBookingListItem[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
  };
};

type ClientBookingDetailItem = {
  id: string;
  itemType: string;
  nameSnapshot: string;
  priceSnapshot: number;
  durationMinutesSnapshot: number;
  quantity: number;
};

/** Shape returned by `GET /client/bookings/:id` (`mapBookingDetail`). */
type ClientBookingDetail = {
  id: string;
  status: string;
  branchId: string;
  slotId: string;
  source: string;
  subtotal: number;
  discountAmount: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  currency: "EGP";
  clientNotes: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  slot?: { date: string; startTime: string; endTime: string };
  items: ClientBookingDetailItem[];
  /** Present in DB; not currently included in `mapBookingDetail` — optional for forward compatibility. */
  appliedPromoCode?: string | null;
};

type CardEnrichment = {
  slot?: ClientBookingDetail["slot"];
  itemSummary?: string;
};

type PublicSlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
};

type PublicSlotsResponse = {
  data: PublicSlot[];
};

type RequestMode = "cancel" | "reschedule" | null;

function mapErrorToMessage(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.code === "CANCEL_WINDOW_EXPIRED") {
      return "Cancellation/reschedule is only allowed at least 24 hours before appointment.";
    }
    if (error.status === 401 || error.code === "UNAUTHORIZED") {
      return "Sign in is required to continue.";
    }
    if (error.status === 403 || error.code === "FORBIDDEN") {
      return "You do not have permission for this request.";
    }
    if (error.status === 409) {
      return "A pending change request already exists for this booking.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

function formatListDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(d);
}

export default function AccountBookingsPage() {
  const router = useRouter();
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<ClientBookingListItem[]>([]);
  const [branchNameById, setBranchNameById] = useState<Record<string, string>>({});
  const [cardEnrichmentById, setCardEnrichmentById] = useState<Record<string, CardEnrichment>>({});

  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [bookingDetail, setBookingDetail] = useState<ClientBookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [requestMode, setRequestMode] = useState<RequestMode>(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);

  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<PublicSlot[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleSlotsError, setRescheduleSlotsError] = useState<string | null>(null);
  const [requestedSlotId, setRequestedSlotId] = useState("");

  useEffect(() => {
    const token = getClientToken();
    if (!token) {
      router.replace("/account/sign-in");
      setLoading(false);
      return;
    }
    setHasToken(true);

    async function loadInitial() {
      setLoading(true);
      setError(null);
      try {
        const [bookingsRes, branches] = await Promise.all([
          getClientJson<ClientBookingsResponse>("/client/bookings?page=1&pageSize=20"),
          getPublicBranches().catch(() => [] as { id: string; name: string }[]),
        ]);
        setBookings(bookingsRes.data);
        const map: Record<string, string> = {};
        for (const b of branches) {
          map[b.id] = b.name;
        }
        setBranchNameById(map);
      } catch (err) {
        setError(mapErrorToMessage(err));
      } finally {
        setLoading(false);
      }
    }

    void loadInitial();
  }, [router]);

  useEffect(() => {
    if (!selectedBookingId) {
      setBookingDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }
    setBookingDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    async function loadDetail() {
      try {
        const response = await getClientJson<ClientBookingDetail>(
          `/client/bookings/${selectedBookingId}`,
        );
        setBookingDetail(response);
      } catch (err) {
        setDetailError(mapErrorToMessage(err));
      } finally {
        setDetailLoading(false);
      }
    }
    void loadDetail();
  }, [selectedBookingId]);

  useEffect(() => {
    if (!bookingDetail) {
      return;
    }
    const names = bookingDetail.items.map((i) => i.nameSnapshot);
    setCardEnrichmentById((prev) => ({
      ...prev,
      [bookingDetail.id]: {
        slot: bookingDetail.slot,
        itemSummary: names.length ? summarizeItemNames(names, 2) : undefined,
      },
    }));
  }, [bookingDetail]);

  useEffect(() => {
    async function loadSlots() {
      if (!bookingDetail || requestMode !== "reschedule" || !rescheduleDate) {
        setRescheduleSlots([]);
        return;
      }
      setRescheduleSlotsLoading(true);
      setRescheduleSlotsError(null);
      try {
        const response = await getClientJson<PublicSlotsResponse>(
          `/public/branches/${bookingDetail.branchId}/slots?date=${rescheduleDate}`,
        );
        setRescheduleSlots(response.data);
      } catch (err) {
        setRescheduleSlots([]);
        setRescheduleSlotsError(mapErrorToMessage(err));
      } finally {
        setRescheduleSlotsLoading(false);
      }
    }
    void loadSlots();
  }, [bookingDetail, requestMode, rescheduleDate]);

  const selectedBooking = useMemo(
    () => bookings.find((booking) => booking.id === selectedBookingId) ?? null,
    [bookings, selectedBookingId],
  );

  const changeRequestEligibility = useMemo(() => {
    if (!bookingDetail) {
      return { showActions: false, reason: null as string | null };
    }
    if (isTerminalBookingStatus(bookingDetail.status)) {
      return {
        showActions: false,
        reason: "This visit is closed out in the app; contact the salon if you still need help.",
      };
    }
    if (!bookingDetail.slot) {
      return {
        showActions: false,
        reason:
          "Appointment time could not be loaded for this booking. Please contact the salon to request changes.",
      };
    }
    if (!isAtLeast24HoursBeforeSlotStartFromApiSlot(bookingDetail.slot)) {
      return {
        showActions: false,
        reason:
          "Cancellation and reschedule requests must be made at least 24 hours before your appointment. Please call the salon for urgent changes.",
      };
    }
    return { showActions: true, reason: null };
  }, [bookingDetail]);

  const appliedPromo = bookingDetail?.appliedPromoCode ?? null;

  async function submitCancellationRequest() {
    if (!selectedBookingId) {
      return;
    }
    setRequestLoading(true);
    setRequestError(null);
    setRequestSuccess(null);
    try {
      await postClientJson(`/client/bookings/${selectedBookingId}/cancellation-requests`);
      setRequestSuccess("Cancellation request submitted successfully.");
      setRequestMode(null);
    } catch (err) {
      setRequestError(mapErrorToMessage(err));
    } finally {
      setRequestLoading(false);
    }
  }

  async function submitRescheduleRequest() {
    if (!selectedBookingId || !requestedSlotId) {
      return;
    }
    setRequestLoading(true);
    setRequestError(null);
    setRequestSuccess(null);
    try {
      await postClientJson(
        `/client/bookings/${selectedBookingId}/reschedule-requests`,
        { requestedSlotId },
      );
      setRequestSuccess("Reschedule request submitted successfully.");
      setRequestMode(null);
    } catch (err) {
      setRequestError(mapErrorToMessage(err));
    } finally {
      setRequestLoading(false);
    }
  }

  if (!hasToken) {
    return (
      <div className="relative min-h-[calc(100vh-5rem)] bg-[#faf7f0] pt-24 pb-16">
        <div className="mx-auto w-full max-w-[920px] px-4 sm:px-6 lg:px-10">
          <LoadingState label="Redirecting to sign in…" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-[#faf7f0] pt-24 pb-20">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5c8 12 8 38 0 50M15 12c12 8 18 28 12 42M45 12c-12 8-18 28-12 42' fill='none' stroke='%2317351f' stroke-width='1'/%3E%3C/svg%3E")`,
        }}
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10">
        <header className="rounded-3xl border border-[#d8cdb9]/80 bg-gradient-to-br from-[#fffdf8] via-[#fdfaf4] to-[#f3ebdd]/90 p-[1px] shadow-[0_20px_50px_rgba(23,53,31,0.08)]">
          <div className="rounded-[calc(1.5rem-1px)] px-6 py-8 sm:px-10 sm:py-10">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[#6e775d]">
              Alrouby Salon &amp; Spa
            </p>
            <h1 className="mt-3 font-heading text-3xl tracking-tight text-primary sm:text-4xl">My Bookings</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              Review your visits, see pricing and services on file, and send cancellation or reschedule requests
              for staff approval when your appointment is still more than a day away.
            </p>
          </div>
        </header>

        {loading ? (
          <div className="mt-10">
            <LoadingState label="Loading your bookings..." />
          </div>
        ) : error ? (
          <div className="mt-10">
            <ErrorState message={error} />
          </div>
        ) : bookings.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              title="No bookings yet"
              description="When you complete a booking, it will appear here with your appointment time, branch, and services."
              actionHref="/booking"
              actionLabel="Book appointment"
            />
          </div>
        ) : (
          <section className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
            <div className="space-y-3">
              <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[#6e775d]">
                Your visits
              </h2>
              {bookings.map((booking) => {
                const enrich = cardEnrichmentById[booking.id];
                const branchName = branchNameById[booking.branchId];
                const slotLine =
                  enrich?.slot != null
                    ? formatSlotRangeLabel(enrich.slot)
                    : "Booking Request";
                const secondary =
                  enrich?.itemSummary ??
                  `Requested ${formatListDate(booking.createdAt) || "—"}`;

                return (
                  <button
                    type="button"
                    key={booking.id}
                    onClick={() => {
                      setSelectedBookingId(booking.id);
                      setRequestMode(null);
                      setRequestError(null);
                      setRequestSuccess(null);
                    }}
                    className={`group w-full rounded-2xl border p-5 text-left shadow-sm transition-all ${
                      selectedBookingId === booking.id
                        ? "border-[#b9974a]/70 bg-[#fffdf8] shadow-[0_12px_36px_rgba(185,151,74,0.18)] ring-1 ring-[#b9974a]/30"
                        : "border-[#d8cdb9]/70 bg-[#fdfaf4]/90 hover:border-[#17351f]/25 hover:shadow-[0_10px_28px_rgba(23,53,31,0.1)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-mono text-xs font-medium tracking-wide text-[#5a5248]">
                        {bookingReferenceLabel(booking.id)}
                      </p>
                      <span className={statusBadgeClassName(booking.status)}>{booking.status.replace(/_/g, " ")}</span>
                    </div>
                    <p className="mt-2 font-heading text-lg text-primary">{slotLine}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{secondary}</p>
                    <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-[#d8cdb9]/50 pt-3">
                      <div>
                        {branchName ? (
                          <p className="text-xs font-medium text-[#6e775d]">{branchName}</p>
                        ) : (
                          <p className="text-xs text-muted">Branch on file</p>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-primary">{formatEgp(booking.totalAmount)}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <aside className="rounded-3xl border border-[#d8cdb9]/80 bg-gradient-to-b from-[#fffdf8] to-[#f3ebdd]/85 p-[1px] shadow-[0_18px_48px_rgba(23,53,31,0.07)] lg:sticky lg:top-28">
              <div className="rounded-[calc(1.5rem-1px)] bg-[#fdfaf4]/95 p-6 sm:p-8">
                {!selectedBooking ? (
                  <div className="flex flex-col items-center py-10 text-center">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#b9974a]/40 bg-[#b9974a]/10 text-[#17351f]"
                      aria-hidden
                    >
                      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <h2 className="mt-6 font-heading text-2xl text-primary">Choose a booking</h2>
                    <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
                      Select any visit on the left to see services, branch, slot time, and pricing. You can send a
                      change request from there when the booking is still open for updates.
                    </p>
                    <Link
                      href="/booking"
                      className="mt-8 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[0_8px_22px_rgba(23,53,31,0.22)] transition-opacity hover:opacity-90"
                    >
                      Book new appointment
                    </Link>
                  </div>
                ) : detailLoading ? (
                  <LoadingState label="Loading booking details..." />
                ) : detailError ? (
                  <ErrorState message={detailError} />
                ) : bookingDetail ? (
                  <div className="space-y-8">
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-sm font-medium text-[#5a5248]">
                            {bookingReferenceLabel(bookingDetail.id)}
                          </p>
                          <h2 className="mt-2 font-heading text-2xl text-primary sm:text-3xl">Booking details</h2>
                        </div>
                        <span className={statusBadgeClassName(bookingDetail.status)}>
                          {bookingDetail.status.replace(/_/g, " ")}
                        </span>
                      </div>
                    </div>

                    <section className="rounded-2xl border border-[#d8cdb9]/60 bg-[#faf7f0]/50 p-5">
                      <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#6e775d]">
                        Appointment
                      </h3>
                      {bookingDetail.slot ? (
                        <p className="mt-2 text-base font-medium text-foreground">
                          {formatSlotRangeLabel(bookingDetail.slot)}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm leading-relaxed text-muted">
                          No slot time is attached to this response. Your booking is still on file; contact the salon
                          if you need the exact time.
                        </p>
                      )}
                      <p className="mt-3 text-sm text-muted">
                        <span className="font-medium text-foreground">Branch: </span>
                        {branchNameById[bookingDetail.branchId] ?? "—"}
                      </p>
                    </section>

                    <section>
                      <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#6e775d]">
                        Services &amp; packages
                      </h3>
                      <ul className="mt-3 space-y-2">
                        {bookingDetail.items.length === 0 ? (
                          <li className="rounded-xl border border-dashed border-[#d8cdb9] px-4 py-3 text-sm text-muted">
                            No line items were returned for this booking.
                          </li>
                        ) : (
                          bookingDetail.items.map((item) => (
                            <li
                              key={item.id}
                              className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-[#d8cdb9]/60 bg-[#fffdf8]/80 px-4 py-3"
                            >
                              <span className="font-medium text-foreground">{item.nameSnapshot}</span>
                              <span className="text-sm text-muted">
                                {item.quantity} × {formatEgp(item.priceSnapshot)}
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    </section>

                    <section className="rounded-2xl border border-[#d8cdb9]/60 bg-[rgba(23,53,31,0.04)] p-5">
                      <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#6e775d]">
                        Pricing
                      </h3>
                      <dl className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted">Subtotal</dt>
                          <dd className="font-medium text-foreground">{formatEgp(bookingDetail.subtotal)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted">Discount</dt>
                          <dd className="font-medium text-foreground">{formatEgp(bookingDetail.discountAmount)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted">VAT</dt>
                          <dd className="font-medium text-foreground">
                            {formatEgp(bookingDetail.vatAmount)}
                            <span className="ml-1 text-xs font-normal text-muted">
                              ({(bookingDetail.vatRate * 100).toFixed(0)}% rate)
                            </span>
                          </dd>
                        </div>
                        <div className="mt-3 flex justify-between gap-4 border-t border-[#d8cdb9]/60 pt-3 text-base">
                          <dt className="font-semibold text-primary">Total</dt>
                          <dd className="font-heading text-xl text-primary">{formatEgp(bookingDetail.totalAmount)}</dd>
                        </div>
                      </dl>
                      {appliedPromo ? (
                        <p className="mt-4 text-sm text-muted">
                          <span className="font-medium text-foreground">Promo applied: </span>
                          <span className="rounded-md bg-[#b9974a]/15 px-2 py-0.5 font-mono text-foreground">
                            {appliedPromo}
                          </span>
                        </p>
                      ) : null}
                    </section>

                    {bookingDetail.clientNotes ? (
                      <section className="rounded-2xl border border-[#b9974a]/35 bg-[#b9974a]/8 p-5">
                        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#5c4a18]">
                          Your notes
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-foreground">{bookingDetail.clientNotes}</p>
                      </section>
                    ) : null}

                    {changeRequestEligibility.showActions ? (
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setRequestMode("cancel");
                            setRequestError(null);
                            setRequestSuccess(null);
                          }}
                          className="rounded-full border border-[#17351f]/35 bg-transparent px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-[#17351f]/5"
                        >
                          Request cancellation
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRequestMode("reschedule");
                            setRequestedSlotId("");
                            setRescheduleDate("");
                            setRequestError(null);
                            setRequestSuccess(null);
                          }}
                          className="rounded-full border border-[#b9974a]/50 bg-[#b9974a]/15 px-5 py-2.5 text-sm font-semibold text-[#4a3d18] transition-colors hover:bg-[#b9974a]/25"
                        >
                          Request reschedule
                        </button>
                      </div>
                    ) : changeRequestEligibility.reason ? (
                      <p className="rounded-2xl border border-[#d8cdb9]/70 bg-[#faf7f0] px-4 py-3 text-sm leading-relaxed text-muted">
                        {changeRequestEligibility.reason}
                      </p>
                    ) : null}

                    {requestMode === "cancel" ? (
                      <div className="rounded-2xl border border-[#d8cdb9]/70 bg-[#fffdf8] p-5">
                        <p className="text-sm leading-relaxed text-foreground">
                          This sends a cancellation request for staff approval. It does not cancel the booking
                          immediately.
                        </p>
                        <button
                          type="button"
                          onClick={() => void submitCancellationRequest()}
                          disabled={requestLoading}
                          className="mt-4 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {requestLoading ? "Submitting…" : "Submit cancellation request"}
                        </button>
                      </div>
                    ) : null}

                    {requestMode === "reschedule" ? (
                      <div className="rounded-2xl border border-[#d8cdb9]/70 bg-[#fffdf8] p-5">
                        <label className="block text-sm text-muted">
                          Select date
                          <input
                            type="date"
                            value={rescheduleDate}
                            onChange={(event) => {
                              setRescheduleDate(event.target.value);
                              setRequestedSlotId("");
                            }}
                            className="mt-2 w-full rounded-xl border border-[#d8cdb9] bg-[#fdfaf4] px-3 py-2.5 text-sm text-foreground"
                          />
                        </label>

                        {rescheduleSlotsLoading ? (
                          <div className="mt-4">
                            <LoadingState label="Loading available slots..." />
                          </div>
                        ) : rescheduleSlotsError ? (
                          <div className="mt-4">
                            <ErrorState message={rescheduleSlotsError} />
                          </div>
                        ) : rescheduleDate ? (
                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            {rescheduleSlots.length === 0 ? (
                              <p className="text-sm text-muted">No slots available for the selected date.</p>
                            ) : (
                              rescheduleSlots.map((slot) => (
                                <button
                                  key={slot.id}
                                  type="button"
                                  onClick={() => setRequestedSlotId(slot.id)}
                                  className={`rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                                    requestedSlotId === slot.id
                                      ? "border-[#17351f] bg-[#17351f] text-primary-foreground"
                                      : "border-[#d8cdb9] bg-[#fdfaf4] text-foreground hover:border-[#17351f]/40"
                                  }`}
                                >
                                  {formatWallClockRange12h(slot.startTime, slot.endTime)}
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => void submitRescheduleRequest()}
                          disabled={requestLoading || !requestedSlotId}
                          className="mt-4 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {requestLoading ? "Submitting…" : "Submit reschedule request"}
                        </button>
                      </div>
                    ) : null}

                    {requestError ? (
                      <div>
                        <ErrorState message={requestError} />
                      </div>
                    ) : null}
                    {requestSuccess ? (
                      <div className="rounded-2xl border border-[#b9974a]/45 bg-[#b9974a]/12 px-4 py-3 text-sm font-medium text-[#3d3314]">
                        {requestSuccess}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </aside>
          </section>
        )}

        {!loading && !error && bookings.length > 0 ? (
          <div className="mt-10 flex justify-center">
            <Link
              href="/booking"
              className="inline-flex rounded-full border border-[#17351f]/30 px-6 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-[#17351f]/5"
            >
              Book another appointment
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
