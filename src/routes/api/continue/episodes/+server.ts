import { BROWSE_RAIL_LIMIT, normalizeLimit, normalizePage } from "$lib/server/media/catalog";
import { apiErrorFrom, requireJsonUser } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import { continueEpisodeRows, nextUpEpisodeRows } from "$lib/server/media/shows/episodes";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const page = normalizePage(url.searchParams.get("page"));
    const limit = normalizeLimit(url.searchParams.get("limit"), BROWSE_RAIL_LIMIT);

    const [continueResult, nextUpResult] = await Promise.all([
      continueEpisodeRows(user.id, page, limit),
      nextUpEpisodeRows(user.id, page, limit),
    ]);

    return apiJson({
      episodes: continueResult.continueWatching,
      episodesPage: continueResult.continueWatchingPage,
      nextUp: nextUpResult.nextUp,
      nextUpPage: nextUpResult.nextUpPage,
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not load continue watching episodes.");
  }
};
