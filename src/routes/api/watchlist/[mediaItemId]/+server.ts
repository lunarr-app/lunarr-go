import { apiErrorFrom } from "$lib/server/api/json";
import { requireJsonUser } from "$lib/server/api";
import { removeFromWatchlist } from "$lib/server/media/watchlist";
import type { RequestHandler } from "./$types";

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
