import { getClientToken } from "@/lib/auth/client-session";

type ApiErrorShape = {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  code?: string;
};

export class ClientApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.code = code;
  }
}

function resolveApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").replace(
    /\/$/,
    "",
  );
}

async function parseError(res: Response): Promise<ClientApiError> {
  let body: ApiErrorShape | null = null;
  try {
    body = (await res.json()) as ApiErrorShape;
  } catch {
    body = null;
  }

  const message =
    body?.message && Array.isArray(body.message)
      ? body.message.join(", ")
      : typeof body?.message === "string"
        ? body.message
        : `Request failed (${res.status})`;
  return new ClientApiError(message, res.status, body?.code);
}

export async function getClientJson<T>(path: string): Promise<T> {
  const token = getClientToken();
  const res = await fetch(`${resolveApiBaseUrl()}${path}`, {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as T;
}

export async function postClientJson<T>(path: string, body?: unknown): Promise<T> {
  const token = getClientToken();
  const res = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as T;
}

export async function postPublicJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as T;
}
