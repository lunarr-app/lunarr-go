import { SHOW_PAGE_SIZE, FULL_LIBRARY_PAGE_SIZE, normalizePage } from "$lib/server/media/catalog";
import { tvRows } from "$lib/server/media/shows/episodes";
import { showBrowseRows } from "$lib/server/media/shows/browse";
import type { ShowRowsResponse } from "$lib/server/api/types";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const query = (url.searchParams.get("q") ?? "").trim();

  if (query) {
    const page = normalizePage(url.searchParams.get("page"));
    const rows = await showBrowseRows(locals.user!.id, query, "title", page, FULL_LIBRARY_PAGE_SIZE);
    return {
      query,
      rails: null,
      results: rows.all,
      pageInfo: rows.allPage,
    };
  }

  const rails = await tvRows(locals.user!.id, "", "title", 1, SHOW_PAGE_SIZE, ["recent", "latest", "popular"]);
  return {
    query: "",
    rails: rails as ShowRowsResponse,
    results: [],
    pageInfo: null,
  };
};
