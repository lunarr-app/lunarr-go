import { apiErrorFrom, requireJsonUser } from "#lib/server/api.js";
import { apiError, apiJson } from "#lib/server/api/json.js";
import type { EpisodeDetailResponse } from "#lib/server/api/types.js";
import { getEpisodeDetail } from "#lib/server/media/shows/detail.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const detail = await getEpisodeDetail(params.id, user.id);
    if (!detail) return apiError("Episode not found.", 404);

    return apiJson<EpisodeDetailResponse>(detail);
  } catch (error) {
    return apiErrorFrom(error, "Could not load episode.", 500);
  }
};
