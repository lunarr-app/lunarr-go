import { revokeApiKey } from "$lib/server/auth/api-keys";
import { requireJsonUser } from "$lib/server/api";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async ({ params, locals, request }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  if (!(await revokeApiKey({
    headers: request.headers,
    apiKeyId: params.id,
  }))) {
    return json({ error: "API key not found." }, { status: 404 });
  }

  return json({ ok: true });
};
