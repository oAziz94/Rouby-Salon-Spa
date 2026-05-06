"use client";

import {
  ApiClientError,
  getDashboardBookings,
  getDashboardClientById,
  patchDashboardClient,
  type DashboardBookingsListItem,
  type DashboardClient,
} from "@rouby/api-client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "error";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.statusCode === 401) {
      return "Unauthorized (401). Please sign in again.";
    }
    if (error.statusCode === 403) {
      return "Forbidden (403). You do not have permission.";
    }
    if (error.statusCode === 404) {
      return "Client endpoint is not available in backend yet.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected API error.";
}

function formatEGP(value: number): string {
  return `EGP ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function DashboardClientProfilePage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const { token, hasPermission } = useDashboardAuth();

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [client, setClient] = useState<DashboardClient | null>(null);
  const [bookings, setBookings] = useState<DashboardBookingsListItem[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editAllergies, setEditAllergies] = useState("");
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const canRead = hasPermission("clients.read");
  const canContact = hasPermission("clients.contact.view");
  const canSensitive =
    hasPermission("clients.notes.sensitive") ||
    hasPermission("clients.sensitive_notes.view");
  const canUpdate = hasPermission("clients.update");

  useEffect(() => {
    if (!token || !clientId || !canRead) {
      return;
    }

    setState("loading");
    setError("");
    Promise.all([
      getDashboardClientById(token, clientId),
      getDashboardBookings(token, {
        clientId,
        page: 1,
        pageSize: 50,
      }),
    ])
      .then(([clientRes, bookingsRes]) => {
        setClient(clientRes);
        setBookings(bookingsRes.data ?? []);
        setEditName(clientRes.fullName ?? "");
        setEditPhone((clientRes.phone as string | null | undefined) ?? "");
        setEditEmail((clientRes.email as string | null | undefined) ?? "");
        setEditNotes((clientRes.notes as string | null | undefined) ?? "");
        setEditAllergies(
          (clientRes.allergiesOrWarnings as string | null | undefined) ?? "",
        );
        setState("loaded");
      })
      .catch((requestError) => {
        setError(formatApiError(requestError));
        setState("error");
      });
  }, [canRead, clientId, token]);

  const bookingTotals = useMemo(() => {
    const totalAmount = bookings.reduce((sum, booking) => sum + booking.totalAmount, 0);
    const statusCounts = bookings.reduce<Record<string, number>>((acc, booking) => {
      acc[booking.status] = (acc[booking.status] ?? 0) + 1;
      return acc;
    }, {});
    return { totalAmount, statusCounts };
  }, [bookings]);

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdate || !clientId) {
      return;
    }
    setEditLoading(true);
    setEditError("");
    try {
      const payload: Record<string, unknown> = {
        fullName: editName,
      };
      if (canContact) {
        payload.phone = editPhone || undefined;
        payload.email = editEmail || undefined;
      }
      if (canSensitive) {
        payload.notes = editNotes || undefined;
        payload.allergiesOrWarnings = editAllergies || undefined;
      }
      const updated = await patchDashboardClient(token, clientId, payload);
      setClient(updated);
      setEditMode(false);
    } catch (requestError) {
      setEditError(formatApiError(requestError));
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <PermissionGuard permission="clients.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Client Profile</h1>
              <p className="mt-2 text-sm text-[#7A6A58]">Client detail and booking history.</p>
            </div>
            <Link
              href="/dashboard/clients"
              className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-[#1F2420]"
            >
              Back to clients
            </Link>
          </div>
        </header>

        {state === "loading" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm text-sm text-[#7A6A58]">
            Loading client profile...
          </section>
        ) : null}
        {state === "error" ? (
          <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 shadow-sm text-sm text-danger">
            {error}
          </section>
        ) : null}

        {state === "loaded" && client ? (
          <>
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#1F2420]">Client info</h2>
                {canUpdate ? (
                  <button
                    type="button"
                    onClick={() => setEditMode((prev) => !prev)}
                    className="rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-[#1F2420]"
                  >
                    {editMode ? "Cancel edit" : "Edit"}
                  </button>
                ) : null}
              </div>

              {!editMode ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <p className="text-sm text-[#1F2420]">
                    <span className="font-medium">Name:</span> {client.fullName}
                  </p>
                  <p className="text-sm text-[#1F2420]">
                    <span className="font-medium">Preferred branch:</span>{" "}
                    {(client.preferredBranchId as string | null | undefined) ?? "-"}
                  </p>
                  <p className="text-sm text-[#1F2420]">
                    <span className="font-medium">Phone:</span>{" "}
                    {canContact ? ((client.phone as string | null | undefined) ?? "-") : "Masked"}
                  </p>
                  <p className="text-sm text-[#1F2420]">
                    <span className="font-medium">Email:</span>{" "}
                    {canContact ? ((client.email as string | null | undefined) ?? "-") : "Masked"}
                  </p>
                  <p className="text-sm text-[#1F2420] md:col-span-2">
                    <span className="font-medium">Notes:</span>{" "}
                    {canSensitive ? ((client.notes as string | null | undefined) ?? "-") : "Masked"}
                  </p>
                  <p className="text-sm text-[#1F2420] md:col-span-2">
                    <span className="font-medium">Allergies/Warnings:</span>{" "}
                    {canSensitive
                      ? ((client.allergiesOrWarnings as string | null | undefined) ?? "-")
                      : "Masked"}
                  </p>
                </div>
              ) : (
                <form className="mt-4 space-y-3" onSubmit={onSave}>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-[#1F2420]">Name</span>
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      className="w-full rounded-md border border-border bg-white px-3 py-2"
                      required
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-[#1F2420]">Phone</span>
                    <input
                      value={editPhone}
                      onChange={(event) => setEditPhone(event.target.value)}
                      disabled={!canContact}
                      className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-[#1F2420]">Email</span>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(event) => setEditEmail(event.target.value)}
                      disabled={!canContact}
                      className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-[#1F2420]">Notes</span>
                    <textarea
                      rows={3}
                      value={editNotes}
                      onChange={(event) => setEditNotes(event.target.value)}
                      disabled={!canSensitive}
                      className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-[#1F2420]">
                      Allergies/Warnings
                    </span>
                    <textarea
                      rows={3}
                      value={editAllergies}
                      onChange={(event) => setEditAllergies(event.target.value)}
                      disabled={!canSensitive}
                      className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
                    />
                  </label>
                  {editError ? (
                    <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                      {editError}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={editLoading}
                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {editLoading ? "Saving..." : "Save changes"}
                  </button>
                </form>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[#1F2420]">Booking history</h2>
              <p className="mt-2 text-sm text-[#7A6A58]">
                Total booked amount: {formatEGP(bookingTotals.totalAmount)}
              </p>
              <p className="mt-1 text-xs text-[#7A6A58]">
                Payment summary fallback: booking list endpoint does not include paid/remaining per client aggregate.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(bookingTotals.statusCounts).map(([status, count]) => (
                  <span
                    key={status}
                    className="rounded-full border border-border bg-white px-2 py-1 text-xs text-[#1F2420]"
                  >
                    {status}: {count}
                  </span>
                ))}
              </div>

              {bookings.length === 0 ? (
                <p className="mt-4 text-sm text-[#7A6A58]">No bookings found for this client.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {bookings.map((booking) => (
                    <article
                      key={booking.id}
                      className="rounded-lg border border-border bg-white p-3"
                    >
                      <p className="text-sm font-medium text-[#1F2420]">{booking.id}</p>
                      <p className="mt-1 text-xs text-[#7A6A58]">
                        {booking.status} • {booking.source} • {booking.createdAt}
                      </p>
                      <p className="mt-1 text-xs text-[#1F2420]">
                        {formatEGP(booking.totalAmount)}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
