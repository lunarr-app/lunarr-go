import { requireJsonUser } from "$lib/server/api";
import { apiError, apiJson } from "$lib/server/api/json";
import type { MovieFullResponse } from "$lib/server/api/types";
import { getMovieDetail } from "$lib/server/media/movies";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const detail = await getMovieDetail(params.id, user.id);
  if (!detail) return apiError("Movie not found.", 404);

  return apiJson<MovieFullResponse>(detail);
};
