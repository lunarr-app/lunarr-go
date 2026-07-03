import { requireJsonUser } from "$lib/server/api";
import { getMovieCredits } from "$lib/server/media/movies";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const credits = await getMovieCredits(params.id, user.id);
  if (!credits) return json({ error: "Movie not found." }, { status: 404 });

  return json(credits);
};
