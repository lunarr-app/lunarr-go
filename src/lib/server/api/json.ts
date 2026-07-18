import { json } from "@sveltejs/kit";
import type { ApiErrorResponse } from "./types";

const STATUS_TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  410: "Gone",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

export function statusTitle(status: number): string {
  return STATUS_TITLES[status] ?? (status >= 500 ? "Internal Server Error" : "Error");
}

export function apiJson<T>(body: T, init?: ResponseInit) {
  return json(body, init);
}

export function apiError(detail: string, status = 400) {
  return json(
    {
      type: "about:blank",
      title: statusTitle(status),
      status,
      detail,
    } satisfies ApiErrorResponse,
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

export function apiErrorFrom(error: unknown, fallback: string, status = 400) {
  const detail = error instanceof Error ? error.message : fallback;
  return apiError(detail, status);
}
