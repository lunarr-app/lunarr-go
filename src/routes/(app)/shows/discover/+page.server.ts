import { normalizePage } from "$lib/server/media/catalog";
import { listBecauseYouWatchedShows } from "$lib/server/media/shows";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const page = normalizePage(url.searchParams.get("page"));
  const rows = await listBecauseYouWatchedShows(locals.user!.id, page);

  return {
    shows: rows.shows,
    pageInfo: rows.page,
  };
};
