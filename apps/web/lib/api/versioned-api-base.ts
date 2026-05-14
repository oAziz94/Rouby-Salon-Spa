/**
 * If the env base is only an origin (no path), append `/api/v1` to match the API global prefix.
 */
export function ensureVersionedApiBase(trimmed: string): string {
  try {
    const u = new URL(trimmed);
    const path = u.pathname.replace(/\/+$/, "") || "";
    if (!path) {
      return `${trimmed}/api/v1`.replace(/\/+$/, "");
    }
  } catch {
    /* leave as-is */
  }
  return trimmed;
}
