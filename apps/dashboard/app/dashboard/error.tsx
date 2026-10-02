"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Last line of defence for the dashboard: a render/runtime crash shows this card with a
 * retry instead of a blank screen. Expected API failures are handled inside each page.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard crashed:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#E7B9A4]/70 bg-white p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-8 w-8 text-[#8B4428]" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-[#1F2420]">Something went wrong on this screen</h1>
        <p className="mt-2 text-sm text-[#5E574C]">
          Your work is saved on the server. Try again, or go back to the queue.
          {error.digest ? (
            <span className="mt-1 block text-xs text-[#9A8B7A]">Reference {error.digest}</span>
          ) : null}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#062A2D] px-4 py-2 text-sm font-semibold text-[#F6F2EA] hover:bg-[#0A3F35]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </button>
          <Link
            href="/dashboard/queue"
            className="rounded-xl border border-[#D8CBB8] bg-white px-4 py-2 text-sm font-semibold text-[#1F2420]"
          >
            Go to queue
          </Link>
        </div>
      </div>
    </div>
  );
}
