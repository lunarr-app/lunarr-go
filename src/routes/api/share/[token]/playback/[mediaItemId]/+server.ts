import { getPlaybackData } from "$lib/server/playback";
import { PlaybackSourceRequestError, withSignedPlaybackSource } from "$lib/server/playback/signed-source";
import { assertShareAllowsPlayableItem, resolveShare } from "$lib/server/shares";
import { enforceGuestShareRateLimit } from "$lib/server/shares/rate-limit";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const limited = enforceGuestShareRateLimit(event, "share:playback");
  if (limited) return limited;

  const { params, url } = event;
  const share = await resolveShare(params.token);
  if (!share) {
    return json({ error: "Share not found or no longer available." }, { status: 404 });
  }

  try {
    await assertShareAllowsPlayableItem(share, params.mediaItemId);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "This share does not include the requested item." },
      { status: 403 },
    );
  }

  const playback = await getPlaybackData({
    mediaItemId: params.mediaItemId,
    userId: share.created_by_user_id,
    url,
    skipProgress: true,
    backHref: `/share/${share.token}`,
  });

  if (!playback) {
    return json({ error: "Playable item not found." }, { status: 404 });
  }

  try {
    return json(
      await withSignedPlaybackSource({
        data: playback,
        userId: share.created_by_user_id,
        origin: url.origin,
        shareToken: share.token,
      }),
    );
  } catch (error) {
    if (error instanceof PlaybackSourceRequestError) {
      return json({ error: error.message }, { status: error.status });
    }
    return json({ error: "Could not prepare playback source." }, { status: 500 });
  }
};
