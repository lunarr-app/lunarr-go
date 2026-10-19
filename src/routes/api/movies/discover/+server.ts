import { apiErrorFrom, requireJsonUser } from "#lib/server/api.js";
import { apiJson } from "#lib/server/api/json.js";
import type { DiscoverMoviesResponse } from "#lib/server/api/types.js";
import { MOVIE_PAGE_SIZE, normalizeLimit, normalizePage } from "#lib/server/media/catalog.js";
import { listBecauseYouWatchedMovies } from "#lib/server/media/movies/discover.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const page = normalizePage(url.searchParams.get("page"));
    const limit = normalizeLimit(url.searchParams.get("limit"), MOVIE_PAGE_SIZE);
    return apiJson<DiscoverMoviesResponse>(await listBecauseYouWatchedMovies(user.id, page, limit));
  } catch (error) {
    return apiErrorFrom(error, "Could not load movie recommendations.", 500);
  }
};
