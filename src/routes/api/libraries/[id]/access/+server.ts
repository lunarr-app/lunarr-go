import { apiErrorFrom } from "$lib/server/api/json";
import { parseBody, requireJsonAdmin } from "$lib/server/api";
import { updateLibraryAccess } from "$lib/server/libraries";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const libraryAccessSchema = z.object({
  accessMode: z.string().trim().default("all"),
  userIds: z.array(z.coerce.string()).default([]),
});

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const input = await parseBody(request, libraryAccessSchema);
    await updateLibraryAccess(params.id, input.accessMode, input.userIds);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorFrom(error, "Could not update library sharing.");
  }
};
