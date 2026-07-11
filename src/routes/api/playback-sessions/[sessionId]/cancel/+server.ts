import { apiError, apiJson } from "$lib/server/api/json";
import type { ApiOkResponse } from "$lib/server/api/types";
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
  if (result === "missing") return apiError("Playback session was not found.", 404);
  if (result === "inactive") return apiError("Playback session is not active.");

  return apiJson<ApiOkResponse>({ ok: true });
};
