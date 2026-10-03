"use client";

import {
  ApiClientError,
  getDashboardAuditLogById,
  getDashboardAuditLogFacets,
  getDashboardAuditLogs,
  getDashboardClientById,
  type DashboardAuditLogDetail,
  type DashboardAuditLogFacets,
  type DashboardAuditLogItem,
  type DashboardAuditLogSeverity,
} from "@rouby/api-client";
import { ChevronDown, Loader2, RefreshCw, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { AuditDetailPanel } from "@/components/audit/audit-detail-panel";
import { AuditEntry } from "@/components/audit/audit-entry";
import {
  CATEGORY_CHIPS,
  RANGE_CHIPS,
  bookingReference,
  groupByDay,
  isCategoryFilter,
  rangeToDates,
  type CategoryFilter,
  type RangeKey,
} from "@/components/audit/audit-helpers";
import { useDashboardAuth } from "@/lib/dashboard-auth";

const PAGE_SIZE = 30;

type LoadState = "loading" | "ready" | "empty" | "error";

function friendlyError(error: unknown): string {
  if (error instanceof ApiClientError && error.statusCode === 403) {
    return "You do not have permission to view the activity log.";
  }
  if (error instanceof ApiClientError || error instanceof Error) {
    return `We could not load the activity: ${error.message}`;
  }
  return "We could not load the activity. Please try again.";
}

const chipBase = "rounded-full border px-3 py-1.5 text-sm transition";
const chipOn = "border-[#0E342B] bg-[#0E342B] text-white";
const chipOff = "border-border bg-white text-[#1F2420] hover:bg-[#FFF9EE]";

function AuditLogsContent() {
  const { token } = useDashboardAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // The page can be opened already narrowed (links from a booking or a client).
  const [scope, setScope] = useState<{ bookingId: string; clientId: string }>(() => ({
    bookingId: searchParams.get("bookingId")?.trim() ?? "",
    clientId: searchParams.get("clientId")?.trim() ?? "",
  }));
  const scoped = Boolean(scope.bookingId || scope.clientId);
  const [scopeClientName, setScopeClientName] = useState("");

  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");
  const [search, setSearch] = useState(() => (searchParams.get("search") ?? "").trim());
  const [category, setCategory] = useState<CategoryFilter>(() => {
    const raw = searchParams.get("category");
    return isCategoryFilter(raw) ? raw : "all";
  });
  const [range, setRange] = useState<RangeKey>(() =>
    searchParams.get("bookingId") || searchParams.get("clientId") ? "all" : "7d",
  );
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [userId, setUserId] = useState("");
  const [severity, setSeverity] = useState<"" | DashboardAuditLogSeverity>("");
  const [branchId, setBranchId] = useState("");

  const [facets, setFacets] = useState<DashboardAuditLogFacets | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardAuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const requestSeq = useRef(0);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<"loading" | "ready" | "error">("loading");
  const [detail, setDetail] = useState<DashboardAuditLogDetail | null>(null);
  const [detailError, setDetailError] = useState("");

  // Debounce the search box.
  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (!token) return;
    void getDashboardAuditLogFacets(token)
      .then(setFacets)
      .catch(() => setFacets(null));
  }, [token]);

  useEffect(() => {
    if (!token || !scope.clientId) {
      setScopeClientName("");
      return;
    }
    let cancelled = false;
    void getDashboardClientById(token, scope.clientId)
      .then((c) => {
        if (!cancelled) setScopeClientName(c.fullName);
      })
      .catch(() => {
        if (!cancelled) setScopeClientName("");
      });
    return () => {
      cancelled = true;
    };
  }, [token, scope.clientId]);

  const filterQuery = useMemo(() => {
    const dates = rangeToDates(range, customFrom, customTo);
    return {
      search: search || undefined,
      category: category === "all" ? undefined : category,
      userId: userId || undefined,
      severity: severity || undefined,
      branchId: branchId || undefined,
      bookingId: scope.bookingId || undefined,
      clientId: scope.clientId || undefined,
      ...dates,
    };
  }, [branchId, category, customFrom, customTo, range, scope, search, severity, userId]);

  // Any change to the filters starts again from the newest entries.
  useEffect(() => {
    if (!token) return;
    const seq = ++requestSeq.current;
    setState("loading");
    setMoreError("");
    void getDashboardAuditLogs(token, { ...filterQuery, page: 1, limit: PAGE_SIZE })
      .then((res) => {
        if (seq !== requestSeq.current) return;
        setRows(res.data);
        setTotal(res.meta.totalItems);
        setPage(1);
        setHasMore(res.meta.hasNextPage);
        setState(res.data.length === 0 ? "empty" : "ready");
      })
      .catch((err: unknown) => {
        if (seq !== requestSeq.current) return;
        setError(friendlyError(err));
        setState("error");
      });
  }, [filterQuery, refreshTick, token]);

  const loadMore = useCallback(async () => {
    if (!token || loadingMore) return;
    const seq = requestSeq.current;
    setLoadingMore(true);
    setMoreError("");
    try {
      const next = page + 1;
      const res = await getDashboardAuditLogs(token, {
        ...filterQuery,
        page: next,
        limit: PAGE_SIZE,
      });
      if (seq !== requestSeq.current) return;
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...res.data.filter((r) => !seen.has(r.id))];
      });
      setTotal(res.meta.totalItems);
      setPage(next);
      setHasMore(res.meta.hasNextPage);
    } catch (err) {
      setMoreError(friendlyError(err));
    } finally {
      setLoadingMore(false);
    }
  }, [filterQuery, loadingMore, page, token]);

  useEffect(() => {
    if (!token || !detailId) return;
    let cancelled = false;
    setDetailState("loading");
    setDetail(null);
    void getDashboardAuditLogById(token, detailId)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
        setDetailState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDetailError(friendlyError(err));
        setDetailState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [detailId, token]);

  function clearScope() {
    setScope({ bookingId: "", clientId: "" });
    setRange("7d");
    router.replace("/dashboard/audit-logs");
  }

  const groups = useMemo(() => groupByDay(rows), [rows]);
  const filtersActive = Boolean(
    search || category !== "all" || userId || severity || branchId || range !== "7d",
  );

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setCategory("all");
    setUserId("");
    setSeverity("");
    setBranchId("");
    setRange(scoped ? "all" : "7d");
  }

  const scopeText = scope.bookingId
    ? `booking ${bookingReference(scope.bookingId)}`
    : `client ${scopeClientName || "this client"}`;

  return (
    <PermissionGuard permission="audit.read">
      <section className="space-y-4">
        <header className="rounded-2xl border border-[#E9D8B6] bg-card p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Activity log</h1>
              <p className="mt-1 text-sm text-[#7A6A58]">
                Who did what in the salon system, in plain words. Read-only.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRefreshTick((n) => n + 1)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm text-[#1F2420] hover:bg-[#FFF9EE]"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>

          {scoped ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/50 bg-[#FFF8EA] px-3 py-2 text-sm text-[#6B4B00]">
              <span>Showing history for {scopeText}</span>
              <button
                type="button"
                onClick={clearScope}
                aria-label="Show all activity again"
                className="rounded-md p-1 hover:bg-[#FFF0C9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#9A8B79]" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by client, phone, staff, invoice or booking number"
              aria-label="Search the activity log"
              className="w-full rounded-lg border border-border bg-white py-2.5 pl-9 pr-3 text-sm"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Type of activity">
            {CATEGORY_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-pressed={category === chip.key}
                onClick={() => setCategory(chip.key)}
                className={`${chipBase} ${category === chip.key ? chipOn : chipOff}`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Dates">
            {scoped ? (
              <button
                type="button"
                aria-pressed={range === "all"}
                onClick={() => setRange("all")}
                className={`${chipBase} ${range === "all" ? chipOn : chipOff}`}
              >
                All time
              </button>
            ) : null}
            {RANGE_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-pressed={range === chip.key}
                onClick={() => setRange(chip.key)}
                className={`${chipBase} ${range === chip.key ? chipOn : chipOff}`}
              >
                {chip.label}
              </button>
            ))}
            {range === "custom" ? (
              <span className="flex flex-wrap items-center gap-2 text-sm text-[#7A6A58]">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  aria-label="From date"
                  className="rounded-lg border border-border bg-white px-2 py-1.5"
                />
                to
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  aria-label="To date"
                  className="rounded-lg border border-border bg-white px-2 py-1.5"
                />
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[#1F2420]">
              Who
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Everyone</option>
                {(facets?.users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </label>
            <details className="group text-sm">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[#7A6A58] hover:text-[#1F2420]">
                More filters
                <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
              </summary>
              <div className="mt-2 flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-[#1F2420]">
                  Importance
                  <select
                    value={severity}
                    onChange={(e) =>
                      setSeverity(e.target.value as "" | DashboardAuditLogSeverity)
                    }
                    className="rounded-lg border border-border bg-white px-2 py-1.5"
                  >
                    <option value="">Everything</option>
                    <option value="WARNING">Worth a look</option>
                    <option value="CRITICAL">Needs attention</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-[#1F2420]">
                  Branch
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="rounded-lg border border-border bg-white px-2 py-1.5"
                  >
                    <option value="">All branches</option>
                    {(facets?.branches ?? []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>
            {state === "ready" || state === "empty" ? (
              <p className="ml-auto text-sm text-[#7A6A58]" aria-live="polite">
                {total === 1 ? "1 entry" : `${total.toLocaleString("en-US")} entries`}
              </p>
            ) : null}
          </div>
        </header>

        {state === "loading" ? (
          <section className="rounded-xl border border-border bg-card p-8 shadow-sm">
            <p className="inline-flex items-center gap-2 text-sm text-[#7A6A58]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading the activity...
            </p>
          </section>
        ) : null}

        {state === "error" ? (
          <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-4 text-sm text-danger">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setRefreshTick((n) => n + 1)}
              className="mt-2 rounded border border-[#E7B9A4] bg-white px-3 py-1.5 text-xs text-[#8A3D1E]"
            >
              Try again
            </button>
          </section>
        ) : null}

        {state === "empty" ? (
          <section className="rounded-xl border border-border bg-card p-6 text-sm text-[#7A6A58]">
            <h2 className="text-base font-semibold text-[#1F2420]">Nothing found</h2>
            <p className="mt-1">
              {scoped
                ? "There is no recorded activity for this yet."
                : "No activity matches what you picked. Try a longer period or a different search."}
            </p>
            {filtersActive ? (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-3 rounded-lg border border-border bg-white px-3 py-1.5 text-[#1F2420] hover:bg-[#FFF9EE]"
              >
                Clear filters
              </button>
            ) : null}
          </section>
        ) : null}

        {state === "ready" ? (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.ymd}>
                <h2 className="mb-2 px-1 text-sm font-semibold text-[#7A6A58]">{group.heading}</h2>
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <AuditEntry key={item.id} item={item} onOpen={setDetailId} />
                  ))}
                </ul>
              </section>
            ))}

            {moreError ? (
              <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                {moreError}
              </p>
            ) : null}
            {hasMore ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#D4AF37]/50 bg-[#FFF4D6] px-4 py-2 text-sm font-medium text-[#6B4B00] hover:bg-[#FDEAB3] disabled:opacity-60"
                >
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Load more
                </button>
              </div>
            ) : (
              <p className="text-center text-xs text-[#7A6A58]">That is everything for these filters.</p>
            )}
          </div>
        ) : null}

        {detailId ? (
          <AuditDetailPanel
            state={detailState}
            detail={detail}
            error={detailError}
            onClose={() => setDetailId(null)}
          />
        ) : null}
      </section>
    </PermissionGuard>
  );
}

export default function DashboardAuditLogsPage() {
  return (
    <Suspense fallback={null}>
      <AuditLogsContent />
    </Suspense>
  );
}
