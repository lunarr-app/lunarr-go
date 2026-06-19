import { authorizeDirectMediaStream } from "$lib/server/shares/media-auth";
import { signedPlaybackOptionsResponse, withSignedPlaybackHeaders } from "$lib/server/playback/signed-token";
import { mediaStreamHeadResponse, mediaStreamResponse } from "$lib/server/media/stream";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, request, locals, url }) => {
  const auth = await authorizeDirectMediaStream({
    localsUserId: locals.user?.id,
    mediaFileId: params.id,
    url,
  });
  if (!auth) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = await mediaStreamResponse(params.id, auth.userId, request.headers.get("range"), request.signal);
  return withSignedPlaybackHeaders(response, auth.signed);
};

export const HEAD: RequestHandler = async ({ params, request, locals, url }) => {
  const auth = await authorizeDirectMediaStream({
    localsUserId: locals.user?.id,
    mediaFileId: params.id,
    url,
  });
  if (!auth) {
    return new Response(null, { status: 401 });
  }

  const response = await mediaStreamHeadResponse(params.id, auth.userId, request.headers.get("range"));
  return withSignedPlaybackHeaders(response, auth.signed);
};

export const OPTIONS: RequestHandler = async () => signedPlaybackOptionsResponse();
