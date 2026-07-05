import { requireJsonUser } from "$lib/server/api";
import { apiJson } from "$lib/server/api/json";
import type { DiscoverMoviesResponse } from "$lib/server/api/types";
import { normalizePage } from "$lib/server/media/catalog";
import { listBecauseYouWatchedMovies } from "$lib/server/media/movies/discover";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const page = normalizePage(url.searchParams.get("page"));
  return apiJson<DiscoverMoviesResponse>(await listBecauseYouWatchedMovies(user.id, page));
};
