import { requireJsonAdmin } from "$lib/server/api";
import { cancelPlaybackSession } from "$lib/server/transcoding/manager";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  const result = await cancelPlaybackSession(params.sessionId);
  if (result === "missing") return json({ error: "Playback session was not found." }, { status: 404 });
  if (result === "inactive") return json({ error: "Playback session is not active." }, { status: 400 });

  return json({ ok: true });
};
