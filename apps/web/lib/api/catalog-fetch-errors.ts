import { ApiRequestError } from "@/lib/api/http";

/**
 * Turns failed public-catalog fetches into copy suitable for the booking UI.
 */
export function formatPublicCatalogError(reason: unknown): string | null {
  if (reason == null) {
    return null;
  }
  if (reason instanceof ApiRequestError) {
    if (
      reason.code === "API_UNREACHABLE" ||
      reason.code === "API_UNREACHABLE_DURING_BUILD"
    ) {
      return "We could not reach the salon system. For local development, start the API on port 4000 and set NEXT_PUBLIC_API_URL (and optionally API_URL for server fetches) to your API base, e.g. http://localhost:4000/api/v1.";
    }
    return reason.message;
  }
  if (reason instanceof Error) {
    const m = reason.message.toLowerCase();
    if (
      m.includes("fetch failed") ||
      m.includes("econnrefused") ||
      m.includes("enotfound") ||
      m.includes("network") ||
      m.includes("socket")
    ) {
      return "We could not reach the salon system. Confirm the API is running and that NEXT_PUBLIC_API_URL (browser + server) points to the correct /api/v1 base URL.";
    }
    return reason.message;
  }
  return String(reason);
}
