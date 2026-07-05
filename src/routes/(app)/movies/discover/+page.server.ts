import { MOVIE_PAGE_SIZE, normalizeLimit, normalizePage } from "$lib/server/media/catalog";
import { listBecauseYouWatchedMovies } from "$lib/server/media/movies/discover";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const page = normalizePage(url.searchParams.get("page"));
  const limit = normalizeLimit(url.searchParams.get("limit"), MOVIE_PAGE_SIZE);
  const rows = await listBecauseYouWatchedMovies(locals.user!.id, page, limit);

  return {
    movies: rows.movies,
    pageInfo: rows.page,
  };
};
