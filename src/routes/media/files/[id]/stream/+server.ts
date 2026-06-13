import {
  REMOTE_PLAYBACK_TOKEN_QUERY_PARAM,
  remotePlaybackOptionsResponse,
  verifyRemotePlaybackToken,
  withRemotePlaybackCors,
} from "$lib/server/playback/remote-auth";
import {
  mediaStreamHeadResponse,
  mediaStreamResponse,
} from "$lib/server/media/stream";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

function authorizedUserId(input: {
  localsUserId?: string;
  mediaFileId: string;
  token: string | null;
}) {
  if (input.localsUserId) return { userId: input.localsUserId, remote: false };
  const payload = verifyRemotePlaybackToken(input.token, {
    route: "direct",
    mediaFileId: input.mediaFileId,
  });
  return payload ? { userId: payload.userId, remote: true } : null;
}

export const GET: RequestHandler = async ({ params, request, locals, url }) => {
  const auth = authorizedUserId({
    localsUserId: locals.user?.id,
    mediaFileId: params.id,
    token: url?.searchParams.get(REMOTE_PLAYBACK_TOKEN_QUERY_PARAM) ?? null,
  });
  if (!auth) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = await mediaStreamResponse(
    params.id,
    auth.userId,
    request.headers.get("range"),
  );
  return withRemotePlaybackCors(response, auth.remote);
};

export const HEAD: RequestHandler = async ({
  params,
  request,
  locals,
  url,
}) => {
  const auth = authorizedUserId({
    localsUserId: locals.user?.id,
    mediaFileId: params.id,
    token: url?.searchParams.get(REMOTE_PLAYBACK_TOKEN_QUERY_PARAM) ?? null,
  });
  if (!auth) {
    return new Response(null, { status: 401 });
  }

  const response = await mediaStreamHeadResponse(
    params.id,
    auth.userId,
    request.headers.get("range"),
  );
  return withRemotePlaybackCors(response, auth.remote);
};

export const OPTIONS: RequestHandler = async () =>
  remotePlaybackOptionsResponse();
