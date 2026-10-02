"use client";

import { useCallback, useEffect, useState } from "react";

export type OverrideRequest = {
  message: string;
  resolve: (reason: string | null) => void;
};

/**
 * Hook pairing with <OverrideReasonDialog>. `askOverride(message)` opens the
 * dialog and resolves with the typed reason, or `null` when the user cancels.
 *
 * Usage:
 *   const override = useOverrideReason();
 *   try { await call() } catch (e) {
 *     if (!(e instanceof ApiClientError) || !e.overridable) throw e;
 *     const reason = await override.ask(e.message);
 *     if (!reason) return;
 *     await call({ overrideReason: reason });
 *   }
 *   ...
 *   <OverrideReasonDialog request={override.request} onClose={override.close} />
 */
export function useOverrideReason() {
  const [request, setRequest] = useState<OverrideRequest | null>(null);
  const ask = useCallback(
    (message: string) =>
      new Promise<string | null>((resolve) => {
        setRequest({ message, resolve });
      }),
    [],
  );
  const close = useCallback(() => setRequest(null), []);
  return { request, ask, close };
}

export function OverrideReasonDialog({
  request,
  onClose,
}: {
  request: OverrideRequest | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    setReason("");
  }, [request]);
  if (!request) return null;
  const submit = () => {
    const r = reason.trim();
    if (!r) return;
    request.resolve(r);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <p className="text-base font-semibold text-[#1F2420]">Proceed anyway?</p>
        <p className="mt-2 text-sm leading-relaxed text-[#5E574C]">{request.message}</p>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[#7A6A58]">
          Reason (recorded in the audit log)
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="e.g. stylist agreed to stay late"
            className="mt-1 w-full rounded-xl border border-[#E8E0D4] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#1F2420]"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              request.resolve(null);
              onClose();
            }}
            className="rounded-xl border border-[#D8CBB8] bg-white px-4 py-2 text-sm font-semibold text-[#1F2420]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!reason.trim()}
            onClick={submit}
            className="rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] disabled:opacity-50"
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}
