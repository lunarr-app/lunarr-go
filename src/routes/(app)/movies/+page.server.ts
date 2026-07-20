import { FULL_LIBRARY_PAGE_SIZE, MOVIE_PAGE_SIZE, normalizePage } from "$lib/server/media/catalog";
import { movieRows } from "$lib/server/media/movies/browse";
import type { MovieRowsResponse } from "$lib/server/api/types";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const query = (url.searchParams.get("q") ?? "").trim();

  if (query) {
    const page = normalizePage(url.searchParams.get("page"));
    const rows = await movieRows(locals.user!.id, query, "all", "title", page, FULL_LIBRARY_PAGE_SIZE);
    return {
      query,
      rails: null,
      results: rows.all,
      pageInfo: rows.allPage,
    };
  }

  const rails = await movieRows(locals.user!.id, "", "all", "title", 1, MOVIE_PAGE_SIZE, [
    "recent",
    "latest",
    "popular",
  ]);
  return {
    query: "",
    rails: rails as MovieRowsResponse,
    results: [],
    pageInfo: null,
  };
};
