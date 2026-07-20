import { BROWSE_RAIL_LIMIT } from "$lib/server/media/catalog";
import { listBecauseYouWatchedMovies } from "$lib/server/media/movies/discover";
import { listBecauseYouWatchedShows } from "$lib/server/media/shows/discover";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const userId = locals.user!.id;
  const [movieResults, showResults] = await Promise.all([
    listBecauseYouWatchedMovies(userId, 1, BROWSE_RAIL_LIMIT),
    listBecauseYouWatchedShows(userId, 1, BROWSE_RAIL_LIMIT),
  ]);

  return {
    movies: movieResults.movies,
    moviesPage: movieResults.page,
    shows: showResults.shows,
    showsPage: showResults.page,
  };
};
