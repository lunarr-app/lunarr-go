import { createApiKey, listApiKeys } from "$lib/server/auth/api-keys";
import { jsonError, readJsonBody, requireJsonUser } from "$lib/server/api";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, request }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  return json({ apiKeys: await listApiKeys(request.headers) });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    return json(await createApiKey({
      headers: request.headers,
      name: typeof body === "object" && body ? (body as { name?: unknown }).name : undefined,
      expiresIn: typeof body === "object" && body ? (body as { expiresIn?: unknown }).expiresIn : undefined
    }), { status: 201 });
  } catch (error) {
    return jsonError(error, "Could not create API key.");
  }
};
