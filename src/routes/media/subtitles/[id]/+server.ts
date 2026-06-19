import { externalMovieSubtitleResponse } from "$lib/server/media/subtitles";
import { authorizeSubtitleMedia } from "$lib/server/shares/media-auth";
import { signedPlaybackOptionsResponse, withSignedPlaybackHeaders } from "$lib/server/playback/signed-token";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals, request, url }) => {
  const auth = await authorizeSubtitleMedia({
    localsUserId: locals.user?.id,
    subtitleTrackId: params.id,
    url,
  });
  if (!auth) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = await externalMovieSubtitleResponse(params.id, auth.userId, true, request?.signal);
  return withSignedPlaybackHeaders(response, auth.signed);
};

export const HEAD: RequestHandler = async ({ params, locals, request, url }) => {
  const auth = await authorizeSubtitleMedia({
    localsUserId: locals.user?.id,
    subtitleTrackId: params.id,
    url,
  });
  if (!auth) {
    return new Response(null, { status: 401 });
  }

  const response = await externalMovieSubtitleResponse(params.id, auth.userId, false, request?.signal);
  return withSignedPlaybackHeaders(response, auth.signed);
};

export const OPTIONS: RequestHandler = async () => signedPlaybackOptionsResponse();
