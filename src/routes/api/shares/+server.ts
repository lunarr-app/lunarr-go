import { jsonError, readJsonBody, requireJsonAdmin } from "$lib/server/api";
import { createShare, listSharesForMedia, parseCreateShareInput } from "$lib/server/shares";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  const mediaItemId = url.searchParams.get("mediaItemId")?.trim() ?? "";
  if (!mediaItemId) {
    return json({ error: "mediaItemId is required." }, { status: 400 });
  }

  try {
    return json({
      shares: await listSharesForMedia(mediaItemId),
    });
  } catch (error) {
    return jsonError(error, "Could not list shares.");
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  try {
    const body = await readJsonBody(request);
    const input = parseCreateShareInput(body);
    const share = await createShare({
      userId: user.id,
      ...input,
    });
    return json({ share }, { status: 201 });
  } catch (error) {
    return jsonError(error, "Could not create share.");
  }
};
