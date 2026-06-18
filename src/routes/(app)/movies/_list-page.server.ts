import { normalizePage, type MovieSort } from "$lib/server/media/catalog";
import { movieRows } from "$lib/server/media/movies";

type MovieListLoadEvent = {
  locals: App.Locals;
  url: URL;
};

export function createPresetMovieListLoad(sort: MovieSort) {
  return async ({ locals, url }: MovieListLoadEvent) => {
    const page = normalizePage(url.searchParams.get("page"));
    const rows = await movieRows(locals.user!.id, "", "all", sort, page);

    return {
      movies: rows.all,
      pageInfo: rows.allPage,
    };
  };
}
