"use client";

import {
  ApiClientError,
  getDashboardAuditLogs,
  type DashboardAuditLogItem,
} from "@rouby/api-client";
import { formatDateTimeAmPm } from "@rouby/wall-clock";
import { useEffect, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "empty" | "error";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected API error.";
}

export default function DashboardAuditLogsPage() {
  const { token } = useDashboardAuth();
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DashboardAuditLogItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [userId, setUserId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!token) return;
    setState("loading");
    setError("");
    getDashboardAuditLogs(token, {
      module: module || undefined,
      action: action || undefined,
      userId: userId || undefined,
      entityId: entityId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      pageSize: 20,
    })
      .then((res) => {
        setRows(res.data);
        setHasNextPage(res.meta.hasNextPage);
        setState(res.data.length > 0 ? "loaded" : "empty");
      })
      .catch((requestError) => {
        setError(formatApiError(requestError));
        setState("error");
      });
  }, [action, dateFrom, dateTo, entityId, module, page, token, userId]);

  return (
    <PermissionGuard permission="audit.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-[#1F2420]">Audit Logs</h1>
          <p className="mt-2 text-sm text-[#7A6A58]">
            Track audited actions with module, action, user, entity, and date filters.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Module</span>
              <input
                value={module}
                onChange={(event) => {
                  setPage(1);
                  setModule(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Action</span>
              <input
                value={action}
                onChange={(event) => {
                  setPage(1);
                  setAction(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">User ID</span>
              <input
                value={userId}
                onChange={(event) => {
                  setPage(1);
                  setUserId(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Entity ID</span>
              <input
                value={entityId}
                onChange={(event) => {
                  setPage(1);
                  setEntityId(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date from</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => {
                  setPage(1);
                  setDateFrom(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">Date to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => {
                  setPage(1);
                  setDateTo(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
          </div>
        </section>

        {state === "loading" ? <p className="text-sm text-[#7A6A58]">Loading audit logs...</p> : null}
        {state === "error" ? (
          <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {state === "empty" ? (
          <p className="rounded border border-border bg-card px-3 py-2 text-sm text-[#7A6A58]">
            No audit entries found for current filters.
          </p>
        ) : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Module</th>
                    <th className="py-2 pr-3 font-medium">Action</th>
                    <th className="py-2 pr-3 font-medium">User</th>
                    <th className="py-2 pr-3 font-medium">Entity</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 hover:bg-[#FFF9EE]">
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {formatDateTimeAmPm(row.createdAt)}
                      </td>
                      <td className="py-3 pr-3 text-[#1F2420]">{row.module}</td>
                      <td className="py-3 pr-3 text-[#1F2420]">{row.action}</td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {row.user?.name ?? row.userId ?? "-"}
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">{row.entityId ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <article key={row.id} className="rounded-lg border border-border bg-white p-4">
                  <p className="text-xs text-[#7A6A58]">
                    {formatDateTimeAmPm(row.createdAt)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#1F2420]">{row.action}</p>
                  <p className="mt-1 text-xs text-[#7A6A58]">Module: {row.module}</p>
                  <p className="mt-1 text-xs text-[#7A6A58]">User: {row.user?.name ?? row.userId ?? "-"}</p>
                  <p className="mt-1 text-xs text-[#7A6A58]">Entity: {row.entityId ?? "-"}</p>
                </article>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded border border-border bg-white px-3 py-1 text-sm disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm text-[#7A6A58]">Page {page}</span>
              <button
                type="button"
                disabled={!hasNextPage}
                onClick={() => setPage((prev) => prev + 1)}
                className="rounded border border-border bg-white px-3 py-1 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </section>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
