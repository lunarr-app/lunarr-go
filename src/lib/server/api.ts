import { json } from "@sveltejs/kit";
import type { ApiErrorResponse } from "./api/types";

export function requireJsonUser(locals: App.Locals) {
  if (!locals.user) return json({ error: "Unauthorized" } satisfies ApiErrorResponse, { status: 401 });
  return locals.user;
}

export function requireJsonAdmin(locals: App.Locals) {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;
  if (user.role !== "admin") {
    return json({ error: "Admin access required" } satisfies ApiErrorResponse, { status: 403 });
  }
  return user;
}

export async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export function jsonError(error: unknown, fallback: string, status = 400) {
  const message = error instanceof Error ? error.message : fallback;
  return json({ error: message } satisfies ApiErrorResponse, { status });
}

export function booleanFromJson(value: unknown) {
  return value === true || value === "true";
}
