import { apiError } from "./api/json";
import { z, type ZodType } from "zod";

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

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const body = await readJsonBody(request);
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join(", ");
    throw new Error(message || "Invalid request body.");
  }
  return result.data;
}

export const recordObjectSchema = z.record(z.string(), z.unknown());
