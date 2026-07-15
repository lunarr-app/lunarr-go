import { MOVIE_PAGE_SIZE } from "$lib/server/media/catalog";
import { movieRows } from "$lib/server/media/movies/browse";
import type { MovieRowsResponse } from "$lib/server/api/types";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const rows = await movieRows(locals.user!.id, "", "all", "title", 1, MOVIE_PAGE_SIZE, [
    "continueWatching",
    "recent",
    "latest",
    "popular",
  ]);
  return { rows: rows as MovieRowsResponse };
};
