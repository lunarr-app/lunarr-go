import { normalizePage, normalizeShowSort } from "$lib/server/media/catalog";
import { tvRows } from "$lib/server/media/shows";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const sort = normalizeShowSort(url.searchParams.get("sort"));
  const page = normalizePage(url.searchParams.get("page"));
  const query = url.searchParams.get("q") ?? "";
  const rows = await tvRows(locals.user!.id, query, sort, page);

  return {
    rows,
    query,
    sort,
    page: rows.allPage.page,
  };
};
