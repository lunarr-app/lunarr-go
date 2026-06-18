import { requireJsonUser } from "$lib/server/api";
import { listBecauseYouWatchedMovies, normalizePage } from "$lib/server/media";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const page = normalizePage(url.searchParams.get("page"));
  return json(await listBecauseYouWatchedMovies(user.id, page));
};
