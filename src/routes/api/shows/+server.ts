import {
  SHOW_BROWSE_RAILS,
  SHOW_PAGE_SIZE,
  normalizeLimit,
  normalizePage,
  normalizeShowSort,
  parseBrowseRails,
} from "$lib/server/media/catalog";
import { tvRows } from "$lib/server/media/shows/episodes";
import { apiErrorFrom, requireJsonUser } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import type { ShowBrowseRailResponse, ShowRowsResponse } from "$lib/server/api/types";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const rails = parseBrowseRails(url.searchParams.get("rail"), SHOW_BROWSE_RAILS);
  if (rails === null) {
    return apiErrorFrom(null, "Invalid rail. Expected one of: continueWatching, nextUp, all, recent, latest, popular.");
  }

  const search = url.searchParams.get("search") ?? "";
  const sort = normalizeShowSort(url.searchParams.get("sort"));
  const page = normalizePage(url.searchParams.get("page"));
  const limit = normalizeLimit(url.searchParams.get("limit"), SHOW_PAGE_SIZE);

  try {
    if (rails && rails.length > 0) {
      return apiJson<ShowBrowseRailResponse>(await tvRows(user.id, search, sort, page, limit, rails));
    }

    return apiJson<ShowRowsResponse>(await tvRows(user.id, search, sort, page, limit));
  } catch (error) {
    return apiErrorFrom(error, "Could not load shows.", 500);
  }
};
