import { apiErrorFrom, requireJsonUser } from "#lib/server/api.js";
import { apiError, apiJson } from "#lib/server/api/json.js";
import type { ShowCreditsResponse } from "#lib/server/api/types.js";
import { getShowCredits } from "#lib/server/media/shows/detail.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const credits = await getShowCredits(params.id, user.id);
    if (!credits) return apiError("Show not found.", 404);

    return apiJson<ShowCreditsResponse>(credits);
  } catch (error) {
    return apiErrorFrom(error, "Could not load show credits.", 500);
  }
};
