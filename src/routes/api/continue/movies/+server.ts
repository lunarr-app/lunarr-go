import { BROWSE_RAIL_LIMIT, normalizeLimit, normalizePage } from "$lib/server/media/catalog";
import { apiErrorFrom, requireJsonUser } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import { continueMovieRows } from "$lib/server/media/movies/browse";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const page = normalizePage(url.searchParams.get("page"));
    const limit = normalizeLimit(url.searchParams.get("limit"), BROWSE_RAIL_LIMIT);

    const result = await continueMovieRows(user.id, page, limit);

    return apiJson({
      movies: result.continueWatching,
      pageInfo: result.continueWatchingPage,
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not load continue watching movies.");
  }
};
