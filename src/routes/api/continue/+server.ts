import { BROWSE_RAIL_LIMIT, normalizeLimit, normalizePage } from "#lib/server/media/catalog.js";
import { apiErrorFrom, requireJsonUser } from "#lib/server/api.js";
import { apiJson } from "#lib/server/api/json.js";
import type { ContinueWatchingResponse } from "#lib/server/api/types.js";
import { continueMovieRows } from "#lib/server/media/movies/browse.js";
import { continueTvRows } from "#lib/server/media/shows/episodes.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const page = normalizePage(url.searchParams.get("page"));
    const limit = normalizeLimit(url.searchParams.get("limit"), BROWSE_RAIL_LIMIT);

    const [movieResults, tvResults] = await Promise.all([
      continueMovieRows(user.id, page, limit),
      continueTvRows(user.id, page, limit),
    ]);

    return apiJson<ContinueWatchingResponse>({
      movies: movieResults.continueWatching,
      moviesPage: movieResults.continueWatchingPage,
      episodes: tvResults.continueWatching,
      episodesPage: tvResults.continueWatchingPage,
      nextUp: tvResults.nextUp,
      nextUpPage: tvResults.nextUpPage,
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not load continue watching.", 500);
  }
};
