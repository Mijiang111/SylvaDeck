export const API_BASE = import.meta.env.VITE_API_BASE?.trim() || "/api";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function formatApiErrorMessage(status: number, body: unknown) {
  if (typeof body === "string") {
    return body || `Request failed: ${status}`;
  }

  const candidate = body as
    | {
        error?: string;
        reason?: string;
        details?: Array<{ path?: unknown[]; message?: string }>;
      }
    | null;

  if (candidate?.details?.length) {
    const first = candidate.details[0];
    const pathLabel =
      Array.isArray(first?.path) && first.path.length > 0
        ? first.path.join(".")
        : "request";
    return `${candidate.error ?? candidate.reason ?? "Invalid request payload"}: ${pathLabel} ${first?.message ?? ""}`.trim();
  }

  return candidate?.error ?? candidate?.reason ?? `Request failed: ${status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? undefined);
  const body = init?.body;
  if (!(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new ApiError(
      formatApiErrorMessage(res.status, errorBody),
      res.status,
      errorBody,
    );
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "PUT", body: JSON.stringify(body) }),
  postForm: <T>(path: string, body: FormData) =>
    request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: "DELETE" }),
};
