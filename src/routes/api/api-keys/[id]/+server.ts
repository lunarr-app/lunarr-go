import { apiError, apiErrorFrom, apiJson } from "#lib/server/api/json.js";
import type { ApiOkResponse } from "#lib/server/api/types.js";
import { revokeApiKey, apiKeyHttpStatus } from "#lib/server/auth/api-keys.js";
import { requireJsonUser } from "#lib/server/api.js";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async ({ params, locals, request }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    if (
      !(await revokeApiKey({
        headers: request.headers,
        apiKeyId: params.id,
      }))
    ) {
      return apiError("API key not found.", 404);
    }
  } catch (error) {
    return apiErrorFrom(error, "Could not revoke API key.", apiKeyHttpStatus(error));
  }

  return apiJson<ApiOkResponse>({ ok: true });
};
