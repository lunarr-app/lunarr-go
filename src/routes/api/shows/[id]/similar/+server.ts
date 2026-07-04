import { requireJsonUser } from "$lib/server/api";
import { apiError, apiJson } from "$lib/server/api/json";
import type { SimilarShowsResponse } from "$lib/server/api/types";
import { normalizePage } from "$lib/server/media/catalog";
import { loadSimilarShows } from "$lib/server/media/similar-page-load";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const result = await loadSimilarShows(params.id, user.id, normalizePage(url.searchParams.get("page")));
  if (!result) return apiError("Show not found.", 404);

  return apiJson<SimilarShowsResponse>(result);
};
