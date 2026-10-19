import { requireJsonAdmin } from "#lib/server/api.js";
import { apiError, apiJson } from "#lib/server/api/json.js";
import type { MetadataRefreshResponse } from "#lib/server/api/types.js";
import { refreshMovieMetadataResult } from "#lib/server/metadata/movies.js";
import { tmdbCredentialsConfigured } from "#lib/server/metadata/tmdb.js";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  if (!(await tmdbCredentialsConfigured())) {
    return apiError("TMDb credentials are not configured.", 400);
  }

  const result = await refreshMovieMetadataResult(params.id);
  if (result.status === "missing") return apiError("Movie not found.", 404);
  if (result.status === "unmatched") return apiError("No TMDb match was found for this movie.", 400);

  return apiJson<MetadataRefreshResponse>(result);
};
