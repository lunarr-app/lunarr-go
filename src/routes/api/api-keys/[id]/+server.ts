import { revokeApiKey } from "$lib/server/auth/api-keys";
import { requireJsonUser } from "$lib/server/api";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  if (!(await revokeApiKey(user.id, params.id))) {
    return json({ error: "API key not found." }, { status: 404 });
  }

  return json({ ok: true });
};
