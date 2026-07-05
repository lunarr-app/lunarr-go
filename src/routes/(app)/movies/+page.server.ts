import { normalizeMovieSort, normalizeMovieStatusFilter } from "$lib/server/media/catalog";
import { movieRows } from "$lib/server/media/movies/browse";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const sort = normalizeMovieSort(url.searchParams.get("sort"));
  const status = normalizeMovieStatusFilter(url.searchParams.get("status"));
  const query = url.searchParams.get("q") ?? "";
  const rows = await movieRows(locals.user!.id, query, status, sort);

  return {
    rows,
    query,
    status,
    sort,
  };
};
