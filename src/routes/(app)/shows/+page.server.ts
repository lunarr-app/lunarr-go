import { normalizeShowSort } from "$lib/server/media/catalog";
import { tvRows } from "$lib/server/media/shows/episodes";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const sort = normalizeShowSort(url.searchParams.get("sort"));
  const query = url.searchParams.get("q") ?? "";
  const rows = await tvRows(locals.user!.id, query, sort);

  return {
    rows,
    query,
    sort,
  };
};
