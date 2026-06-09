import { jsonError, readJsonBody, requireJsonAdmin } from "$lib/server/api";
import { updateTranscodingSettings } from "$lib/server/settings-commands";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const PUT: RequestHandler = async ({ request, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    await updateTranscodingSettings(
      typeof body === "object" && body ? (body as Record<string, unknown>) : {},
    );

    return json({ ok: true });
  } catch (error) {
    return jsonError(error, "Could not update transcoding settings.");
  }
};
