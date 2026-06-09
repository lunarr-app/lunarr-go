import { getPlaybackData, parsePlaybackProgressBody, saveProgress } from "$lib/server/playback";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, url, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const playback = await getPlaybackData({
    mediaItemId: params.id,
    userId: locals.user.id,
    url
  });

  if (!playback) {
    return json({ error: "Playable item not found." }, { status: 404 });
  }

  return json(playback);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let jsonBody: unknown;
    try {
      jsonBody = await request.json();
    } catch {
      return json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    const body = parsePlaybackProgressBody(jsonBody);
    await saveProgress({
      userId: locals.user.id,
      mediaItemId: params.id,
      ...body
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Could not save progress." },
      { status: 400 }
    );
  }

  return json({ ok: true });
};
