import { movieRows, tvRows } from "$lib/server/media";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const [movieResults, tvResults] = await Promise.all([
    movieRows(locals.user!.id),
    tvRows(locals.user!.id)
  ]);

  return {
    movies: movieResults.continueWatching,
    episodes: tvResults.continueWatching
  };
};
