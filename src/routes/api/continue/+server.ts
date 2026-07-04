import { requireJsonUser } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import type { ContinueWatchingResponse } from "$lib/server/api/types";
import { movieRows } from "$lib/server/media/movies";
import { tvRows } from "$lib/server/media/shows";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const [movieResults, tvResults] = await Promise.all([movieRows(user.id), tvRows(user.id)]);

  return apiJson<ContinueWatchingResponse>({
    movies: movieResults.continueWatching,
    episodes: tvResults.continueWatching,
    nextUp: tvResults.nextUp,
  });
};
