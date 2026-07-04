import { apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { ApiOkResponse } from "$lib/server/api/types";
import { readJsonBody, requireJsonAdmin } from "$lib/server/api";
import { updateTranscodingSettings } from "$lib/server/settings-commands";
import type { RequestHandler } from "./$types";

export const PUT: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    await updateTranscodingSettings(typeof body === "object" && body ? (body as Record<string, unknown>) : {});

    return apiJson<ApiOkResponse>({ ok: true });
  } catch (error) {
    return apiErrorFrom(error, "Could not update transcoding settings.");
  }
};
