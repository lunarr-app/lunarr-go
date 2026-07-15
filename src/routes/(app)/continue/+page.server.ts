import { BROWSE_RAIL_LIMIT, MOVIE_PAGE_SIZE, SHOW_PAGE_SIZE } from "$lib/server/media/catalog";
import { continueMovieRows } from "$lib/server/media/movies/browse";
import { continueTvRows } from "$lib/server/media/shows/episodes";
import { listBecauseYouWatchedMovies } from "$lib/server/media/movies/discover";
import { listBecauseYouWatchedShows } from "$lib/server/media/shows/discover";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const [movieResults, tvResults, recommendedMovies, recommendedShows] = await Promise.all([
    continueMovieRows(locals.user!.id, 1, BROWSE_RAIL_LIMIT),
    continueTvRows(locals.user!.id, 1, BROWSE_RAIL_LIMIT),
    listBecauseYouWatchedMovies(locals.user!.id, 1, MOVIE_PAGE_SIZE),
    listBecauseYouWatchedShows(locals.user!.id, 1, SHOW_PAGE_SIZE),
  ]);

  return {
    movies: movieResults.continueWatching,
    moviesPage: movieResults.continueWatchingPage,
    episodes: tvResults.continueWatching,
    episodesPage: tvResults.continueWatchingPage,
    nextUp: tvResults.nextUp,
    nextUpPage: tvResults.nextUpPage,
    recommendedMovies: recommendedMovies.movies,
    recommendedShows: recommendedShows.shows,
  };
};
