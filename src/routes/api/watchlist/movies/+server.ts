import { apiErrorFrom, apiJson } from "$lib/server/api/json";
import { requireJsonUser } from "$lib/server/api";
import { getWatchlistMovies } from "$lib/server/media/watchlist";
import { FULL_LIBRARY_PAGE_SIZE, normalizeLimit, normalizePage } from "$lib/server/media/catalog";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const page = normalizePage(url.searchParams.get("page"));
    const limit = normalizeLimit(url.searchParams.get("limit"), FULL_LIBRARY_PAGE_SIZE);

    const result = await getWatchlistMovies(user.id, page, limit);

    return apiJson({
      movies: result.movies,
      pageInfo: result.pageInfo,
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not load watchlist movies.");
  }
};
