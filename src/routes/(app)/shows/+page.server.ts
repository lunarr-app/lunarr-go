import { SHOW_PAGE_SIZE } from "$lib/server/media/catalog";
import { tvRows } from "$lib/server/media/shows/episodes";
import type { ShowRowsResponse } from "$lib/server/api/types";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const rows = await tvRows(locals.user!.id, "", "title", 1, SHOW_PAGE_SIZE, [
    "recent",
    "latest",
    "popular",
  ]);
  return { rows: rows as ShowRowsResponse };
};
