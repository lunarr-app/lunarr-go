import { MOVIE_PAGE_SIZE, SHOW_PAGE_SIZE } from "$lib/server/media/catalog";
import { listBecauseYouWatchedMovies } from "$lib/server/media/movies/discover";
import { listBecauseYouWatchedShows } from "$lib/server/media/shows/discover";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const [movies, shows] = await Promise.all([
    listBecauseYouWatchedMovies(locals.user!.id, 1, MOVIE_PAGE_SIZE),
    listBecauseYouWatchedShows(locals.user!.id, 1, SHOW_PAGE_SIZE),
  ]);

  return {
    movies: movies.movies,
    shows: shows.shows,
  };
};
