import { apiError, requireJsonUser } from "$lib/server/api";
import { getTranscodePolicy } from "$lib/server/transcoding/policy";
import {
  cancelPlaybackSession,
  expireStalePlaybackSessions,
  TRANSCODING_DISABLED_MESSAGE,
} from "$lib/server/transcoding/manager";
import { getTranscodeSession, touchTranscodeSessionHeartbeat } from "$lib/server/transcoding/sessions";
import type { RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ params, locals, request }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const sessionId = params.sessionId?.trim();
  if (!sessionId) return apiError("Playback session is required.");

  const session = await getTranscodeSession(sessionId);
  if (!session || session.userId !== user.id) {
    return apiError("Playback session is not active.", 409);
  }

  const touched = await touchTranscodeSessionHeartbeat(sessionId, user.id, {
    signal: request.signal,
  });
  if (!touched) {
    return apiError("Playback session is not active.", 409);
  }

  const currentPolicy = await getTranscodePolicy(user.id);
  if (!currentPolicy.transcodingEnabled) {
    await cancelPlaybackSession(sessionId, TRANSCODING_DISABLED_MESSAGE);
    return apiError(TRANSCODING_DISABLED_MESSAGE, 409);
  }

  void expireStalePlaybackSessions().catch(() => undefined);
  return new Response(null, { status: 204 });
};
