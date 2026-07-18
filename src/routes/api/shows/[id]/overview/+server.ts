import { apiErrorFrom, requireJsonUser } from "$lib/server/api";
import { apiError, apiJson } from "$lib/server/api/json";
import type { ShowOverviewResponse } from "$lib/server/api/types";
import { getShowOverview } from "$lib/server/media/shows/detail";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const overview = await getShowOverview(params.id, user.id);
    if (!overview) return apiError("Show not found.", 404);

    return apiJson<ShowOverviewResponse>(overview);
  } catch (error) {
    return apiErrorFrom(error, "Could not load show overview.");
  }
};
