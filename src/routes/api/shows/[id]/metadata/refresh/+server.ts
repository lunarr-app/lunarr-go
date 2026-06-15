import { requireJsonAdmin } from "$lib/server/api";
import { refreshTvShowMetadataResult } from "$lib/server/metadata/tv";
import { tmdbCredentialsConfigured } from "$lib/server/metadata/tmdb";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  if (!(await tmdbCredentialsConfigured())) {
    return json({ error: "TMDb credentials are not configured." }, { status: 400 });
  }

  const result = await refreshTvShowMetadataResult(params.id);
  if (result.status === "missing") return json({ error: "Show not found." }, { status: 404 });
  if (result.status === "no_seasons") {
    return json({ error: "This show has no seasons to refresh." }, { status: 400 });
  }
  if (result.status === "unmatched") return json({ error: "No TMDb match was found for this show." }, { status: 400 });

  return json(result);
};
