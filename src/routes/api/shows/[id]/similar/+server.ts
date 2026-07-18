import { apiErrorFrom, requireJsonUser } from "$lib/server/api";
import { apiError, apiJson } from "$lib/server/api/json";
import type { SimilarShowsResponse } from "$lib/server/api/types";
import { SHOW_PAGE_SIZE, normalizeLimit, normalizePage } from "$lib/server/media/catalog";
import { loadSimilarShows } from "$lib/server/media/similar-page-load";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const page = normalizePage(url.searchParams.get("page"));
    const limit = normalizeLimit(url.searchParams.get("limit"), SHOW_PAGE_SIZE);
    const result = await loadSimilarShows(params.id, user.id, page, limit);
    if (!result) return apiError("Show not found.", 404);

    return apiJson<SimilarShowsResponse>(result);
  } catch (error) {
    return apiErrorFrom(error, "Could not load similar shows.", 500);
  }
};
