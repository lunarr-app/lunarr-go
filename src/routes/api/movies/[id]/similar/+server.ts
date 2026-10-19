import { apiErrorFrom, requireJsonUser } from "#lib/server/api.js";
import { apiError, apiJson } from "#lib/server/api/json.js";
import type { SimilarMoviesResponse } from "#lib/server/api/types.js";
import { MOVIE_PAGE_SIZE, normalizeLimit, normalizePage } from "#lib/server/media/catalog.js";
import { loadSimilarMovies } from "#lib/server/media/similar-page-load.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const page = normalizePage(url.searchParams.get("page"));
    const limit = normalizeLimit(url.searchParams.get("limit"), MOVIE_PAGE_SIZE);
    const result = await loadSimilarMovies(params.id, user.id, page, limit);
    if (!result) return apiError("Movie not found.", 404);

    return apiJson<SimilarMoviesResponse>(result);
  } catch (error) {
    return apiErrorFrom(error, "Could not load similar movies.", 500);
  }
};
