import { requireJsonUser } from "$lib/server/api";
import { normalizePage } from "$lib/server/media/catalog";
import { getPersonDetail } from "$lib/server/media/people";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const detail = await getPersonDetail(params.provider, params.id, user.id, {
    moviePage: normalizePage(url.searchParams.get("moviesPage")),
    showPage: normalizePage(url.searchParams.get("showsPage")),
  });
  if (!detail) return json({ error: "Person not found." }, { status: 404 });

  return json(detail);
};
