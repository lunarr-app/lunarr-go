import { json } from "@sveltejs/kit";
import type { ApiErrorResponse } from "./types";

export function apiJson<T>(body: T, init?: ResponseInit) {
  return json(body, init);
}

export function apiError(message: string, status = 400) {
  return json({ error: message } satisfies ApiErrorResponse, { status });
}
