import { FULL_LIBRARY_PAGE_SIZE, normalizeLimit, normalizePage } from "$lib/server/media/catalog";
import { listBecauseYouWatchedShows } from "$lib/server/media/shows/discover";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const page = normalizePage(url.searchParams.get("page"));
  const limit = normalizeLimit(url.searchParams.get("limit"), FULL_LIBRARY_PAGE_SIZE);
  const rows = await listBecauseYouWatchedShows(locals.user!.id, page, limit);

  return {
    shows: rows.shows,
    pageInfo: rows.page,
  };
};
