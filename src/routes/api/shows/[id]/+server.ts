import { requireJsonUser } from "$lib/server/api";
import { getShowDetail } from "$lib/server/media/shows";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const detail = await getShowDetail(params.id, user.id);
  if (!detail) return json({ error: "Show not found." }, { status: 404 });

  return json(detail);
};
