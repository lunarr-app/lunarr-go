import { apiErrorFrom, requireJsonUser } from "$lib/server/api";
import { apiError, apiJson } from "$lib/server/api/json";
import type { MovieOverviewResponse } from "$lib/server/api/types";
import { getMovieOverview } from "$lib/server/media/movies/detail";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const overview = await getMovieOverview(params.id, user.id);
    if (!overview) return apiError("Movie not found.", 404);

    return apiJson<MovieOverviewResponse>(overview);
  } catch (error) {
    return apiErrorFrom(error, "Could not load movie overview.", 500);
  }
};
