import { movieRows, normalizeMovieSort, normalizeMovieStatusFilter, normalizePage } from "$lib/server/media";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const sort = normalizeMovieSort(url.searchParams.get("sort"));
  const status = normalizeMovieStatusFilter(url.searchParams.get("status"));
  const page = normalizePage(url.searchParams.get("page"));
  const query = url.searchParams.get("q") ?? "";
  const rows = await movieRows(locals.user!.id, query, status, sort, page);

  return {
    movies: rows.all,
    pageInfo: rows.allPage,
    query,
    status,
    sort,
  };
};
