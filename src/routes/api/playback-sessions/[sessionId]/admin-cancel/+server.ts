import { apiError, apiJson } from "$lib/server/api/json";
import type { ApiOkResponse } from "$lib/server/api/types";
import { requireJsonAdmin } from "$lib/server/api";
import { cancelPlaybackSession } from "$lib/server/transcoding/manager";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = requireJsonAdmin(locals);
  if (user instanceof Response) return user;

  const result = await cancelPlaybackSession(params.sessionId);
  if (result === "missing") return apiError("Playback session was not found.", 404);
  if (result === "inactive") return apiError("Playback session is not active.");

  return apiJson<ApiOkResponse>({ ok: true });
};
