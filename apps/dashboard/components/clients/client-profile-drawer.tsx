"use client";

import {
  ApiClientError,
  getDashboardBookings,
  getDashboardClientById,
  getDashboardInvoices,
  getDashboardLoyaltyClient,
  type DashboardBookingsListItem,
  type DashboardBranch,
  type DashboardClient,
  type DashboardInvoiceListItem,
  type DashboardLoyaltyClientDetail,
} from "@rouby/api-client";
import { formatDateTimeAmPm, formatDayLabel, formatWallClockRange12h } from "@rouby/wall-clock";
import {
  Calendar,
  CreditCard,
  Mail,
  MapPin,
  Pencil,
  Phone,
  PlusCircle,
  Sparkles,
  Star,
  StickyNote,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { bookingStatusLabel } from "@/lib/labels";
import { useCallback, useEffect, useMemo, useState } from "react";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Could not load client.";
}

function formatEGP(amount: number): string {
  return `EGP ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function branchLabel(client: DashboardClient | null | undefined, branches: DashboardBranch[]): string {
  const fromApi = client?.preferredBranchName;
  if (typeof fromApi === "string" && fromApi.trim()) {
    return fromApi;
  }
  const branchId = client?.preferredBranchId as string | null | undefined;
  if (!branchId) {
    return "—";
  }
  const b = branches.find((x) => x.id === branchId);
  return b?.name ?? "Unknown branch";
}

type ClientProfileDrawerProps = {
  open: boolean;
  clientId: string | null;
  token: string;
  branches: DashboardBranch[];
  canContact: boolean;
  canSensitive: boolean;
  canUpdate: boolean;
  canCreateBooking: boolean;
  canWalkIn: boolean;
  canReadInvoices: boolean;
  canReadLoyalty: boolean;
  onClose: () => void;
  onEdit: (client: DashboardClient) => void;
  onCreateBooking: (client: DashboardClient) => void;
  /** After PATCH from parent modal, merge refreshed client */
  externalClient?: DashboardClient | null;
};

export function ClientProfileDrawer({
  open,
  clientId,
  token,
  branches,
  canContact,
  canSensitive,
  canUpdate,
  canCreateBooking,
  canWalkIn,
  canReadInvoices,
  canReadLoyalty,
  onClose,
  onEdit,
  onCreateBooking,
  externalClient,
}: ClientProfileDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [client, setClient] = useState<DashboardClient | null>(null);
  const [bookings, setBookings] = useState<DashboardBookingsListItem[]>([]);
  const [invoices, setInvoices] = useState<DashboardInvoiceListItem[]>([]);
  const [invoiceError, setInvoiceError] = useState(false);
  const [loyalty, setLoyalty] = useState<DashboardLoyaltyClientDetail | null>(null);

  const load = useCallback(async () => {
    if (!open || !clientId || !token) {
      return;
    }
    setLoading(true);
    setError("");
    setInvoiceError(false);
    try {
      const [c, b] = await Promise.all([
        getDashboardClientById(token, clientId),
        getDashboardBookings(token, { clientId, page: 1, pageSize: 50 }),
      ]);
      setClient(c);
      setBookings(b.data ?? []);
      if (canReadInvoices) {
        try {
          const inv = await getDashboardInvoices(token, { clientId, page: 1, pageSize: 20 });
          setInvoices(inv.data ?? []);
        } catch {
          setInvoices([]);
          setInvoiceError(true);
        }
      } else {
        setInvoices([]);
      }
      if (canReadLoyalty) {
        try {
          setLoyalty(await getDashboardLoyaltyClient(token, clientId));
        } catch {
          setLoyalty(null);
        }
      } else {
        setLoyalty(null);
      }
    } catch (e) {
      setError(formatApiError(e));
      setClient(null);
      setBookings([]);
      setInvoices([]);
      setLoyalty(null);
    } finally {
      setLoading(false);
    }
  }, [open, clientId, token, canReadInvoices, canReadLoyalty]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (externalClient && clientId && externalClient.id === clientId) {
      setClient(externalClient);
    }
  }, [externalClient, clientId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const metrics = useMemo(() => {
    const completed = bookings.filter((x) => x.status === "COMPLETED").length;
    const cancelled = bookings.filter((x) => x.status === "CANCELLED" || x.status === "REJECTED").length;
    const noShow = bookings.filter((x) => x.status === "NO_SHOW").length;
    const totalSpent = bookings
      .filter((x) => x.status === "COMPLETED")
      .reduce((s, x) => s + x.totalAmount, 0);
    const sortedBySlot = [...bookings].sort((a, b) => {
      const da = a.slot?.date ? Date.parse(`${a.slot.date}T${a.slot.startTime}`) : Date.parse(a.createdAt);
      const db = b.slot?.date ? Date.parse(`${b.slot.date}T${b.slot.startTime}`) : Date.parse(b.createdAt);
      return db - da;
    });
    const lastVisit = sortedBySlot.find((x) => x.status === "COMPLETED");
    const upcoming = [...bookings]
      .filter((x) => ["PENDING", "CONFIRMED", "RESCHEDULED"].includes(x.status))
      .map((x) => {
        const t = x.slot?.date ? Date.parse(`${x.slot.date}T${x.slot.startTime}`) : Date.parse(x.createdAt);
        return { x, t };
      })
      .filter((row) => !Number.isNaN(row.t) && row.t >= Date.now())
      .sort((a, b) => a.t - b.t)[0]?.x;
    return {
      completed,
      cancelled,
      noShow,
      totalSpent,
      lastVisit,
      upcoming,
    };
  }, [bookings]);

  if (!open || !clientId) {
    return null;
  }

  const display = client;
  const prefBranch = branchLabel(display, branches);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-[#2A1722]/35 backdrop-blur-[1px]"
        aria-label="Close profile"
        onClick={onClose}
      />
      <aside
        className="relative flex h-full w-full max-w-full flex-col border-l border-border bg-card shadow-2xl sm:max-w-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-drawer-title"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
          <h2 id="client-drawer-title" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Client profile
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-white p-2 text-foreground hover:bg-[#FFF9EE]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {loading ? (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-2xl bg-[#F0EBE3]" />
              <div className="h-32 animate-pulse rounded-2xl bg-[#F0EBE3]" />
              <div className="h-40 animate-pulse rounded-2xl bg-[#F0EBE3]" />
            </div>
          ) : null}
          {error ? (
            <div className="rounded-2xl border border-[#E7B9A4]/80 bg-[#FFF1EC] p-4 text-sm text-danger">
              {error}
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground"
              >
                Retry
              </button>
            </div>
          ) : null}
          {!loading && !error && display ? (
            <div className="space-y-5">
              <header className="rounded-2xl border border-border bg-[#FFFCF7] p-4 shadow-sm">
                <div className="flex gap-3">
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#B9974A]/40 bg-[#FBF6E8] text-base font-semibold text-[#5C4A18]"
                    aria-hidden
                  >
                    {initialsFromName(display.fullName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold text-foreground">{display.fullName}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-[#B9974A]" aria-hidden />
                        {canContact ? (display.phone as string | undefined) ?? "—" : "Restricted"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-[#B9974A]" aria-hidden />
                        {canContact ? (display.email as string | undefined) ?? "—" : "Restricted"}
                      </span>
                    </div>
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 text-[#B9974A]" aria-hidden />
                      {prefBranch}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canCreateBooking ? (
                    <button
                      type="button"
                      onClick={() => onCreateBooking(display)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm sm:flex-none"
                    >
                      <PlusCircle className="h-3.5 w-3.5" aria-hidden />
                      Create booking
                    </button>
                  ) : null}
                  {canWalkIn ? (
                    <Link
                      href="/dashboard/queue"
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-xs font-medium text-foreground shadow-sm sm:flex-none"
                    >
                      <UserRound className="h-3.5 w-3.5" aria-hidden />
                      Queue walk-in
                    </Link>
                  ) : null}
                  {canUpdate ? (
                    <button
                      type="button"
                      onClick={() => onEdit(display)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-xs font-medium text-foreground shadow-sm sm:flex-none"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit
                    </button>
                  ) : null}
                </div>
              </header>

              {loyalty && (loyalty.enabled || loyalty.points > 0) ? (
                <section className="rounded-2xl border border-[#B9974A]/40 bg-[#FBF6E8] p-4 shadow-sm">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Star className="h-4 w-4 text-[#B9974A]" aria-hidden />
                    Loyalty
                  </h3>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-2xl font-semibold tabular-nums text-foreground">
                      {loyalty.points.toLocaleString("en-US")}
                      <span className="ml-1 text-xs font-medium text-muted-foreground">points</span>
                    </p>
                    <p className="text-right text-xs text-muted-foreground">
                      {loyalty.redeemableBlocks > 0
                        ? `Can take ${formatEGP(loyalty.redeemableBlocks * loyalty.redeemBlockValue)} off now`
                        : `${Math.max(0, loyalty.redeemBlockPoints - loyalty.points).toLocaleString("en-US")} more for ${formatEGP(loyalty.redeemBlockValue)} off`}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-foreground">
                    {loyalty.visits} fully paid visit{loyalty.visits === 1 ? "" : "s"}
                    {loyalty.rewardServiceName
                      ? loyalty.rewardsAvailable > 0
                        ? ` · free ${loyalty.rewardServiceName} ready to use`
                        : ` · ${loyalty.visitsToNextReward} more to a free ${loyalty.rewardServiceName}`
                      : null}
                  </p>
                  {!loyalty.enabled ? (
                    <p className="mt-2 text-xs text-muted-foreground">The loyalty program is switched off.</p>
                  ) : null}
                </section>
              ) : null}

              <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <MetricCard label="Total bookings" value={String(bookings.length)} />
                <MetricCard label="Completed" value={String(metrics.completed)} />
                <MetricCard
                  label="Cancelled / no-show"
                  value={String(metrics.cancelled + metrics.noShow)}
                />
                <MetricCard label="Total spent (completed)" value={formatEGP(metrics.totalSpent)} />
                <MetricCard
                  label="Last visit"
                  value={
                    metrics.lastVisit?.slot?.date
                      ? `${formatDayLabel(metrics.lastVisit.slot.date)} · ${formatWallClockRange12h(metrics.lastVisit.slot.startTime, metrics.lastVisit.slot.endTime)}`
                      : metrics.lastVisit
                        ? formatDateTimeAmPm(metrics.lastVisit.createdAt)
                        : "—"
                  }
                  small
                />
                <MetricCard
                  label="Next booking"
                  value={
                    metrics.upcoming?.slot?.date
                      ? `${formatDayLabel(metrics.upcoming.slot.date)} · ${formatWallClockRange12h(metrics.upcoming.slot.startTime, metrics.upcoming.slot.endTime)}`
                      : metrics.upcoming
                        ? formatDateTimeAmPm(metrics.upcoming.createdAt)
                        : "—"
                  }
                  small
                />
              </section>

              <section className="rounded-2xl border border-border bg-[#FFFCF7] p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground">Contact</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="text-right font-medium text-foreground">
                      {canContact ? (display.phone as string | undefined) ?? "—" : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="text-right font-medium text-foreground">
                      {canContact ? (display.email as string | undefined) ?? "—" : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Preferred branch</dt>
                    <dd className="text-right font-medium text-foreground">{prefBranch}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="text-right text-foreground">
                      {display.createdAt ? formatDateTimeAmPm(display.createdAt as string) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd className="text-right text-foreground">
                      {display.updatedAt ? formatDateTimeAmPm(display.updatedAt as string) : "—"}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-2xl border border-border bg-[#FFFCF7] p-4 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <StickyNote className="h-4 w-4 text-[#B9974A]" aria-hidden />
                  Sensitive notes
                </h3>
                {canSensitive ? (
                  <div className="mt-3 space-y-2 text-sm text-foreground">
                    <p>
                      <span className="font-medium text-muted-foreground">Notes: </span>
                      {(display.notes as string | undefined)?.trim()
                        ? (display.notes as string)
                        : "—"}
                    </p>
                    <p>
                      <span className="font-medium text-muted-foreground">Allergies / warnings: </span>
                      {(display.allergiesOrWarnings as string | undefined)?.trim()
                        ? (display.allergiesOrWarnings as string)
                        : "—"}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Sensitive notes are hidden based on your permissions.
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-border bg-[#FFFCF7] p-4 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Calendar className="h-4 w-4 text-[#B9974A]" aria-hidden />
                  Recent bookings
                </h3>
                {bookings.length === 0 ? (
                  <EmptyBlock
                    icon={<Sparkles className="h-8 w-8 text-[#C4B59A]" />}
                    title="No bookings yet"
                    text="When this client books services, they will appear here."
                  />
                ) : (
                  <ul className="mt-3 space-y-2">
                    {bookings.slice(0, 8).map((b) => (
                      <li
                        key={b.id}
                        className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="rounded-full border border-border bg-[#F8F4EC] px-2 py-0.5 text-xs font-medium text-foreground">
                            {bookingStatusLabel(b.status)}
                          </span>
                          <span className="text-xs font-medium tabular-nums text-foreground">{formatEGP(b.totalAmount)}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {b.slot?.date
                            ? `${formatDayLabel(b.slot.date)} · ${formatWallClockRange12h(b.slot.startTime, b.slot.endTime)}`
                            : formatDateTimeAmPm(b.createdAt)}
                          {b.branchName ? ` · ${b.branchName}` : null}
                        </p>
                        {b.servicesSummary ? (
                          <p className="mt-1 line-clamp-2 text-xs text-foreground">{b.servicesSummary}</p>
                        ) : null}
                        <Link
                          href={`/dashboard/bookings?bookingId=${b.id}`}
                          className="mt-2 inline-block text-xs font-medium text-[#0E342B] underline-offset-2 hover:underline"
                        >
                          View in bookings
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl border border-border bg-[#FFFCF7] p-4 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CreditCard className="h-4 w-4 text-[#B9974A]" aria-hidden />
                  Recent invoices
                </h3>
                {!canReadInvoices ? (
                  <EmptyBlock
                    title="Invoices unavailable"
                    text="You do not have permission to view invoices for this client."
                  />
                ) : invoiceError ? (
                  <p className="mt-3 text-sm text-muted-foreground">Could not load invoices. Try again later.</p>
                ) : invoices.length === 0 ? (
                  <EmptyBlock
                    title="No invoices yet"
                    text="Finalized invoices linked to this client will show here."
                  />
                ) : (
                  <ul className="mt-3 space-y-2">
                    {invoices.map((inv) => {
                      const paid = inv.remainingAmount <= 0;
                      return (
                        <li
                          key={inv.id}
                          className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm shadow-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-foreground">{inv.invoiceNumber}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                paid
                                  ? "border border-[#0E342B]/25 bg-[#E8F2EE] text-[#0E342B]"
                                  : "border border-[#E8D4A0]/80 bg-[#FFF9ED] text-[#6B5420]"
                              }`}
                            >
                              {paid ? "Paid" : "Balance due"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDateTimeAmPm(inv.createdAt)} · {formatEGP(inv.totalAmount)}
                          </p>
                          <Link
                            href={`/dashboard/invoices/${inv.id}/receipt`}
                            className="mt-2 inline-block text-xs font-medium text-[#0E342B] underline-offset-2 hover:underline"
                          >
                            View receipt
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function MetricCard({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-[#FFFCF7] px-3 py-2 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-semibold text-foreground ${small ? "text-xs leading-snug" : "text-sm"}`}>{value}</p>
    </div>
  );
}

function EmptyBlock({
  title,
  text,
  icon,
}: {
  title: string;
  text: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-border bg-white/60 px-4 py-6 text-center">
      {icon ? <div className="mb-2 flex justify-center">{icon}</div> : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}
