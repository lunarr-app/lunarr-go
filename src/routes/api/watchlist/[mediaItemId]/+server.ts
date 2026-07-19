import { apiErrorFrom, apiJson } from "$lib/server/api/json";
import { requireJsonUser } from "$lib/server/api";
import { isInWatchlist, removeFromWatchlist } from "$lib/server/media/watchlist";
import type { WatchlistStatusResponse } from "$lib/server/api/types";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    return apiJson<WatchlistStatusResponse>({
      inWatchlist: await isInWatchlist(user.id, params.mediaItemId),
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not check watchlist status.");
  }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    await removeFromWatchlist(user.id, params.mediaItemId);
  } catch (error) {
    return apiErrorFrom(error, "Could not remove from watchlist.");
  }

  return new Response(null, { status: 204 });
};
