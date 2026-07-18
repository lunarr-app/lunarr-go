import { FULL_LIBRARY_PAGE_SIZE, normalizePage, type MovieSort } from "$lib/server/media/catalog";
import { movieRows } from "$lib/server/media/movies/browse";

type MovieListLoadEvent = {
  locals: App.Locals;
  url: URL;
};

export function createPresetMovieListLoad(sort: MovieSort) {
  return async ({ locals, url }: MovieListLoadEvent) => {
    const page = normalizePage(url.searchParams.get("page"));
    const rows = await movieRows(locals.user!.id, "", "all", sort, page, FULL_LIBRARY_PAGE_SIZE);

    return {
      movies: rows.all,
      pageInfo: rows.allPage,
    };
  };
}
