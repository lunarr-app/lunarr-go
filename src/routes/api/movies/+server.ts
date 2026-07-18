import {
  MOVIE_PAGE_SIZE,
  normalizeLimit,
  normalizeMovieSort,
  normalizeMovieStatusFilter,
  normalizePage,
  parseMovieBrowseRails,
} from "$lib/server/media/catalog";
import { movieRows } from "$lib/server/media/movies/browse";
import { apiErrorFrom, requireJsonUser } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import type { MovieBrowseRailResponse, MovieRowsResponse } from "$lib/server/api/types";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const rails = parseMovieBrowseRails(url.searchParams.get("rail"));
  if (rails === null) {
    return apiErrorFrom(null, "Invalid rail. Expected one of: continueWatching, all, recent, latest, popular.");
  }

  const search = url.searchParams.get("search") ?? "";
  const status = normalizeMovieStatusFilter(url.searchParams.get("status"));
  const sort = normalizeMovieSort(url.searchParams.get("sort"));
  const page = normalizePage(url.searchParams.get("page"));
  const limit = normalizeLimit(url.searchParams.get("limit"), MOVIE_PAGE_SIZE);

  try {
    if (rails && rails.length > 0) {
      return apiJson<MovieBrowseRailResponse>(await movieRows(user.id, search, status, sort, page, limit, rails));
    }

    return apiJson<MovieRowsResponse>(await movieRows(user.id, search, status, sort, page, limit));
  } catch (error) {
    return apiErrorFrom(error, "Could not load movies.", 500);
  }
};
