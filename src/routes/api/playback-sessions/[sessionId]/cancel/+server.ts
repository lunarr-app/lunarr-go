import { apiError, apiJson } from "$lib/server/api/json";
import { isAdmin } from "$lib/server/auth/users";
import { cancelPlaybackSession } from "$lib/server/transcoding/manager";
import { getTranscodeSession } from "$lib/server/transcoding/sessions";
import type { RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return apiError("Unauthorized", 401);
  }

  const sessionId = params.sessionId;
  if (!sessionId) {
    return apiError("Playback session is required.");
  }

  const session = await getTranscodeSession(sessionId);
  if (!session) {
    return apiError("Playback session was not found.", 404);
  }
  if (!isAdmin(locals.user) && session.userId !== locals.user.id) {
    return apiError("Forbidden", 403);
  }

  const result = await cancelPlaybackSession(sessionId);
  return apiJson({ ok: true, status: result });
};
