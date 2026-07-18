import { FULL_LIBRARY_PAGE_SIZE, normalizePage } from "$lib/server/media/catalog";
import { getWatchlistShows } from "$lib/server/media/watchlist";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const page = normalizePage(url.searchParams.get("page"));
  const result = await getWatchlistShows(locals.user!.id, page, FULL_LIBRARY_PAGE_SIZE);

  return {
    shows: result.shows,
    pageInfo: result.pageInfo,
  };
};
