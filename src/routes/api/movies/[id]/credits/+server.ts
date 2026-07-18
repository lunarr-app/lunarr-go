import { apiErrorFrom, requireJsonUser } from "$lib/server/api";
import { apiError, apiJson } from "$lib/server/api/json";
import type { MovieCreditsResponse } from "$lib/server/api/types";
import { getMovieCredits } from "$lib/server/media/movies/detail";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const credits = await getMovieCredits(params.id, user.id);
    if (!credits) return apiError("Movie not found.", 404);

    return apiJson<MovieCreditsResponse>(credits);
  } catch (error) {
    return apiErrorFrom(error, "Could not load movie credits.", 500);
  }
};
