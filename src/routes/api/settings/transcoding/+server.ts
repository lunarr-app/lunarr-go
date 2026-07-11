import { apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { ApiOkResponse } from "$lib/server/api/types";
import { parseBody, recordObjectSchema, requireJsonAdmin } from "$lib/server/api";
import { updateTranscodingSettings } from "$lib/server/settings-commands";
import type { RequestHandler } from "./$types";

export const PUT: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const input = await parseBody(request, recordObjectSchema);
    await updateTranscodingSettings(input);

    return apiJson<ApiOkResponse>({ ok: true });
  } catch (error) {
    return apiErrorFrom(error, "Could not update transcoding settings.");
  }
};
