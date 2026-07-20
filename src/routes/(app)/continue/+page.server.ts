import { BROWSE_RAIL_LIMIT } from "$lib/server/media/catalog";
import { continueMovieRows } from "$lib/server/media/movies/browse";
import { continueTvRows } from "$lib/server/media/shows/episodes";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const [movieResults, tvResults] = await Promise.all([
    continueMovieRows(locals.user!.id, 1, BROWSE_RAIL_LIMIT),
    continueTvRows(locals.user!.id, 1, BROWSE_RAIL_LIMIT),
  ]);

  return {
    movies: movieResults.continueWatching,
    moviesPage: movieResults.continueWatchingPage,
    episodes: tvResults.continueWatching,
    episodesPage: tvResults.continueWatchingPage,
    nextUp: tvResults.nextUp,
    nextUpPage: tvResults.nextUpPage,
  };
};
