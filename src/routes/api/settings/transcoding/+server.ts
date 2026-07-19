import { apiErrorFrom } from "$lib/server/api/json";
import { parseBody, recordObjectSchema, requireJsonAdmin } from "$lib/server/api";
import { updateTranscodingSettings } from "$lib/server/settings-commands";
import type { RequestHandler } from "./$types";

export const PATCH: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const input = await parseBody(request, recordObjectSchema);
    await updateTranscodingSettings(input);

    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorFrom(error, "Could not update transcoding settings.");
  }
};
