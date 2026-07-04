import { getPlaybackData, parsePlaybackProgressBody, saveProgress } from "$lib/server/playback";
import { PlaybackSourceRequestError, withSignedPlaybackSource } from "$lib/server/playback/signed-source";
import { apiError, apiJson } from "$lib/server/api/json";
import type { ApiOkResponse, PlaybackDataResponse } from "$lib/server/api/types";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, url, locals }) => {
  if (!locals.user) {
    return apiError("Unauthorized", 401);
  }

  const playback = await getPlaybackData({
    mediaItemId: params.id,
    userId: locals.user.id,
    url,
  });

  if (!playback) {
    return apiError("Playable item not found.", 404);
  }

  try {
    return apiJson<PlaybackDataResponse>(
      await withSignedPlaybackSource({
        data: playback,
        userId: locals.user.id,
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
  if (!locals.user) {
    return apiError("Unauthorized", 401);
  }

  try {
    let jsonBody: unknown;
    try {
      jsonBody = await request.json();
    } catch {
      return apiError("Request body must be valid JSON.", 400);
    }

    const body = parsePlaybackProgressBody(jsonBody);
    await saveProgress({
      userId: locals.user.id,
      mediaItemId: params.id,
      ...body,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not save progress.", 400);
  }

  return apiJson<ApiOkResponse>({ ok: true });
};
