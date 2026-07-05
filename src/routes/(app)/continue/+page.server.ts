import { BROWSE_RAIL_LIMIT, normalizePage } from "$lib/server/media/catalog";
import { continueMovieRows } from "$lib/server/media/movies/browse";
import { continueTvRows } from "$lib/server/media/shows/episodes";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const page = normalizePage(url.searchParams.get("page"));
  const [movieResults, tvResults] = await Promise.all([
    continueMovieRows(locals.user!.id, page, BROWSE_RAIL_LIMIT),
    continueTvRows(locals.user!.id, page, BROWSE_RAIL_LIMIT),
  ]);

  return {
    movies: movieResults.continueWatching,
    moviesPage: movieResults.continueWatchingPage,
    episodes: tvResults.continueWatching,
    episodesPage: tvResults.continueWatchingPage,
    nextUp: tvResults.nextUp,
    nextUpPage: tvResults.nextUpPage,
    page,
  };
};
