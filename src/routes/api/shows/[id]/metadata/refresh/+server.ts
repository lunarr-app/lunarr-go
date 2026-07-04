import { requireJsonAdmin } from "$lib/server/api";
import { apiError, apiJson } from "$lib/server/api/json";
import type { MetadataRefreshResponse } from "$lib/server/api/types";
import { refreshTvShowMetadataResult } from "$lib/server/metadata/tv";
import { tmdbCredentialsConfigured } from "$lib/server/metadata/tmdb";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  if (!(await tmdbCredentialsConfigured())) {
    return apiError("TMDb credentials are not configured.", 400);
  }

  const result = await refreshTvShowMetadataResult(params.id);
  if (result.status === "missing") return apiError("Show not found.", 404);
  if (result.status === "no_seasons") {
    return apiError("This show has no seasons to refresh.", 400);
  }
  if (result.status === "unmatched") return apiError("No TMDb match was found for this show.", 400);

  return apiJson<MetadataRefreshResponse>(result);
};
