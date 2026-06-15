import { normalizePage, normalizeShowSort, showListRows } from "$lib/server/media";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const sort = normalizeShowSort(url.searchParams.get("sort"));
  const page = normalizePage(url.searchParams.get("page"));
  const query = url.searchParams.get("q") ?? "";
  const rows = await showListRows(locals.user!.id, query, sort, page);

  return {
    shows: rows.shows,
    pageInfo: rows.page,
    query,
    sort,
  };
};
