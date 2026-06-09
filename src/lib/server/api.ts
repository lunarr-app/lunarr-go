import { json } from "@sveltejs/kit";

export function requireJsonUser(locals: App.Locals) {
  if (!locals.user) return json({ error: "Unauthorized" }, { status: 401 });
  return locals.user;
}

export function requireJsonAdmin(locals: App.Locals) {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;
  if (user.role !== "admin") return json({ error: "Admin access required" }, { status: 403 });
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
  return json(
    { error: error instanceof Error ? error.message : fallback },
    { status }
  );
}

export function booleanFromJson(value: unknown) {
  return value === true || value === "true";
}
