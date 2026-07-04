import { requireJsonUser } from "$lib/server/api";
import { apiError, apiJson } from "$lib/server/api/json";
import type { EpisodeDetailResponse } from "$lib/server/api/types";
import { getEpisodeDetail } from "$lib/server/media/shows";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const detail = await getEpisodeDetail(params.id, user.id);
  if (!detail) return apiError("Episode not found.", 404);

  return apiJson<EpisodeDetailResponse>(detail);
};
