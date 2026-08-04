import { requireJsonAdmin } from "$lib/server/api";
import { apiError, apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { MatchSearchResponse } from "$lib/server/api/types";
import { fixMatchTargetExists, parseMatchQuery, resolveShowMatchCandidate } from "$lib/server/metadata/fix-match";
import { searchTmdbTvCandidates, tmdbCredentialsConfigured } from "$lib/server/metadata/tmdb";
import { parseTmdbReference } from "$lib/server/metadata/tmdb-reference";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  const parsed = parseMatchQuery(url);
  if (!parsed.ok) return apiError(parsed.error);

  if (!(await tmdbCredentialsConfigured())) {
    return apiError("TMDb credentials are not configured.", 400);
  }

  try {
    if (!(await fixMatchTargetExists("show", params.id))) {
      return apiError("Show not found.", 404);
    }

    const reference = parseTmdbReference(parsed.query);
    if (reference?.kind === "movie") {
      return apiError("That looks like a movie reference. Provide a TMDb show URL or ID.", 400);
    }

    if (reference) {
      const candidate = await resolveShowMatchCandidate(reference.tmdbId);
      if (!candidate) return apiError("No TMDb show was found for that reference.", 404);
      return apiJson<MatchSearchResponse>({ candidates: [candidate], resolved: true });
    }

    const candidates = await searchTmdbTvCandidates(parsed.query);
    return apiJson<MatchSearchResponse>({ candidates, resolved: false });
  } catch (error) {
    return apiErrorFrom(error, "Could not search TMDb.", 500);
  }
};
