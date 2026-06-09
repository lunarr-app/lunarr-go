import { movieListRows, normalizeMoviePage, normalizeMovieSort, normalizeMovieStatusFilter } from "$lib/server/media";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const sort = normalizeMovieSort(url.searchParams.get("sort"));
  const status = normalizeMovieStatusFilter(url.searchParams.get("status"));
  const page = normalizeMoviePage(url.searchParams.get("page"));
  const query = url.searchParams.get("q") ?? "";
  const rows = await movieListRows(locals.user!.id, query, status, sort, page);

  return {
    movies: rows.movies,
    pageInfo: rows.page,
    query,
    status,
    sort
  };
};
