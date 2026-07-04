import {
  MOVIE_PAGE_SIZE,
  normalizeMovieSort,
  normalizeMovieStatusFilter,
  normalizePage,
  parseMovieBrowseRails,
} from "$lib/server/media/catalog";
import { movieRows } from "$lib/server/media/movies";
import { jsonError, requireJsonUser } from "$lib/server/api";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const rails = parseMovieBrowseRails(url.searchParams.get("rail"));
  if (rails === null) {
    return jsonError(null, "Invalid rail. Expected one of: continueWatching, all, recent, latest, popular.");
  }

  const search = url.searchParams.get("search") ?? "";
  const status = normalizeMovieStatusFilter(url.searchParams.get("status"));
  const sort = normalizeMovieSort(url.searchParams.get("sort"));
  const page = normalizePage(url.searchParams.get("page"));

  if (rails && rails.length > 0) {
    return json(await movieRows(user.id, search, status, sort, page, MOVIE_PAGE_SIZE, rails));
  }

  return json(await movieRows(user.id, search, status, sort, page));
};
