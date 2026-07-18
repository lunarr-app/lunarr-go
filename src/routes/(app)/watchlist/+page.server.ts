import { normalizePage, BROWSE_RAIL_LIMIT } from "$lib/server/media/catalog";
import { getWatchlistMovies, getWatchlistShows } from "$lib/server/media/watchlist";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const page = normalizePage(url.searchParams.get("page"));

  const [movieResult, showResult] = await Promise.all([
    getWatchlistMovies(locals.user!.id, page, BROWSE_RAIL_LIMIT),
    getWatchlistShows(locals.user!.id, page, BROWSE_RAIL_LIMIT),
  ]);

  return {
    movies: movieResult.movies,
    moviesPage: movieResult.pageInfo,
    shows: showResult.shows,
    showsPage: showResult.pageInfo,
  };
};
