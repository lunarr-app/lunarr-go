import { apiError, apiErrorFrom, apiJson } from "#lib/server/api/json.js";
import type { ApiOkResponse } from "#lib/server/api/types.js";
import { parseBody, requireJsonUser } from "#lib/server/api.js";
import { markSeasonWatched } from "#lib/server/playback/commands.js";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const seasonWatchedSchema = z.object({
  completed: z.boolean().optional(),
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const body = await parseBody(request, seasonWatchedSchema);
    const completed = body.completed === true;
    await markSeasonWatched({
      userId: user.id,
      showId: params.id,
      seasonId: params.seasonId,
      completed,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Show not found." || error.message === "Season not found.")) {
      return apiError(error.message, 404);
    }
    return apiErrorFrom(error, "Could not update season watched status.");
  }

  return apiJson<ApiOkResponse>({ ok: true });
};
