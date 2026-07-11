import { createApiKey, listApiKeys, apiKeyHttpStatus } from "$lib/server/auth/api-keys";
import { apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { ApiKeyListResponse, CreateApiKeyResponse } from "$lib/server/api/types";
import { parseBody, requireJsonUser } from "$lib/server/api";
import { z } from "zod";
import type { RequestHandler } from "./$types";

const createApiKeySchema = z.object({
  name: z.unknown().optional(),
  expiresIn: z.unknown().optional(),
});

export const GET: RequestHandler = async ({ locals, request }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    return apiJson<ApiKeyListResponse>({ apiKeys: await listApiKeys(request.headers) });
  } catch (error) {
    return apiErrorFrom(error, "Could not list API keys.", apiKeyHttpStatus(error));
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const body = await parseBody(request, createApiKeySchema);
    return apiJson<CreateApiKeyResponse>(
      await createApiKey({
        headers: request.headers,
        name: body.name,
        expiresIn: body.expiresIn,
      }),
      { status: 201 },
    );
  } catch (error) {
    return apiErrorFrom(error, "Could not create API key.", apiKeyHttpStatus(error));
  }
};
