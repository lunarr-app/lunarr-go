import { movieRows } from "$lib/server/media/movies/browse";
import { tvRows } from "$lib/server/media/shows/episodes";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const [movieResults, tvResults] = await Promise.all([movieRows(locals.user!.id), tvRows(locals.user!.id)]);

  return {
    movies: movieResults.continueWatching,
    episodes: tvResults.continueWatching,
    nextUp: tvResults.nextUp,
  };
};
