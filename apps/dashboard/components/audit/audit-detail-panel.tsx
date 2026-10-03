"use client";

import type { DashboardAuditLogDetail } from "@rouby/api-client";
import { ChevronDown, ExternalLink, Loader2, X } from "lucide-react";
import Link from "next/link";
import { CategoryIcon, OverrideTag, categoryTone } from "./audit-entry";
import { cairoDateTime, categoryLabel, summaryWithoutReason } from "./audit-helpers";

type Props = {
  state: "loading" | "ready" | "error";
  detail: DashboardAuditLogDetail | null;
  error: string;
  onClose: () => void;
};

function severityNote(severity: DashboardAuditLogDetail["severity"]) {
  if (severity === "CRITICAL") {
    return { text: "Needs attention", cls: "border-red-200 bg-red-50 text-red-900" };
  }
  if (severity === "WARNING") {
    return { text: "Worth a look", cls: "border-amber-200 bg-amber-50 text-amber-900" };
  }
  return null;
}

export function AuditDetailPanel({ state, detail, error, onClose }: Props) {
  const note = detail ? severityNote(detail.severity) : null;
  const links = detail?.links;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#2A1722]/35">
      <button aria-label="Close" className="hidden h-full flex-1 sm:block" onClick={onClose} />
      <aside
        className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-[#FFFDF9] p-4 shadow-2xl sm:p-6"
        role="dialog"
        aria-label="Entry details"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold text-[#1F2420]">What happened</h2>
          <button
            type="button"
            aria-label="Close"
            className="rounded-md border border-border bg-white p-2"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {state === "loading" ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-[#7A6A58]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the details...
          </p>
        ) : null}
        {state === "error" ? (
          <p className="mt-4 rounded border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
            {error || "We could not load this entry. Please close it and try again."}
          </p>
        ) : null}

        {state === "ready" && detail ? (
          <div className="mt-4 space-y-4">
            <section className="rounded-xl border border-border bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${categoryTone(detail.category)}`}
                >
                  <CategoryIcon category={detail.category} />
                </span>
                <p className="text-lg font-semibold text-[#1F2420]">{detail.title}</p>
                {detail.isOverride ? <OverrideTag /> : null}
              </div>
              <p className="mt-3 text-sm text-[#1F2420]">{summaryWithoutReason(detail)}</p>
              {detail.reason ? (
                <p className="mt-2 rounded-lg bg-[#FFF8EA] px-3 py-2 text-sm text-[#6B4B00]">
                  <span className="font-medium">Reason:</span> {detail.reason}
                </p>
              ) : null}
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-[#7A6A58]">Done by</dt>
                  <dd className="text-[#1F2420]">
                    {detail.actor.isSystem ? "The system" : detail.actor.name}
                  </dd>
                  {detail.actor.email ? (
                    <dd className="text-xs text-[#7A6A58]">{detail.actor.email}</dd>
                  ) : null}
                </div>
                <div>
                  <dt className="text-xs text-[#7A6A58]">When</dt>
                  <dd className="text-[#1F2420]">{cairoDateTime(detail.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#7A6A58]">Type</dt>
                  <dd className="text-[#1F2420]">{categoryLabel(detail.category)}</dd>
                </div>
                {detail.branch?.name ? (
                  <div>
                    <dt className="text-xs text-[#7A6A58]">Branch</dt>
                    <dd className="text-[#1F2420]">{detail.branch.name}</dd>
                  </div>
                ) : null}
              </dl>
              {note ? (
                <p className={`mt-3 inline-flex rounded-full border px-2 py-0.5 text-xs ${note.cls}`}>
                  {note.text}
                </p>
              ) : null}
            </section>

            {links?.bookingId || links?.invoiceId ? (
              <div className="flex flex-wrap gap-2">
                {links.bookingId ? (
                  <Link
                    href={`/dashboard/bookings?bookingId=${links.bookingId}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm text-[#1F2420] hover:bg-[#FFF9EE]"
                  >
                    <ExternalLink className="h-4 w-4" /> Open booking
                  </Link>
                ) : null}
                {links.invoiceId ? (
                  <Link
                    href={`/dashboard/invoices/${links.invoiceId}/receipt`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm text-[#1F2420] hover:bg-[#FFF9EE]"
                  >
                    <ExternalLink className="h-4 w-4" /> Open receipt
                  </Link>
                ) : null}
              </div>
            ) : null}

            <section className="rounded-xl border border-border bg-white p-4">
              <h3 className="text-sm font-semibold text-[#1F2420]">What changed</h3>
              {detail.changes.length === 0 ? (
                <p className="mt-2 text-sm text-[#7A6A58]">
                  Nothing was edited here. The sentence above says everything that was recorded.
                </p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-[#7A6A58]">
                        <th className="py-2 pr-3 font-medium">Field</th>
                        <th className="py-2 pr-3 font-medium">Before</th>
                        <th className="py-2 font-medium">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.changes.map((change) => (
                        <tr key={change.field} className="border-b border-border/60 align-top">
                          <td className="py-2 pr-3 font-medium text-[#1F2420]">{change.field}</td>
                          <td className="py-2 pr-3 text-[#7A6A58]">{change.before || "-"}</td>
                          <td className="py-2 text-[#1F2420]">{change.after || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <details className="group rounded-xl border border-border bg-white p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-[#1F2420]">
                Technical details
                <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
              </summary>
              <dl className="mt-3 space-y-1 break-all text-xs text-[#7A6A58]">
                <div>Action code: {detail.technical.action}</div>
                <div>Entry id: {detail.technical.auditLogId}</div>
                {detail.technical.entityId ? <div>Record id: {detail.technical.entityId}</div> : null}
                {detail.technical.bookingId ? <div>Booking id: {detail.technical.bookingId}</div> : null}
                {detail.technical.invoiceId ? <div>Invoice id: {detail.technical.invoiceId}</div> : null}
                {detail.technical.clientId ? <div>Client id: {detail.technical.clientId}</div> : null}
                {detail.technical.userId ? <div>User id: {detail.technical.userId}</div> : null}
                {detail.ipAddress ? <div>IP address: {detail.ipAddress}</div> : null}
              </dl>
            </details>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
