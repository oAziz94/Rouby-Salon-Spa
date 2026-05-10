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
  return (raw ?? "http://localhost:4000/api/v1").replace(/\/$/, "");
}

function shouldSkipApiFetchDuringBuild(baseUrl: string): boolean {
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  const isLocalApi = /localhost|127\.0\.0\.1/i.test(baseUrl);
  return isBuildPhase && isLocalApi;
}

export async function getJson<T>(path: string): Promise<T> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = resolveApiBaseUrl();
  if (shouldSkipApiFetchDuringBuild(baseUrl)) {
    throw new ApiRequestError(
      "API is unavailable during build. Start the API service or set NEXT_PUBLIC_API_URL to a reachable endpoint.",
      503,
      "API_UNREACHABLE_DURING_BUILD",
    );
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${normalized}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
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
