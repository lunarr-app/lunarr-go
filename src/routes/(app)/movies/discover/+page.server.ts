import { normalizePage } from "$lib/server/media/catalog";
import { listBecauseYouWatchedMovies } from "$lib/server/media/movies";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const page = normalizePage(url.searchParams.get("page"));
  const rows = await listBecauseYouWatchedMovies(locals.user!.id, page);

  return {
    movies: rows.movies,
    pageInfo: rows.page,
  };
};
