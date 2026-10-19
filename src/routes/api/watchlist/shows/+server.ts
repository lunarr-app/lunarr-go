import { apiErrorFrom, apiJson } from "#lib/server/api/json.js";
import { requireJsonUser } from "#lib/server/api.js";
import { getWatchlistShows } from "#lib/server/media/watchlist.js";
import { FULL_LIBRARY_PAGE_SIZE, normalizeLimit, normalizePage } from "#lib/server/media/catalog.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const page = normalizePage(url.searchParams.get("page"));
    const limit = normalizeLimit(url.searchParams.get("limit"), FULL_LIBRARY_PAGE_SIZE);

    const result = await getWatchlistShows(user.id, page, limit);

    return apiJson({
      shows: result.shows,
      pageInfo: result.pageInfo,
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not load watchlist shows.", 500);
  }
};
