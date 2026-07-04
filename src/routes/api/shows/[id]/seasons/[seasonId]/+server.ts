import { requireJsonUser } from "$lib/server/api";
import { apiError, apiJson } from "$lib/server/api/json";
import type { ShowSeasonDetailResponse } from "$lib/server/api/types";
import { getShowSeasonDetail } from "$lib/server/media/shows";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const detail = await getShowSeasonDetail(params.id, params.seasonId, user.id);
  if (!detail) return apiError("Show or season not found.", 404);

  return apiJson<ShowSeasonDetailResponse>(detail);
};
