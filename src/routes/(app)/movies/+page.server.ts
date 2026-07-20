import {
  normalizeMovieSort,
  normalizeMovieStatusFilter,
  normalizePage,
  FULL_LIBRARY_PAGE_SIZE,
} from "$lib/server/media/catalog";
import { movieRows } from "$lib/server/media/movies/browse";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const sort = normalizeMovieSort(url.searchParams.get("sort"), "recent");
  const status = normalizeMovieStatusFilter(url.searchParams.get("status"));
  const page = normalizePage(url.searchParams.get("page"));
  const query = url.searchParams.get("q") ?? "";
  const rows = await movieRows(locals.user!.id, query, status, sort, page, FULL_LIBRARY_PAGE_SIZE);

  return {
    movies: rows.all,
    pageInfo: rows.allPage,
    query,
    status,
    sort,
  };
};
