import { apiErrorFrom, requireJsonUser } from "#lib/server/api.js";
import { apiJson } from "#lib/server/api/json.js";
import type { DiscoverShowsResponse } from "#lib/server/api/types.js";
import { SHOW_PAGE_SIZE, normalizeLimit, normalizePage } from "#lib/server/media/catalog.js";
import { listBecauseYouWatchedShows } from "#lib/server/media/shows/discover.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const page = normalizePage(url.searchParams.get("page"));
    const limit = normalizeLimit(url.searchParams.get("limit"), SHOW_PAGE_SIZE);
    return apiJson<DiscoverShowsResponse>(await listBecauseYouWatchedShows(user.id, page, limit));
  } catch (error) {
    return apiErrorFrom(error, "Could not load show recommendations.", 500);
  }
};
