import { apiErrorFrom } from "$lib/server/api/json";
import { parseBody, recordObjectSchema, requireJsonAdmin } from "$lib/server/api";
import { updateMetadataSettings } from "$lib/server/settings-commands";
import type { RequestHandler } from "./$types";

export const PATCH: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const input = await parseBody(request, recordObjectSchema);
    await updateMetadataSettings(input);

    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorFrom(error, "Could not update metadata settings.");
  }
};
