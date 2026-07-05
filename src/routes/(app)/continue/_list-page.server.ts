import { FULL_LIBRARY_PAGE_SIZE, normalizePage } from "$lib/server/media/catalog";
import { continueMovieRows } from "$lib/server/media/movies/browse";
import { continueEpisodeRows, nextUpEpisodeRows } from "$lib/server/media/shows/episodes";

type ContinueListLoadEvent = {
  locals: App.Locals;
  url: URL;
};

export function createContinueMoviesLoad() {
  return async ({ locals, url }: ContinueListLoadEvent) => {
    const page = normalizePage(url.searchParams.get("page"));
    const rows = await continueMovieRows(locals.user!.id, page, FULL_LIBRARY_PAGE_SIZE);

    return {
      movies: rows.continueWatching,
      pageInfo: rows.continueWatchingPage,
    };
  };
}

export function createContinueEpisodesLoad() {
  return async ({ locals, url }: ContinueListLoadEvent) => {
    const page = normalizePage(url.searchParams.get("page"));
    const rows = await continueEpisodeRows(locals.user!.id, page, FULL_LIBRARY_PAGE_SIZE);

    return {
      episodes: rows.continueWatching,
      pageInfo: rows.continueWatchingPage,
    };
  };
}

export function createContinueNextUpLoad() {
  return async ({ locals, url }: ContinueListLoadEvent) => {
    const page = normalizePage(url.searchParams.get("page"));
    const rows = await nextUpEpisodeRows(locals.user!.id, page, FULL_LIBRARY_PAGE_SIZE);

    return {
      episodes: rows.nextUp,
      pageInfo: rows.nextUpPage,
    };
  };
}
