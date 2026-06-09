import { normalizeShowSort, tvRows } from "$lib/server/media";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const query = url.searchParams.get("q") ?? "";
  const sort = normalizeShowSort(url.searchParams.get("sort"));

  return {
    rows: await tvRows(locals.user!.id, query, sort),
    query,
    sort
  };
};
