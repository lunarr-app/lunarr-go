import { getPlaybackData } from "$lib/server/playback";
import { PlaybackSourceRequestError, withSignedPlaybackSource } from "$lib/server/playback/signed-source";
import { apiError, apiJson } from "$lib/server/api/json";
import type { PlaybackDataResponse } from "$lib/server/api/types";
import { assertShareAllowsPlayableItem, resolveShare } from "$lib/server/shares";
import { enforceGuestShareRateLimit } from "$lib/server/shares/rate-limit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const limited = enforceGuestShareRateLimit(event, "share:playback");
  if (limited) return limited;

  const { params, url } = event;
  const share = await resolveShare(params.token);
  if (!share) {
    return apiError("Share not found or no longer available.", 404);
  }

  try {
    await assertShareAllowsPlayableItem(share, params.mediaItemId);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "This share does not include the requested item.", 403);
  }

  const playback = await getPlaybackData({
    mediaItemId: params.mediaItemId,
    userId: share.created_by_user_id,
    url,
    skipProgress: true,
    backHref: `/share/${share.token}`,
  });

  if (!playback) {
    return apiError("Playable item not found.", 404);
  }

  try {
    return apiJson<PlaybackDataResponse>(
      await withSignedPlaybackSource({
        data: playback,
        userId: share.created_by_user_id,
        origin: url.origin,
        shareToken: share.token,
      }),
    );
  } catch (error) {
    if (error instanceof PlaybackSourceRequestError) {
      return apiError(error.message, error.status);
    }
    return apiError("Could not prepare playback source.", 500);
  }
};
