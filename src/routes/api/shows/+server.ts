import { SHOW_PAGE_SIZE, normalizePage, normalizeShowSort, parseShowBrowseRails } from "$lib/server/media/catalog";
import { tvRows } from "$lib/server/media/shows";
import { jsonError, requireJsonUser } from "$lib/server/api";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const rails = parseShowBrowseRails(url.searchParams.get("rail"));
  if (rails === null) {
    return jsonError(null, "Invalid rail. Expected one of: continueWatching, nextUp, all, recent, latest, popular.");
  }

  const search = url.searchParams.get("search") ?? "";
  const sort = normalizeShowSort(url.searchParams.get("sort"));
  const page = normalizePage(url.searchParams.get("page"));

  if (rails && rails.length > 0) {
    return json(await tvRows(user.id, search, sort, page, SHOW_PAGE_SIZE, rails));
  }

  return json(await tvRows(user.id, search, sort, page));
};
