import { requireJsonUser } from "$lib/server/api";
import { apiError, apiJson } from "$lib/server/api/json";
import type { MovieCreditsResponse } from "$lib/server/api/types";
import { getMovieCredits } from "$lib/server/media/movies";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const credits = await getMovieCredits(params.id, user.id);
  if (!credits) return apiError("Movie not found.", 404);

  return apiJson<MovieCreditsResponse>(credits);
};
