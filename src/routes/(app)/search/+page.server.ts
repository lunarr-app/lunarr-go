import { BROWSE_RAIL_LIMIT } from "$lib/server/media/catalog";
import { movieRows } from "$lib/server/media/movies/browse";
import { showBrowseRows } from "$lib/server/media/shows/browse";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const query = url.searchParams.get("q") ?? "";
  const [movies, shows] = await Promise.all([
    movieRows(locals.user!.id, query, "all", "title", 1, BROWSE_RAIL_LIMIT),
    showBrowseRows(locals.user!.id, query, "title", 1, BROWSE_RAIL_LIMIT),
  ]);

  return {
    query,
    movies: movies.all,
    shows: shows.all,
  };
};
