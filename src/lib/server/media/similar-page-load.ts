import {
  getAccessibleMovieHeader,
  getAccessibleShowHeader,
  getSimilarMovies,
  getSimilarShows,
  normalizePage,
} from "$lib/server/media";
import { error } from "@sveltejs/kit";

type SimilarPageLoadEvent = {
  params: { id: string };
  locals: App.Locals;
  url: URL;
};

export function createSimilarMoviePageLoad() {
  return async ({ params, locals, url }: SimilarPageLoadEvent) => {
    const media = await getAccessibleMovieHeader(params.id, locals.user!.id);
    if (!media) throw error(404, "Movie not found");

    const page = normalizePage(url.searchParams.get("page"));
    const { movies, page: pageInfo } = await getSimilarMovies(params.id, locals.user!.id, page);

    return { kind: "movie" as const, media, movies, pageInfo };
  };
}

export function createSimilarShowPageLoad() {
  return async ({ params, locals, url }: SimilarPageLoadEvent) => {
    const media = await getAccessibleShowHeader(params.id, locals.user!.id);
    if (!media) throw error(404, "Show not found");

    const page = normalizePage(url.searchParams.get("page"));
    const { shows, page: pageInfo } = await getSimilarShows(params.id, locals.user!.id, page);

    return { kind: "show" as const, media, shows, pageInfo };
  };
}
