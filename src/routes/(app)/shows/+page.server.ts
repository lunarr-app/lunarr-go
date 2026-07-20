import { normalizePage, normalizeShowSort, FULL_LIBRARY_PAGE_SIZE } from "$lib/server/media/catalog";
import { showBrowseRows } from "$lib/server/media/shows/browse";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const sort = normalizeShowSort(url.searchParams.get("sort"));
  const page = normalizePage(url.searchParams.get("page"));
  const query = url.searchParams.get("q") ?? "";
  const rows = await showBrowseRows(locals.user!.id, query, sort, page, FULL_LIBRARY_PAGE_SIZE);

  return {
    shows: rows.all,
    pageInfo: rows.allPage,
    query,
    sort,
  };
};
