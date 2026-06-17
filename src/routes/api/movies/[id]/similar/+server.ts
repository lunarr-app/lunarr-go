import { requireJsonUser } from "$lib/server/api";
import { loadSimilarMovies } from "$lib/server/media/similar-page-load";
import { normalizePage } from "$lib/server/media";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const result = await loadSimilarMovies(params.id, user.id, normalizePage(url.searchParams.get("page")));
  if (!result) return json({ error: "Movie not found." }, { status: 404 });

  return json(result);
};
