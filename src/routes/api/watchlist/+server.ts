import { apiError, apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { ApiOkResponse } from "$lib/server/api/types";
import { parseBody, requireJsonUser } from "$lib/server/api";
import { toggleWatchlist, getWatchlistMovies, getWatchlistShows } from "$lib/server/media/watchlist";
import { FULL_LIBRARY_PAGE_SIZE, normalizeLimit, normalizePage } from "$lib/server/media/catalog";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const toggleSchema = z.object({
  mediaItemId: z.string().min(1, "Media item is required."),
});

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const page = normalizePage(url.searchParams.get("page"));
    const limit = normalizeLimit(url.searchParams.get("limit"), FULL_LIBRARY_PAGE_SIZE);

    const [movieResult, showResult] = await Promise.all([
      getWatchlistMovies(user.id, page, limit),
      getWatchlistShows(user.id, page, limit),
    ]);

    return apiJson({
      movies: movieResult.movies,
      moviesPage: movieResult.pageInfo,
      shows: showResult.shows,
      showsPage: showResult.pageInfo,
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not load watchlist.", 500);
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const body = await parseBody(request, toggleSchema);
    if (!body.mediaItemId) return apiError("Media item is required.");

    const inWatchlist = await toggleWatchlist(user.id, body.mediaItemId);
    return apiJson<ApiOkResponse & { inWatchlist: boolean }>({ ok: true, inWatchlist });
  } catch (error) {
    return apiErrorFrom(error, "Could not update watchlist.");
  }
};
