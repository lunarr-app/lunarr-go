import { requireJsonAdmin } from "$lib/server/api";
import { refreshMovieMetadataResult } from "$lib/server/metadata/movies";
import { tmdbCredentialsConfigured } from "$lib/server/metadata/tmdb";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  if (!(await tmdbCredentialsConfigured())) {
    return json({ error: "TMDb credentials are not configured." }, { status: 400 });
  }

  const result = await refreshMovieMetadataResult(params.id);
  if (result.status === "missing") return json({ error: "Movie not found." }, { status: 404 });
  if (result.status === "unmatched") return json({ error: "No TMDb match was found for this movie." }, { status: 400 });

  return json(result);
};
