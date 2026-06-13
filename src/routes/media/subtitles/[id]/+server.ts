import { externalMovieSubtitleResponse } from "$lib/server/media/subtitles";
import {
  REMOTE_PLAYBACK_TOKEN_QUERY_PARAM,
  remotePlaybackOptionsResponse,
  verifyRemotePlaybackToken,
  withRemotePlaybackCors,
} from "$lib/server/playback/remote-auth";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

function authorizedUserId(input: {
  localsUserId?: string;
  subtitleTrackId: string;
  token: string | null;
}) {
  if (input.localsUserId) return { userId: input.localsUserId, remote: false };
  const payload = verifyRemotePlaybackToken(input.token, {
    route: "subtitle",
    subtitleTrackId: input.subtitleTrackId,
  });
  return payload ? { userId: payload.userId, remote: true } : null;
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const auth = authorizedUserId({
    localsUserId: locals.user?.id,
    subtitleTrackId: params.id,
    token: url?.searchParams.get(REMOTE_PLAYBACK_TOKEN_QUERY_PARAM) ?? null,
  });
  if (!auth) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = await externalMovieSubtitleResponse(params.id, auth.userId);
  return withRemotePlaybackCors(response, auth.remote);
};

export const HEAD: RequestHandler = async ({ params, locals, url }) => {
  const auth = authorizedUserId({
    localsUserId: locals.user?.id,
    subtitleTrackId: params.id,
    token: url?.searchParams.get(REMOTE_PLAYBACK_TOKEN_QUERY_PARAM) ?? null,
  });
  if (!auth) {
    return new Response(null, { status: 401 });
  }

  const response = await externalMovieSubtitleResponse(
    params.id,
    auth.userId,
    false,
  );
  return withRemotePlaybackCors(response, auth.remote);
};

export const OPTIONS: RequestHandler = async () =>
  remotePlaybackOptionsResponse();
