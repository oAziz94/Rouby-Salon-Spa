"use client";

import {
  ApiClientError,
  getDashboardBranches,
  getDashboardClients,
  type DashboardBookingDetail,
  type DashboardBranch,
  type DashboardClient,
  type DashboardListMeta,
} from "@rouby/api-client";
import { formatWallClock12h } from "@rouby/wall-clock";
import {
  CalendarClock,
  Loader2,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  PlusCircle,
  Search,
  StickyNote,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { ClientProfileDrawer } from "@/components/clients/client-profile-drawer";
import { CreateClientModal, EditClientModal } from "@/components/clients/clients-modals";
import { DashboardCreateBookingDialog } from "@/components/dashboard-create-booking-dialog";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "idle" | "loading" | "loaded" | "error";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.statusCode === 401) {
      return "Unauthorized. Please sign in again.";
    }
    if (error.statusCode === 403) {
      return "You do not have permission to view clients.";
    }
    if (error.statusCode === 404) {
      return "Clients endpoint is not available.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected API error.";
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

function formatEGP(amount: number): string {
  return `EGP ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function branchDisplayName(
  client: DashboardClient,
  branches: DashboardBranch[],
  canResolveBranchList: boolean,
): string {
  const fromApi = client.preferredBranchName;
  if (typeof fromApi === "string" && fromApi.trim()) {
    return fromApi;
  }
  const branchId = client.preferredBranchId as string | null | undefined;
  if (!branchId) {
    return "—";
  }
  if (!canResolveBranchList) {
    return "Unknown branch";
  }
  const b = branches.find((x) => x.id === branchId);
  return b?.name ?? "Unknown branch";
}

function formatLastBookingDisplay(client: DashboardClient): string {
  const d = client.lastBookingSlotDate as string | null | undefined;
  const t = client.lastBookingSlotStartTime as string | null | undefined;
  if (!d) {
    return "—";
  }
  const day = new Date(`${d}T12:00:00Z`);
  const dateStr = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(day);
  if (!t) {
    return dateStr;
  }
  return `${dateStr} · ${formatWallClock12h(t)}`;
}

function startOfDayIso(d: string): number {
  const t = Date.parse(`${d}T00:00:00`);
  return Number.isNaN(t) ? NaN : t;
}

function endOfDayIso(d: string): number {
  const t = Date.parse(`${d}T23:59:59.999`);
  return Number.isNaN(t) ? NaN : t;
}

function filterClientsLocal(
  rows: DashboardClient[],
  opts: { branchId: string; createdFrom: string; createdTo: string },
): DashboardClient[] {
  return rows.filter((row) => {
    if (opts.branchId && (row.preferredBranchId as string | undefined) !== opts.branchId) {
      return false;
    }
    const created = row.createdAt ? Date.parse(row.createdAt as string) : NaN;
    if (opts.createdFrom && !Number.isNaN(created)) {
      const from = startOfDayIso(opts.createdFrom);
      if (!Number.isNaN(from) && created < from) {
        return false;
      }
    }
    if (opts.createdTo && !Number.isNaN(created)) {
      const to = endOfDayIso(opts.createdTo);
      if (!Number.isNaN(to) && created > to) {
        return false;
      }
    }
    return true;
  });
}

export default function DashboardClientsPage() {
  const { token, hasPermission, user } = useDashboardAuth();
  const [listState, setListState] = useState<LoadState>("idle");
  const [apiRows, setApiRows] = useState<DashboardClient[]>([]);
  const [listMeta, setListMeta] = useState<DashboardListMeta | null>(null);
  const [listError, setListError] = useState("");
  const [page, setPage] = useState(1);
  const [branches, setBranches] = useState<DashboardBranch[]>([]);

  const [draftSearch, setDraftSearch] = useState("");
  const [draftBranchId, setDraftBranchId] = useState("");
  const [draftCreatedFrom, setDraftCreatedFrom] = useState("");
  const [draftCreatedTo, setDraftCreatedTo] = useState("");

  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedBranchId, setAppliedBranchId] = useState("");
  const [appliedCreatedFrom, setAppliedCreatedFrom] = useState("");
  const [appliedCreatedTo, setAppliedCreatedTo] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DashboardClient | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClientId, setDrawerClientId] = useState<string | null>(null);
  const [drawerClientOverride, setDrawerClientOverride] = useState<DashboardClient | null>(null);

  const [createBookingOpen, setCreateBookingOpen] = useState(false);
  const [bookingPreset, setBookingPreset] = useState<{
    id: string;
    fullName: string;
    phone?: string | null;
  } | null>(null);

  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const canRead = hasPermission("clients.read");
  const canCreate = hasPermission("clients.create");
  const canUpdate = hasPermission("clients.update");
  const canContact = hasPermission("clients.contact.view");
  const canSensitive =
    hasPermission("clients.notes.sensitive") || hasPermission("clients.sensitive_notes.view");
  const canCreateBooking = hasPermission("bookings.create");
  const canReadBranches = hasPermission("branches.read");
  const canReadInvoices = hasPermission("invoices.read");
  const canWalkIn = hasPermission("queue.manage") && hasPermission("bookings.create");

  const canAccessMultipleBranches = user?.branchId === null && canReadBranches;

  const pushToast = useCallback((message: string, tone: "success" | "error") => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const loadList = useCallback(async () => {
    if (!token || !canRead) {
      return;
    }
    setListState("loading");
    setListError("");
    try {
      const response = await getDashboardClients(token, {
        page,
        pageSize: 50,
        search: appliedSearch.trim() || undefined,
      });
      const data = Array.isArray(response.data) ? response.data : [];
      setApiRows(data);
      setListMeta(response.meta ?? null);
      setListState("loaded");
    } catch (requestError) {
      setListError(formatApiError(requestError));
      setListState("error");
    }
  }, [appliedSearch, canRead, page, token]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

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
        if (!cancelled) {
          setBranches([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canReadBranches, token]);

  const filteredRows = useMemo(
    () =>
      filterClientsLocal(apiRows, {
        branchId: appliedBranchId,
        createdFrom: appliedCreatedFrom,
        createdTo: appliedCreatedTo,
      }),
    [apiRows, appliedBranchId, appliedCreatedFrom, appliedCreatedTo],
  );

  const stats = useMemo(() => {
    const total = listMeta?.totalItems ?? apiRows.length;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const newThisMonth = apiRows.filter((r) => {
      const c = r.createdAt ? Date.parse(r.createdAt as string) : NaN;
      return !Number.isNaN(c) && c >= monthStart;
    }).length;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentActive = apiRows.filter((r) => {
      const u = r.updatedAt ? Date.parse(r.updatedAt as string) : NaN;
      return !Number.isNaN(u) && u >= weekAgo;
    }).length;
    const partial = (listMeta?.totalItems ?? 0) > apiRows.length;
    return { total, newThisMonth, recentActive, partial };
  }, [apiRows, listMeta]);

  function applyFilters() {
    setAppliedSearch(draftSearch.trim());
    setAppliedBranchId(draftBranchId);
    setAppliedCreatedFrom(draftCreatedFrom);
    setAppliedCreatedTo(draftCreatedTo);
    setPage(1);
  }

  function clearFilters() {
    setDraftSearch("");
    setDraftBranchId("");
    setDraftCreatedFrom("");
    setDraftCreatedTo("");
    setAppliedSearch("");
    setAppliedBranchId("");
    setAppliedCreatedFrom("");
    setAppliedCreatedTo("");
    setPage(1);
  }

  function openDrawerForClient(id: string) {
    setDrawerClientId(id);
    setDrawerClientOverride(null);
    setDrawerOpen(true);
  }

  function onCreatedClient(client: DashboardClient, opts?: { openProfile?: boolean }) {
    pushToast("Client created successfully.", "success");
    void loadList();
    if (opts?.openProfile) {
      openDrawerForClient(client.id);
    }
  }

  function onSavedClient(client: DashboardClient) {
    pushToast("Client updated successfully.", "success");
    setDrawerClientOverride(client);
    void loadList();
    setApiRows((prev) => prev.map((r) => (r.id === client.id ? { ...r, ...client } : r)));
  }

  const chips = useMemo(() => {
    const out: { key: string; label: string }[] = [];
    if (appliedSearch) {
      out.push({ key: "search", label: `Search: ${appliedSearch}` });
    }
    if (appliedBranchId) {
      const name = branches.find((b) => b.id === appliedBranchId)?.name ?? "Branch";
      out.push({ key: "branch", label: `Branch: ${name}` });
    }
    if (appliedCreatedFrom) {
      out.push({ key: "from", label: `From: ${appliedCreatedFrom}` });
    }
    if (appliedCreatedTo) {
      out.push({ key: "to", label: `To: ${appliedCreatedTo}` });
    }
    return out;
  }, [appliedBranchId, appliedCreatedFrom, appliedCreatedTo, appliedSearch, branches]);

  const showLocalFilterHint =
    !!(appliedBranchId || appliedCreatedFrom || appliedCreatedTo) &&
    (listMeta?.totalItems ?? 0) > apiRows.length;

  const primaryBtn =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50";
  const secondaryBtn =
    "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-[#FFF9EE] disabled:opacity-50";

  const hasAnyAppliedFilter = chips.length > 0;
  const isEmptyDirectory = listState === "loaded" && apiRows.length === 0 && !hasAnyAppliedFilter;
  const isEmptySearchOrFilter =
    listState === "loaded" && apiRows.length === 0 && hasAnyAppliedFilter;
  const isEmptyFiltered =
    listState === "loaded" && apiRows.length > 0 && filteredRows.length === 0 && hasAnyAppliedFilter;

  const createBookingInitialBranchId = useMemo(() => {
    if (branches.length === 0) {
      return user?.branchId ?? "";
    }
    if (!bookingPreset) {
      return user?.branchId ?? branches[0]?.id ?? "";
    }
    const row = apiRows.find((r) => r.id === bookingPreset.id);
    const pref = row?.preferredBranchId as string | undefined;
    if (pref && branches.some((b) => b.id === pref)) {
      return pref;
    }
    return user?.branchId ?? branches[0]?.id ?? "";
  }, [apiRows, bookingPreset, branches, user?.branchId]);

  return (
    <PermissionGuard permission="clients.read">
      <section className="space-y-6">
        <header className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Clients</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Manage salon clients, profiles, visit history, notes, and booking activity.
              </p>
            </div>
            {canCreate ? (
              <button type="button" onClick={() => setCreateOpen(true)} className={primaryBtn}>
                <Plus className="h-4 w-4" aria-hidden />
                Create client
              </button>
            ) : null}
          </div>

          {listState === "loaded" && apiRows.length > 0 ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={<Users className="h-4 w-4 text-[#B9974A]" />}
                label="Total clients"
                value={String(stats.total)}
                hint={stats.partial ? "Directory total (all pages)" : undefined}
              />
              <StatCard
                icon={<CalendarClock className="h-4 w-4 text-[#B9974A]" />}
                label="New this month"
                value={String(stats.newThisMonth)}
                hint={stats.partial ? "Counted on this page only" : undefined}
              />
              <StatCard
                icon={<UserRound className="h-4 w-4 text-[#B9974A]" />}
                label="Clients with bookings"
                value={
                  listMeta?.clientsWithBookingsCount !== undefined
                    ? String(listMeta.clientsWithBookingsCount)
                    : "—"
                }
                hint={
                  listMeta?.clientsWithBookingsCount !== undefined
                    ? "Clients in this directory scope with at least one visible booking"
                    : undefined
                }
              />
              <StatCard
                icon={<Phone className="h-4 w-4 text-[#B9974A]" />}
                label="Active (7 days)"
                value={String(stats.recentActive)}
                hint={stats.partial ? "Updated on this page" : undefined}
              />
            </div>
          ) : null}
        </header>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              applyFilters();
            }}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <label className="min-w-0 flex-1 text-sm">
                <span className="mb-1.5 flex items-center gap-2 font-medium text-foreground">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  Search
                </span>
                <input
                  value={draftSearch}
                  onChange={(e) => setDraftSearch(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-[color:var(--gold)]/55"
                  placeholder="Name, phone, or email"
                  autoComplete="off"
                />
              </label>
              {canReadBranches && branches.length > 0 ? (
                <label className="w-full text-sm lg:w-52">
                  <span className="mb-1.5 block font-medium text-foreground">Preferred branch</span>
                  <select
                    value={draftBranchId}
                    onChange={(e) => setDraftBranchId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-[color:var(--gold)]/55"
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
              <label className="w-full text-sm lg:w-44">
                <span className="mb-1.5 block font-medium text-foreground">Created from</span>
                <input
                  type="date"
                  value={draftCreatedFrom}
                  onChange={(e) => setDraftCreatedFrom(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-[color:var(--gold)]/55"
                />
              </label>
              <label className="w-full text-sm lg:w-44">
                <span className="mb-1.5 block font-medium text-foreground">Created to</span>
                <input
                  type="date"
                  value={draftCreatedTo}
                  onChange={(e) => setDraftCreatedTo(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-[color:var(--gold)]/55"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={primaryBtn}>
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => clearFilters()}
                  className={secondaryBtn}
                  disabled={listState === "loading"}
                >
                  Clear filters
                </button>
              </div>
            </div>
            {chips.length > 0 ? (
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Active filters
                </span>
                {chips.map((c) => (
                  <span
                    key={c.key}
                    className="inline-flex items-center rounded-full border border-[#B9974A]/35 bg-[#FBF6E8] px-2.5 py-1 text-xs font-medium text-[#5C4A18]"
                  >
                    {c.label}
                  </span>
                ))}
              </div>
            ) : null}
            {showLocalFilterHint ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Branch and date filters apply to the clients loaded on this page. Use search to narrow the server list,
                then refine with these filters.
              </p>
            ) : null}
          </form>
        </section>

        {listState === "loading" ? <ClientsTableSkeleton /> : null}

        {listState === "error" ? (
          <section className="rounded-2xl border border-[#E7B9A4]/80 bg-[#FFF1EC] p-6 shadow-sm">
            <p className="text-sm font-medium text-danger">{listError}</p>
            <button type="button" className={`${secondaryBtn} mt-4`} onClick={() => void loadList()}>
              Retry
            </button>
          </section>
        ) : null}

        {isEmptyDirectory ? (
          <EmptyState
            title="No clients yet"
            text="Create your first client profile or add one from a booking."
            action={
              canCreate ? (
                <button type="button" onClick={() => setCreateOpen(true)} className={primaryBtn}>
                  Create client
                </button>
              ) : null
            }
          />
        ) : null}

        {isEmptySearchOrFilter ? (
          <EmptyState
            title="No matching clients"
            text="Try changing the search term or clearing filters."
            action={
              <button type="button" onClick={() => clearFilters()} className={secondaryBtn}>
                Clear filters
              </button>
            }
          />
        ) : null}

        {isEmptyFiltered ? (
          <EmptyState
            title="No matching clients"
            text="Try changing the search term or clearing filters."
            action={
              <button type="button" onClick={() => clearFilters()} className={secondaryBtn}>
                Clear filters
              </button>
            }
          />
        ) : null}

        {listState === "loaded" && filteredRows.length > 0 ? (
          <section className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead className="sticky top-0 z-[1] bg-card shadow-[0_1px_0_var(--border)]">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Preferred branch</th>
                    <th className="px-4 py-3">Last booking</th>
                    <th className="px-4 py-3 text-center">Bookings</th>
                    <th className="px-4 py-3 text-center">Spent</th>
                    <th className="px-4 py-3 text-center">Notes</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((client) => (
                    <tr
                      key={client.id}
                      className="cursor-pointer border-t border-border/70 transition hover:bg-[#FFF9EE]/90"
                      onClick={() => openDrawerForClient(client.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#B9974A]/35 bg-[#FBF6E8] text-xs font-semibold text-[#5C4A18]">
                            {initialsFromName(client.fullName)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{client.fullName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {canContact ? (client.phone as string | undefined) ?? "—" : "Restricted"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {canContact ? (client.email as string | undefined) ?? "—" : "—"}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground">
                        {branchDisplayName(client, branches, canReadBranches)}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-muted-foreground">
                        {formatLastBookingDisplay(client)}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">
                        {String(client.bookingCount ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-foreground">
                        {formatEGP(Number(client.totalSpentCompleted ?? 0))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <NotesIndicator canSensitive={canSensitive} notes={client.notes as string | undefined} />
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowActions
                          client={client}
                          canCreateBooking={canCreateBooking}
                          canUpdate={canUpdate}
                          canWalkIn={canWalkIn}
                          onView={() => openDrawerForClient(client.id)}
                          onEdit={() => {
                            setEditTarget(client);
                            setEditOpen(true);
                          }}
                          onBook={() => {
                            setBookingPreset({
                              id: client.id,
                              fullName: client.fullName,
                              phone: canContact ? (client.phone as string | undefined) : undefined,
                            });
                            setCreateBookingOpen(true);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {filteredRows.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => openDrawerForClient(client.id)}
                  className="w-full rounded-2xl border border-border bg-[#FFFCF7] p-4 text-left shadow-sm transition hover:border-[#B9974A]/45"
                >
                  <div className="flex gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#B9974A]/35 bg-[#FBF6E8] text-xs font-semibold text-[#5C4A18]">
                      {initialsFromName(client.fullName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">{client.fullName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {canContact ? (client.phone as string | undefined) ?? "—" : "Restricted"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {branchDisplayName(client, branches, canReadBranches)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {String(client.bookingCount ?? 0)} bookings · {formatEGP(Number(client.totalSpentCompleted ?? 0))}{" "}
                        spent
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {listMeta && listMeta.totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
                <p className="text-muted-foreground">
                  Page {listMeta.page} of {listMeta.totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={secondaryBtn}
                    disabled={listMeta.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className={secondaryBtn}
                    disabled={!listMeta.hasNextPage}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <CreateClientModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          token={token ?? ""}
          branches={branches}
          canPickPreferredBranch={canAccessMultipleBranches}
          canSensitiveNotes={canSensitive}
          saving={createBusy}
          onSavingChange={setCreateBusy}
          onSuccess={(c) => onCreatedClient(c)}
          onErrorToast={(m) => pushToast(m, "error")}
        />

        <EditClientModal
          open={editOpen}
          onClose={() => {
            setEditOpen(false);
            setEditTarget(null);
          }}
          token={token ?? ""}
          client={editTarget}
          branches={branches}
          canPickPreferredBranch={canAccessMultipleBranches}
          canContact={canContact}
          canSensitiveNotes={canSensitive}
          saving={editBusy}
          onSavingChange={setEditBusy}
          onSaved={onSavedClient}
          onErrorToast={(m) => pushToast(m, "error")}
        />

        <ClientProfileDrawer
          open={drawerOpen}
          clientId={drawerClientId}
          token={token ?? ""}
          branches={branches}
          canContact={canContact}
          canSensitive={canSensitive}
          canUpdate={canUpdate}
          canCreateBooking={canCreateBooking}
          canWalkIn={canWalkIn}
          canReadInvoices={canReadInvoices}
          externalClient={drawerClientOverride}
          onClose={() => {
            setDrawerOpen(false);
            setDrawerClientId(null);
            setDrawerClientOverride(null);
          }}
          onEdit={(c) => {
            setEditTarget(c);
            setEditOpen(true);
          }}
          onCreateBooking={(c) => {
            setBookingPreset({
              id: c.id,
              fullName: c.fullName,
              phone: canContact ? (c.phone as string | undefined) : undefined,
            });
            setCreateBookingOpen(true);
          }}
        />

        {token && canCreateBooking && branches.length > 0 ? (
          <DashboardCreateBookingDialog
            open={createBookingOpen}
            onClose={() => {
              setCreateBookingOpen(false);
              setBookingPreset(null);
            }}
            token={token}
            branches={branches}
            initialBranchId={createBookingInitialBranchId}
            branchSelectDisabled={!canAccessMultipleBranches}
            presetClient={bookingPreset}
            onCreated={(detail: DashboardBookingDetail) => {
              setCreateBookingOpen(false);
              setBookingPreset(null);
              pushToast("Booking created.", "success");
              void loadList();
              if (detail.id) {
                window.location.href = `/dashboard/bookings?bookingId=${detail.id}`;
              }
            }}
          />
        ) : null}

        {toast ? (
          <div
            className={`fixed bottom-6 left-1/2 z-[70] max-w-md -translate-x-1/2 rounded-xl border px-4 py-3 text-sm shadow-lg ${
              toast.tone === "success"
                ? "border-[#0E342B]/25 bg-[#E8F2EE] text-[#0E342B]"
                : "border-[#E7B9A4]/80 bg-[#FFF1EC] text-danger"
            }`}
            role="status"
          >
            {toast.message}
          </div>
        ) : null}
      </section>
    </PermissionGuard>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-[#FFFCF7] px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function NotesIndicator({ canSensitive, notes }: { canSensitive: boolean; notes?: string }) {
  if (canSensitive) {
    const has = Boolean(notes?.trim());
    return (
      <span className="inline-flex justify-center" title={has ? "Has notes" : "No notes"}>
        <StickyNote
          className={`h-4 w-4 ${has ? "text-[#B9974A]" : "text-[#D8D0C4]"}`}
          aria-label={has ? "Has sensitive notes" : "No sensitive notes"}
        />
      </span>
    );
  }
  return (
    <span className="inline-flex justify-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      Locked
    </span>
  );
}

function RowActions({
  client,
  canCreateBooking,
  canUpdate,
  canWalkIn,
  onView,
  onEdit,
  onBook,
}: {
  client: DashboardClient;
  canCreateBooking: boolean;
  canUpdate: boolean;
  canWalkIn: boolean;
  onView: () => void;
  onEdit: () => void;
  onBook: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {canCreateBooking ? (
        <button
          type="button"
          onClick={onBook}
          className="rounded-lg p-2 text-[#0E342B] hover:bg-white/80"
          title="Create booking"
        >
          <PlusCircle className="h-4 w-4" />
        </button>
      ) : null}
      {canUpdate ? (
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg p-2 text-foreground hover:bg-white/80"
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>
      ) : null}
      <details className="relative group" onClick={(e) => e.stopPropagation()}>
        <summary className="list-none cursor-pointer rounded-lg p-2 text-muted-foreground hover:bg-white/80 [&::-webkit-details-marker]:hidden">
          <MoreHorizontal className="h-4 w-4" />
        </summary>
        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-card py-1 text-left text-xs shadow-lg">
          <button
            type="button"
            onClick={onView}
            className="block w-full px-3 py-2 text-left font-medium text-foreground hover:bg-[#FFF9EE]"
          >
            View profile
          </button>
          <Link
            href={`/dashboard/clients/${client.id}`}
            className="block px-3 py-2 font-medium text-foreground hover:bg-[#FFF9EE]"
          >
            Open full page
          </Link>
          {canWalkIn ? (
            <Link
              href="/dashboard/queue"
              className="block px-3 py-2 font-medium text-foreground hover:bg-[#FFF9EE]"
            >
              Queue walk-in
            </Link>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function ClientsTableSkeleton() {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading clients…
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-[#F0EBE3]" />
        ))}
      </div>
    </section>
  );
}

function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-[#FFFCF7] px-6 py-14 text-center shadow-sm">
      <Users className="mx-auto h-10 w-10 text-[#C4B59A]" aria-hidden />
      <h2 className="mt-4 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{text}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </section>
  );
}
