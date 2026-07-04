import { requireJsonUser } from "$lib/server/api";
import { apiError, apiJson } from "$lib/server/api/json";
import type { ShowFullResponse } from "$lib/server/api/types";
import { getShowDetail } from "$lib/server/media/shows";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const detail = await getShowDetail(params.id, user.id);
  if (!detail) return apiError("Show not found.", 404);

  return apiJson<ShowFullResponse>(detail);
};
