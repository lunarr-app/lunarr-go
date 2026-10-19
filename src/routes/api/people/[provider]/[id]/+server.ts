import { apiErrorFrom, requireJsonUser } from "#lib/server/api.js";
import { apiError, apiJson } from "#lib/server/api/json.js";
import { normalizePage } from "#lib/server/media/catalog.js";
import { getPersonDetail } from "#lib/server/media/people.js";
import type { PersonDetailResponse } from "#lib/server/api/types.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const detail = await getPersonDetail(params.provider, params.id, user.id, {
      moviePage: normalizePage(url.searchParams.get("moviesPage")),
      showPage: normalizePage(url.searchParams.get("showsPage")),
    });
    if (!detail) return apiError("Person not found.", 404);

    return apiJson<PersonDetailResponse>(detail);
  } catch (error) {
    return apiErrorFrom(error, "Could not load person.", 500);
  }
};
