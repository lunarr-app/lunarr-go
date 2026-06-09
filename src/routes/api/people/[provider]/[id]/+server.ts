import { requireJsonUser } from "$lib/server/api";
import { getPersonDetail } from "$lib/server/media";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const detail = await getPersonDetail(params.provider, params.id, user.id);
  if (!detail) return json({ error: "Person not found." }, { status: 404 });

  return json(detail);
};
