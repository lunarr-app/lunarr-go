import { BROWSE_RAIL_LIMIT, normalizeLimit, normalizePage } from "$lib/server/media/catalog";
import { requireJsonUser } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import type { ContinueWatchingResponse } from "$lib/server/api/types";
import { continueMovieRows } from "$lib/server/media/movies/browse";
import { continueTvRows } from "$lib/server/media/shows/episodes";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

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
};
