import { parseBody, requireJsonAdmin } from "$lib/server/api";
import { apiError, apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { MediaMatchResponse } from "$lib/server/api/types";
import { fixMovieMatch, matchBodySchema, revertFixMatch } from "$lib/server/metadata/fix-match";
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
    const result = await fixMovieMatch(params.id, body.tmdbId);
    if (result.status === "missing") return apiError("Movie not found.", 404);
    if (result.status === "not_found") return apiError("No TMDb movie was found for that ID.", 404);
    return apiJson<MediaMatchResponse>({ mediaItemId: result.mediaItemId });
  } catch (error) {
    return apiErrorFrom(error, "Could not update the movie match.");
  }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  if (!(await tmdbCredentialsConfigured())) {
    return apiError("TMDb credentials are not configured.", 400);
  }

  try {
    const result = await revertFixMatch("movie", params.id);
    if (result.status === "missing") return apiError("Movie not found.", 404);
    if (result.status === "not_manual") return apiError("This movie is not manually matched.", 400);
    return apiJson<MediaMatchResponse>({ mediaItemId: result.mediaItemId });
  } catch (error) {
    return apiErrorFrom(error, "Could not revert the movie match.");
  }
};
