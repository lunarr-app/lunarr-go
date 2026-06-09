import { isAdmin } from "$lib/server/auth/users";
import { cancelPlaybackSession } from "$lib/server/transcoding/manager";
import { getTranscodeSession } from "$lib/server/transcoding/sessions";
import { json, type RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = params.sessionId;
  if (!sessionId) {
    return json({ error: "Playback session is required." }, { status: 400 });
  }

  const session = await getTranscodeSession(sessionId);
  if (!session) {
    return json({ error: "Playback session was not found." }, { status: 404 });
  }
  if (!isAdmin(locals.user) && session.userId !== locals.user.id) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await cancelPlaybackSession(sessionId);
  return json({ ok: true, status: result });
};
