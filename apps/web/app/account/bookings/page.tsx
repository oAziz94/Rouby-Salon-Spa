"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { ClientApiError, getClientJson, postClientJson } from "@/lib/api/client";
import { formatEgp } from "@/lib/format/currency";
import { getClientToken } from "@/lib/auth/client-session";

type ClientBookingListItem = {
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
  createdAt: string;
  slot?: {
    date: string;
    startTime: string;
    endTime: string;
  };
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

type ClientBookingDetail = ClientBookingListItem & {
  adminNotes: string | null;
  updatedAt: string;
  items: Array<{
    id: string;
    itemType: string;
    nameSnapshot: string;
    priceSnapshot: number;
    durationMinutesSnapshot: number;
    quantity: number;
  }>;
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

export default function AccountBookingsPage() {
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<ClientBookingListItem[]>([]);

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
    setHasToken(Boolean(token));
    if (!token) {
      setLoading(false);
      return;
    }

    async function loadBookings() {
      setLoading(true);
      setError(null);
      try {
        const response = await getClientJson<ClientBookingsResponse>(
          "/client/bookings?page=1&pageSize=20",
        );
        setBookings(response.data);
      } catch (err) {
        setError(mapErrorToMessage(err));
      } finally {
        setLoading(false);
      }
    }

    void loadBookings();
  }, []);

  useEffect(() => {
    if (!selectedBookingId) {
      setBookingDetail(null);
      return;
    }
    async function loadDetail() {
      setDetailLoading(true);
      setDetailError(null);
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
      <div className="mx-auto w-full max-w-[920px] px-4 py-14 sm:px-6 lg:px-10">
        <EmptyState
          title="Sign in required"
          description="Please sign in from the account page to view your bookings."
          actionHref="/account"
          actionLabel="Go to Account"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-14 sm:px-6 lg:px-10">
      <section className="rounded-2xl border border-border bg-card p-7">
        <h1 className="font-heading text-4xl text-primary">My Bookings</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
          View your booking history and submit cancellation or reschedule requests.
        </p>
      </section>

      {loading ? (
        <div className="mt-8">
          <LoadingState label="Loading your bookings..." />
        </div>
      ) : error ? (
        <div className="mt-8">
          <ErrorState message={error} />
        </div>
      ) : bookings.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No bookings yet"
            description="Your booking requests will appear here once submitted."
            actionHref="/booking"
            actionLabel="Book Appointment"
          />
        </div>
      ) : (
        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-3">
            {bookings.map((booking) => (
              <button
                type="button"
                key={booking.id}
                onClick={() => {
                  setSelectedBookingId(booking.id);
                  setRequestMode(null);
                  setRequestError(null);
                  setRequestSuccess(null);
                }}
                className={`w-full rounded-xl border p-4 text-left ${
                  selectedBookingId === booking.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card"
                }`}
              >
                <p className="text-xs uppercase tracking-[0.12em] text-muted">
                  {booking.status}
                </p>
                <p className="mt-1 font-medium text-foreground">
                  {booking.slot
                    ? `${booking.slot.date} ${booking.slot.startTime.slice(0, 5)}`
                    : "No slot details"}
                </p>
                <p className="mt-1 text-sm text-muted">{formatEgp(booking.totalAmount)}</p>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            {!selectedBooking ? (
              <EmptyState
                title="Select a booking"
                description="Choose a booking from the list to view details."
              />
            ) : detailLoading ? (
              <LoadingState label="Loading booking details..." />
            ) : detailError ? (
              <ErrorState message={detailError} />
            ) : bookingDetail ? (
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted">
                  {bookingDetail.status}
                </p>
                <h2 className="mt-1 font-heading text-3xl text-primary">Booking Details</h2>

                <div className="mt-4 space-y-1 text-sm text-foreground">
                  <p>
                    <span className="font-medium">Date:</span>{" "}
                    {bookingDetail.slot?.date ?? "—"}
                  </p>
                  <p>
                    <span className="font-medium">Slot:</span>{" "}
                    {bookingDetail.slot
                      ? `${bookingDetail.slot.startTime.slice(0, 5)} - ${bookingDetail.slot.endTime.slice(0, 5)}`
                      : "—"}
                  </p>
                  <p>
                    <span className="font-medium">Subtotal:</span>{" "}
                    {formatEgp(bookingDetail.subtotal)}
                  </p>
                  <p>
                    <span className="font-medium">Discount:</span>{" "}
                    {formatEgp(bookingDetail.discountAmount)}
                  </p>
                  <p>
                    <span className="font-medium">VAT:</span>{" "}
                    {formatEgp(bookingDetail.vatAmount)}
                  </p>
                  <p>
                    <span className="font-medium">Total:</span>{" "}
                    {formatEgp(bookingDetail.totalAmount)}
                  </p>
                  {bookingDetail.clientNotes ? (
                    <p>
                      <span className="font-medium">Client notes:</span>{" "}
                      {bookingDetail.clientNotes}
                    </p>
                  ) : null}
                </div>

                <div className="mt-5">
                  <h3 className="text-sm uppercase tracking-[0.12em] text-muted">Items</h3>
                  <div className="mt-2 space-y-2">
                    {bookingDetail.items.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-lg border border-border bg-background p-3 text-sm"
                      >
                        <p className="font-medium text-foreground">{item.nameSnapshot}</p>
                        <p className="text-muted">
                          {item.quantity} x {formatEgp(item.priceSnapshot)}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRequestMode("cancel");
                      setRequestError(null);
                      setRequestSuccess(null);
                    }}
                    className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary"
                  >
                    Request Cancellation
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
                    className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary"
                  >
                    Request Reschedule
                  </button>
                </div>

                {requestMode === "cancel" ? (
                  <div className="mt-5 rounded-lg border border-border bg-background p-4">
                    <p className="text-sm text-foreground">
                      This submits a cancellation request for staff approval. It does not
                      cancel the booking immediately.
                    </p>
                    <button
                      type="button"
                      onClick={() => void submitCancellationRequest()}
                      disabled={requestLoading}
                      className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {requestLoading ? "Submitting..." : "Submit Cancellation Request"}
                    </button>
                  </div>
                ) : null}

                {requestMode === "reschedule" ? (
                  <div className="mt-5 rounded-lg border border-border bg-background p-4">
                    <label className="text-sm text-muted">
                      Select date
                      <input
                        type="date"
                        value={rescheduleDate}
                        onChange={(event) => {
                          setRescheduleDate(event.target.value);
                          setRequestedSlotId("");
                        }}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                      />
                    </label>

                    {rescheduleSlotsLoading ? (
                      <div className="mt-3">
                        <LoadingState label="Loading available slots..." />
                      </div>
                    ) : rescheduleSlotsError ? (
                      <div className="mt-3">
                        <ErrorState message={rescheduleSlotsError} />
                      </div>
                    ) : rescheduleDate ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {rescheduleSlots.length === 0 ? (
                          <p className="text-sm text-muted">
                            No slots available for the selected date.
                          </p>
                        ) : (
                          rescheduleSlots.map((slot) => (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => setRequestedSlotId(slot.id)}
                              className={`rounded-lg border px-3 py-2 text-left text-sm ${
                                requestedSlotId === slot.id
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-card text-foreground"
                              }`}
                            >
                              {slot.startTime.slice(0, 5)} - {slot.endTime.slice(0, 5)}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => void submitRescheduleRequest()}
                      disabled={requestLoading || !requestedSlotId}
                      className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {requestLoading ? "Submitting..." : "Submit Reschedule Request"}
                    </button>
                  </div>
                ) : null}

                {requestError ? (
                  <div className="mt-4">
                    <ErrorState message={requestError} />
                  </div>
                ) : null}
                {requestSuccess ? (
                  <div className="mt-4 rounded-lg border border-accent bg-accent/20 p-3 text-sm text-foreground">
                    {requestSuccess}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      )}

      <div className="mt-8">
        <Link
          href="/booking"
          className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          Book Appointment
        </Link>
      </div>
    </div>
  );
}
