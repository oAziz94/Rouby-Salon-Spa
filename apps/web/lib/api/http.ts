import { ensureVersionedApiBase } from "./versioned-api-base";

export type ApiErrorShape = {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  code?: string;
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

function resolveApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL;
  const fallback =
    process.env.NODE_ENV === "production"
      ? ""
      : "http://localhost:4000/api/v1";
  const base = ensureVersionedApiBase((raw ?? fallback).replace(/\/$/, ""));
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_URL (or API_URL) must be set in production.",
    );
  }
  return base;
}

function shouldSkipApiFetchDuringBuild(baseUrl: string): boolean {
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  const isLocalApi = /localhost|127\.0\.0\.1/i.test(baseUrl);
  return isBuildPhase && isLocalApi;
}

export type GetJsonOptions = {
  /**
   * Skip Next.js Data Cache for this request (e.g. staff toggled catalog visibility).
   * Default uses `revalidate: 60` for general public catalog reads.
   */
  noStore?: boolean;
};

export async function getJson<T>(path: string, options?: GetJsonOptions): Promise<T> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = resolveApiBaseUrl();
  if (shouldSkipApiFetchDuringBuild(baseUrl)) {
    throw new ApiRequestError(
      "API is unavailable during build. Start the API service or set NEXT_PUBLIC_API_URL to a reachable endpoint.",
      503,
      "API_UNREACHABLE_DURING_BUILD",
    );
  }

  const fetchInit: RequestInit = {
    method: "GET",
    headers: { Accept: "application/json" },
    ...(options?.noStore ? { cache: "no-store" } : { next: { revalidate: 60 } }),
  };

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${normalized}`, fetchInit);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Network request failed while contacting API.";
    throw new ApiRequestError(message, 503, "API_UNREACHABLE");
  }

  if (!res.ok) {
    let body: ApiErrorShape | null = null;
    try {
      body = (await res.json()) as ApiErrorShape;
    } catch {
      body = null;
    }

    const messageFromBody = body?.message;
    const message =
      Array.isArray(messageFromBody)
        ? messageFromBody.join(", ")
        : typeof messageFromBody === "string"
          ? messageFromBody
          : `Request failed (${res.status})`;

    throw new ApiRequestError(message, res.status, body?.code);
  }

  return (await res.json()) as T;
}
