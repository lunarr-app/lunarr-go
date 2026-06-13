import { externalMovieSubtitleResponse } from "$lib/server/media/subtitles";
import {
  CAST_TOKEN_QUERY_PARAM,
  castOptionsResponse,
  verifyCastPlaybackToken,
  withCastCors,
} from "$lib/server/playback/cast";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

function authorizedUserId(input: {
  localsUserId?: string;
  subtitleTrackId: string;
  token: string | null;
}) {
  if (input.localsUserId) return { userId: input.localsUserId, cast: false };
  const payload = verifyCastPlaybackToken(input.token, {
    route: "subtitle",
    subtitleTrackId: input.subtitleTrackId,
  });
  return payload ? { userId: payload.userId, cast: true } : null;
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const auth = authorizedUserId({
    localsUserId: locals.user?.id,
    subtitleTrackId: params.id,
    token: url?.searchParams.get(CAST_TOKEN_QUERY_PARAM) ?? null,
  });
  if (!auth) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = await externalMovieSubtitleResponse(params.id, auth.userId);
  return withCastCors(response, auth.cast);
};

export const HEAD: RequestHandler = async ({ params, locals, url }) => {
  const auth = authorizedUserId({
    localsUserId: locals.user?.id,
    subtitleTrackId: params.id,
    token: url?.searchParams.get(CAST_TOKEN_QUERY_PARAM) ?? null,
  });
  if (!auth) {
    return new Response(null, { status: 401 });
  }

  const response = await externalMovieSubtitleResponse(
    params.id,
    auth.userId,
    false,
  );
  return withCastCors(response, auth.cast);
};

export const OPTIONS: RequestHandler = async () => castOptionsResponse();
