import { requireJsonUser } from "$lib/server/api";
import { movieRows, tvRows } from "$lib/server/media";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const [movieResults, tvResults] = await Promise.all([movieRows(user.id), tvRows(user.id)]);

  return json({
    movies: movieResults.continueWatching,
    episodes: tvResults.continueWatching,
    nextUp: tvResults.nextUp,
  });
};
