import { apiError } from "./api/json";

export { apiError, apiErrorFrom } from "./api/json";

export function requireJsonUser(locals: App.Locals) {
  if (!locals.user) return apiError("Unauthorized", 401);
  return locals.user;
}

export function requireJsonAdmin(locals: App.Locals) {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;
  if (user.role !== "admin") {
    return apiError("Admin access required", 403);
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

export function booleanFromJson(value: unknown) {
  return value === true || value === "true";
}
