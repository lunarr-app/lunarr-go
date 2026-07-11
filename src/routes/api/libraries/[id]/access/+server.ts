import { apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { ApiOkResponse } from "$lib/server/api/types";
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
    return apiJson<ApiOkResponse>({ ok: true });
  } catch (error) {
    return apiErrorFrom(error, "Could not update library sharing.");
  }
};
