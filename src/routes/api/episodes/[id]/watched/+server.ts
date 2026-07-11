import { apiError, apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { ApiOkResponse } from "$lib/server/api/types";
import { parseBody, requireJsonUser } from "$lib/server/api";
import { markWatched } from "$lib/server/playback";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const watchedSchema = z.object({
  mediaFileId: z.coerce.string().min(1, "File is required."),
  completed: z.boolean().optional(),
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const body = await parseBody(request, watchedSchema);
    if (!body.mediaFileId) return apiError("File is required.");

    await markWatched({
      userId: user.id,
      mediaItemId: params.id,
      mediaFileId: body.mediaFileId,
      completed: body.completed === true,
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not update watched status.");
  }

  return apiJson<ApiOkResponse>({ ok: true });
};
