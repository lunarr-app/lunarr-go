import { requireJsonUser } from "$lib/server/api";
import { loadSimilarShows } from "$lib/server/media/similar-page-load";
import { normalizePage } from "$lib/server/media/catalog";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const result = await loadSimilarShows(params.id, user.id, normalizePage(url.searchParams.get("page")));
  if (!result) return json({ error: "Show not found." }, { status: 404 });

  return json(result);
};
