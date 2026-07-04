import { apiError, apiErrorFrom, apiJson } from "$lib/server/api/json";
import type { ApiOkResponse, PlaybackDataResponse } from "$lib/server/api/types";
import { requireJsonUser } from "$lib/server/api";
import { getPlaybackData, parsePlaybackProgressBody, saveProgress } from "$lib/server/playback";
import { PlaybackSourceRequestError, withSignedPlaybackSource } from "$lib/server/playback/signed-source";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, url, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  const playback = await getPlaybackData({
    mediaItemId: params.id,
    userId: user.id,
    url,
  });

  if (!playback) {
    return apiError("Playable item not found.", 404);
  }

  try {
    return apiJson<PlaybackDataResponse>(
      await withSignedPlaybackSource({
        data: playback,
        userId: user.id,
        origin: url.origin,
      }),
    );
  } catch (error) {
    if (error instanceof PlaybackSourceRequestError) {
      return apiError(error.message, error.status);
    }
    return apiError("Could not prepare playback source.", 500);
  }
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = requireJsonUser(locals);
  if (user instanceof Response) return user;

  try {
    let jsonBody: unknown;
    try {
      jsonBody = await request.json();
    } catch {
      return apiError("Request body must be valid JSON.", 400);
    }

    const body = parsePlaybackProgressBody(jsonBody);
    await saveProgress({
      userId: user.id,
      mediaItemId: params.id,
      ...body,
    });
  } catch (error) {
    return apiErrorFrom(error, "Could not save progress.");
  }

  return apiJson<ApiOkResponse>({ ok: true });
};
