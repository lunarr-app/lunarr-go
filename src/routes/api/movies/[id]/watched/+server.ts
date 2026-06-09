import { booleanFromJson, jsonError, readJsonBody, requireJsonUser } from "$lib/server/api";
import { markWatched } from "$lib/server/playback";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    const fileId = typeof body === "object" && body ? String((body as { mediaFileId?: unknown }).mediaFileId ?? "") : "";
    if (!fileId) return json({ error: "File is required." }, { status: 400 });

    await markWatched({
      userId: user.id,
      mediaItemId: params.id,
      mediaFileId: fileId,
      completed: booleanFromJson(typeof body === "object" && body ? (body as { completed?: unknown }).completed : undefined)
    });
  } catch (error) {
    return jsonError(error, "Could not update watched status.");
  }

  return json({ ok: true });
};
