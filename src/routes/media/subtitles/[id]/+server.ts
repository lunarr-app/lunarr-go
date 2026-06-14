import { externalMovieSubtitleResponse } from "$lib/server/media/subtitles";
import {
  SIGNED_PLAYBACK_TOKEN_QUERY_PARAM,
  signedPlaybackOptionsResponse,
  verifySignedPlaybackToken,
  withSignedPlaybackHeaders,
} from "$lib/server/playback/signed-token";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

function authorizedUserId(input: { localsUserId?: string; subtitleTrackId: string; token: string | null }) {
  if (input.localsUserId) return { userId: input.localsUserId, signed: false };
  const payload = verifySignedPlaybackToken(input.token, {
    route: "subtitle",
    subtitleTrackId: input.subtitleTrackId,
  });
  return payload ? { userId: payload.userId, signed: true } : null;
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const auth = authorizedUserId({
    localsUserId: locals.user?.id,
    subtitleTrackId: params.id,
    token: url?.searchParams.get(SIGNED_PLAYBACK_TOKEN_QUERY_PARAM) ?? null,
  });
  if (!auth) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = await externalMovieSubtitleResponse(params.id, auth.userId);
  return withSignedPlaybackHeaders(response, auth.signed);
};

export const HEAD: RequestHandler = async ({ params, locals, url }) => {
  const auth = authorizedUserId({
    localsUserId: locals.user?.id,
    subtitleTrackId: params.id,
    token: url?.searchParams.get(SIGNED_PLAYBACK_TOKEN_QUERY_PARAM) ?? null,
  });
  if (!auth) {
    return new Response(null, { status: 401 });
  }

  const response = await externalMovieSubtitleResponse(params.id, auth.userId, false);
  return withSignedPlaybackHeaders(response, auth.signed);
};

export const OPTIONS: RequestHandler = async () => signedPlaybackOptionsResponse();
