import { FULL_LIBRARY_PAGE_SIZE, normalizePage } from "$lib/server/media/catalog";
import { getWatchlistMovies } from "$lib/server/media/watchlist";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const page = normalizePage(url.searchParams.get("page"));
  const result = await getWatchlistMovies(locals.user!.id, page, FULL_LIBRARY_PAGE_SIZE);

  return {
    movies: result.movies,
    pageInfo: result.pageInfo,
  };
};
