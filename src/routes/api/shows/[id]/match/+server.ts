import { parseBody, requireJsonAdmin } from "$lib/server/api";
import { apiError, apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { MediaMatchResponse } from "$lib/server/api/types";
import { fixShowMatch, matchBodySchema } from "$lib/server/metadata/fix-match";
import { tmdbCredentialsConfigured } from "$lib/server/metadata/tmdb";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals, request }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  if (!(await tmdbCredentialsConfigured())) {
    return apiError("TMDb credentials are not configured.", 400);
  }

  try {
    const body = await parseBody(request, matchBodySchema);
    const result = await fixShowMatch(params.id, body.tmdbId);
    if (result.status === "missing") return apiError("Show not found.", 404);
    if (result.status === "no_seasons") return apiError("This show has no seasons to match.", 400);
    if (result.status === "not_found") return apiError("No TMDb show was found for that ID.", 404);
    if (result.status === "missing_seasons") {
      const label =
        result.missingSeasons.length === 1
          ? `season ${result.missingSeasons[0]}`
          : `seasons ${result.missingSeasons.join(", ")}`;
      return apiError(`The selected TMDb show has no ${label}.`, 400);
    }
    return apiJson<MediaMatchResponse>({ mediaItemId: result.mediaItemId });
  } catch (error) {
    return apiErrorFrom(error, "Could not update the show match.");
  }
};
