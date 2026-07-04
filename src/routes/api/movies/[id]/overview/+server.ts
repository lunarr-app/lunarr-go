import { requireJsonUser } from "$lib/server/api";
import { apiError, apiJson } from "$lib/server/api/json";
import type { MovieOverviewResponse } from "$lib/server/api/types";
import { getMovieOverview } from "$lib/server/media/movies";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const overview = await getMovieOverview(params.id, user.id);
  if (!overview) return apiError("Movie not found.", 404);

  return apiJson<MovieOverviewResponse>(overview);
};
