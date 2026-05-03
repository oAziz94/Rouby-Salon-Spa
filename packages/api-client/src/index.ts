/**
 * Base URL for the HTTP API under `/api/v1` (no trailing slash).
 * In Next.js, set `NEXT_PUBLIC_API_URL`. On the server, `API_URL` may be used instead.
 */
export function getApiBaseUrl(): string {
  const raw =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL)
      : undefined;
  const base = (raw ?? "http://localhost:4000/api/v1").replace(/\/$/, "");
  return base;
}

/**
 * Absolute URL for a resource path under the versioned API root.
 * Examples: `apiUrl("/public/services")`, `apiUrl("public/services")`.
 */
export function apiUrl(resourcePath: string): string {
  const base = getApiBaseUrl();
  let path = resourcePath.trim();
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  if (path.startsWith("/api/v1")) {
    path = path.slice("/api/v1".length) || "/";
  }
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  return `${base}${path}`;
}
