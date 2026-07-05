import { requireJsonUser } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import type { DiscoverShowsResponse } from "$lib/server/api/types";
import { SHOW_PAGE_SIZE, normalizeLimit, normalizePage } from "$lib/server/media/catalog";
import { listBecauseYouWatchedShows } from "$lib/server/media/shows/discover";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const page = normalizePage(url.searchParams.get("page"));
  const limit = normalizeLimit(url.searchParams.get("limit"), SHOW_PAGE_SIZE);
  return apiJson<DiscoverShowsResponse>(await listBecauseYouWatchedShows(user.id, page, limit));
};
