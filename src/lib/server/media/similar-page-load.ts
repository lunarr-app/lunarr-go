import { normalizePage } from "./catalog";
import { getAccessibleMovieHeader, getSimilarMovies } from "./movies/discover";
import { getAccessibleShowHeader, getSimilarShows } from "./shows/discover";
import { error } from "@sveltejs/kit";

type SimilarPageLoadEvent = {
  params: { id: string };
  locals: App.Locals;
  url: URL;
};

export async function loadSimilarMovies(movieId: string, userId: string, pageInput = 1) {
  const movie = await getAccessibleMovieHeader(movieId, userId);
  if (!movie) return null;

  const { movies, page } = await getSimilarMovies(movieId, userId, pageInput);
  return { movie, movies, page };
}

export async function loadSimilarShows(showId: string, userId: string, pageInput = 1) {
  const show = await getAccessibleShowHeader(showId, userId);
  if (!show) return null;

  const { shows, page } = await getSimilarShows(showId, userId, pageInput);
  return { show, shows, page };
}

export function createSimilarMoviePageLoad() {
  return async ({ params, locals, url }: SimilarPageLoadEvent) => {
    const page = normalizePage(url.searchParams.get("page"));
    const result = await loadSimilarMovies(params.id, locals.user!.id, page);
    if (!result) throw error(404, "Movie not found");

    return { kind: "movie" as const, media: result.movie, movies: result.movies, pageInfo: result.page };
  };
}

export function createSimilarShowPageLoad() {
  return async ({ params, locals, url }: SimilarPageLoadEvent) => {
    const page = normalizePage(url.searchParams.get("page"));
    const result = await loadSimilarShows(params.id, locals.user!.id, page);
    if (!result) throw error(404, "Show not found");

    return { kind: "show" as const, media: result.show, shows: result.shows, pageInfo: result.page };
  };
}
