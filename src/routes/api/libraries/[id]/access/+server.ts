import { apiErrorFrom, readJsonBody, requireJsonAdmin } from "$lib/server/api";
import { updateLibraryAccess } from "$lib/server/libraries";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    const input = typeof body === "object" && body ? (body as Record<string, unknown>) : {};
    const userIds = Array.isArray(input.userIds) ? input.userIds.map((id) => String(id)) : [];
    await updateLibraryAccess(params.id, String(input.accessMode ?? "all"), userIds);
    return json({ ok: true });
  } catch (error) {
    return apiErrorFrom(error, "Could not update library sharing.");
  }
};
