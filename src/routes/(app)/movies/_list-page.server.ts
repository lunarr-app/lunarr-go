import { movieListRows, normalizeMoviePage, type MovieSort } from "$lib/server/media";

type MovieListLoadEvent = {
  locals: App.Locals;
  url: URL;
};

export function createPresetMovieListLoad(sort: MovieSort) {
  return async ({ locals, url }: MovieListLoadEvent) => {
    const page = normalizeMoviePage(url.searchParams.get("page"));
    const rows = await movieListRows(locals.user!.id, "", "all", sort, page);

    return {
      movies: rows.movies,
      pageInfo: rows.page,
    };
  };
}
