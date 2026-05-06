"use client";

import {
  ApiClientError,
  createDashboardClient,
  getDashboardClients,
  type DashboardClient,
} from "@rouby/api-client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "@/components/auth-required";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "empty" | "error";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.statusCode === 401) {
      return "Unauthorized (401). Please sign in again.";
    }
    if (error.statusCode === 403) {
      return "Forbidden (403). You do not have permission.";
    }
    if (error.statusCode === 404) {
      return "Clients endpoint is not available in backend yet.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected API error.";
}

export default function DashboardClientsPage() {
  const { token, hasPermission } = useDashboardAuth();
  const [state, setState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<DashboardClient[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searchCommitted, setSearchCommitted] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const canRead = hasPermission("clients.read");
  const canCreate = hasPermission("clients.create");
  const canContact = hasPermission("clients.contact.view");
  const canSensitive =
    hasPermission("clients.notes.sensitive") ||
    hasPermission("clients.sensitive_notes.view");

  useEffect(() => {
    if (!token || !canRead) {
      return;
    }
    setState("loading");
    setError("");
    getDashboardClients(token, {
      page: 1,
      pageSize: 50,
      search: searchCommitted || undefined,
    })
      .then((response) => {
        const data = Array.isArray(response.data) ? response.data : [];
        setRows(data);
        setState(data.length > 0 ? "loaded" : "empty");
      })
      .catch((requestError) => {
        setError(formatApiError(requestError));
        setState("error");
      });
  }, [canRead, searchCommitted, token]);

  const endpointSupportMessage = useMemo(() => {
    if (state !== "error") {
      return "";
    }
    if (error.includes("not available")) {
      return "Read-only fallback: backend client management endpoints are unavailable; no invented endpoints used.";
    }
    return "";
  }, [error, state]);

  async function onCreateClientSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setCreateLoading(true);
    setCreateError("");
    try {
      await createDashboardClient(token, {
        fullName: createName,
        phone: createPhone || undefined,
        email: createEmail || undefined,
      });
      setCreateOpen(false);
      setCreateName("");
      setCreatePhone("");
      setCreateEmail("");
      setSearchCommitted((value) => value);
      const refreshed = await getDashboardClients(token, { page: 1, pageSize: 50 });
      setRows(refreshed.data ?? []);
      setState((refreshed.data ?? []).length > 0 ? "loaded" : "empty");
    } catch (requestError) {
      setCreateError(formatApiError(requestError));
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <PermissionGuard permission="clients.read">
      <section className="space-y-6">
        <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1F2420]">Clients</h1>
              <p className="mt-2 text-sm text-[#7A6A58]">
                Client directory and profile access with permission-aware masking.
              </p>
            </div>
            {canCreate ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Create client
              </button>
            ) : null}
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setSearchCommitted(search.trim());
            }}
          >
            <label className="min-w-[240px] flex-1 text-sm">
              <span className="mb-1 block font-medium text-[#1F2420]">
                Search (name/phone if supported)
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2"
                placeholder="Search clients"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-[#1F2420]"
            >
              Apply
            </button>
          </form>
        </section>

        {state === "loading" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm text-sm text-[#7A6A58]">
            Loading clients...
          </section>
        ) : null}
        {state === "error" ? (
          <section className="space-y-2 rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 shadow-sm">
            <p className="text-sm text-danger">{error}</p>
            {endpointSupportMessage ? (
              <p className="text-xs text-[#7A6A58]">{endpointSupportMessage}</p>
            ) : null}
          </section>
        ) : null}
        {state === "empty" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm text-sm text-[#7A6A58]">
            No clients found.
          </section>
        ) : null}

        {state === "loaded" ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[#7A6A58]">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Phone</th>
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 pr-3 font-medium">Preferred branch</th>
                    <th className="py-2 pr-3 font-medium">Sensitive notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((client) => (
                    <tr key={client.id} className="border-b border-border/60 hover:bg-[#FFF9EE]">
                      <td className="py-3 pr-3 font-medium text-[#1F2420]">
                        <Link href={`/dashboard/clients/${client.id}`} className="underline-offset-2 hover:underline">
                          {client.fullName}
                        </Link>
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {canContact ? (client.phone ?? "-") : "Masked"}
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {canContact ? (client.email ?? "-") : "Masked"}
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {(client.preferredBranchId as string | null | undefined) ?? "-"}
                      </td>
                      <td className="py-3 pr-3 text-[#7A6A58]">
                        {canSensitive ? ((client.notes as string | null | undefined) ?? "-") : "Masked"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 md:hidden">
              {rows.map((client) => (
                <article key={client.id} className="rounded-lg border border-border bg-white p-4">
                  <Link
                    href={`/dashboard/clients/${client.id}`}
                    className="text-sm font-semibold text-[#1F2420] underline-offset-2 hover:underline"
                  >
                    {client.fullName}
                  </Link>
                  <p className="mt-2 text-xs text-[#7A6A58]">
                    Phone: {canContact ? (client.phone ?? "-") : "Masked"}
                  </p>
                  <p className="mt-1 text-xs text-[#7A6A58]">
                    Email: {canContact ? (client.email ?? "-") : "Masked"}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {createOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2A1722]/40 p-4">
            <section className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
              <h2 className="text-lg font-semibold text-[#1F2420]">Create client</h2>
              <form className="mt-4 space-y-3" onSubmit={onCreateClientSubmit}>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Name</span>
                  <input
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    required
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Phone</span>
                  <input
                    value={createPhone}
                    onChange={(event) => setCreatePhone(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[#1F2420]">Email</span>
                  <input
                    type="email"
                    value={createEmail}
                    onChange={(event) => setCreateEmail(event.target.value)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2"
                  />
                </label>
                {createError ? (
                  <p className="rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
                    {createError}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="rounded-md border border-border bg-white px-3 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createLoading}
                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {createLoading ? "Saving..." : "Create"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </section>
    </PermissionGuard>
  );
}
