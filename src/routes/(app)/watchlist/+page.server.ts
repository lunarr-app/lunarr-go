import { normalizePage, FULL_LIBRARY_PAGE_SIZE } from "$lib/server/media/catalog";
import { getWatchlistMovies, getWatchlistShows } from "$lib/server/media/watchlist";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const page = normalizePage(url.searchParams.get("page"));

  const [movieResult, showResult] = await Promise.all([
    getWatchlistMovies(locals.user!.id, page, FULL_LIBRARY_PAGE_SIZE),
    getWatchlistShows(locals.user!.id, page, FULL_LIBRARY_PAGE_SIZE),
  ]);

  return {
    movies: movieResult.movies,
    moviesPage: movieResult.pageInfo,
    shows: showResult.shows,
    showsPage: showResult.pageInfo,
  };
};
