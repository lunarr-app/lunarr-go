import {
  CAST_TOKEN_QUERY_PARAM,
  castOptionsResponse,
  verifyCastPlaybackToken,
  withCastCors,
} from "$lib/server/playback/cast";
import {
  hlsSegmentIndex,
  hlsSegmentHeadResponse,
  hlsSegmentResponse,
  pruneHlsSegmentsBehind,
} from "$lib/server/transcoding/hls";
import {
  ensureHlsLookaheadForSegment,
  ensureHlsSegmentForRequest,
} from "$lib/server/transcoding/manager";
import {
  getAuthorizedHlsArtifact,
  touchTranscodeSessionHeartbeat,
  touchTranscodeSessionSegmentRequest,
  type AuthorizedHlsArtifact,
} from "$lib/server/transcoding/sessions";
import { json } from "@sveltejs/kit";
import {
  currentPlayableHlsArtifact,
  currentUnchangedPlayableHlsArtifact,
  hlsFailedActivityResponse,
  playbackRouteError,
} from "../../../hls-route-state";
import type { RequestHandler } from "./$types";

function authorizedUserId(input: {
  localsUserId?: string;
  sessionId: string;
  token: string | null;
}) {
  if (input.localsUserId) return { userId: input.localsUserId, cast: false };
  const payload = verifyCastPlaybackToken(input.token, {
    route: "hls",
    playbackSessionId: input.sessionId,
  });
  return payload ? { userId: payload.userId, cast: true } : null;
}

function cancelledSegmentResponse() {
  return new Response("Not found.", { status: 404 });
}

function cancelledSegmentHeadResponse() {
  return new Response(null, { status: 404 });
}

function abandonedPlaybackSegmentResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
    },
  });
}

function staleCancelledPlaybackSegmentResponse(
  artifact: AuthorizedHlsArtifact,
) {
  if (
    artifact.errorMessage !== "Playback session was cancelled." &&
    artifact.errorMessage !== "Playback session was repositioned."
  ) {
    return null;
  }
  return abandonedPlaybackSegmentResponse();
}

export const GET: RequestHandler = async ({ params, locals, request, url }) => {
  const auth = authorizedUserId({
    localsUserId: locals.user?.id,
    sessionId: params.sessionId,
    token: url?.searchParams.get(CAST_TOKEN_QUERY_PARAM) ?? null,
  });
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await currentPlayableHlsArtifact(
    params.sessionId,
    auth.userId,
    { cancelledResponse: staleCancelledPlaybackSegmentResponse },
  );
  if (artifact instanceof Response) return withCastCors(artifact, auth.cast);

  if (hlsSegmentIndex(params.segment) !== null) {
    await touchTranscodeSessionHeartbeat(params.sessionId, auth.userId, {
      signal: request?.signal,
    });
  }

  try {
    let response = await hlsSegmentResponse(artifact.playlistPath, params.segment, {
      signal: request?.signal,
    });
    if (response.status === 404) {
      let generated = false;
      try {
        generated = await ensureHlsSegmentForRequest({
          sessionId: params.sessionId,
          userId: auth.userId,
          segment: params.segment,
          signal: request?.signal,
        });
      } catch {
        const failedArtifact = await getAuthorizedHlsArtifact(
          params.sessionId,
          auth.userId,
        );
        if (failedArtifact?.status === "cancelled") {
          return withCastCors(
            staleCancelledPlaybackSegmentResponse(failedArtifact) ??
            json(
              {
                error:
                  playbackRouteError(
                    failedArtifact.errorMessage ??
                      "Playback session is not playable.",
                  ),
              },
              { status: 409 },
            ),
            auth.cast,
          );
        }
        if (failedArtifact?.status === "failed") {
          return withCastCors(json(
            {
              error:
                playbackRouteError(
                  failedArtifact.errorMessage ??
                    "Playback session is not playable.",
                ),
            },
            { status: 409 },
          ), auth.cast);
        }
        throw new Error("Playback segment generation failed.");
      }
      if (generated) {
        if (request?.signal?.aborted)
          return withCastCors(cancelledSegmentResponse(), auth.cast);
        response = await hlsSegmentResponse(artifact.playlistPath, params.segment, {
          signal: request?.signal,
        });
      }
    }
    if (response.status === 404) {
      const current = await currentUnchangedPlayableHlsArtifact({
        sessionId: params.sessionId,
        userId: auth.userId,
        playlistPath: artifact.playlistPath,
        artifact: "segment",
        options: { cancelledResponse: staleCancelledPlaybackSegmentResponse },
      });
      if (current instanceof Response) return withCastCors(current, auth.cast);
    }
    if (response.ok) {
      const current = await currentUnchangedPlayableHlsArtifact({
        sessionId: params.sessionId,
        userId: auth.userId,
        playlistPath: artifact.playlistPath,
        artifact: "segment",
      });
      if (current instanceof Response) return withCastCors(current, auth.cast);
      if (request?.signal?.aborted)
        return withCastCors(cancelledSegmentResponse(), auth.cast);

      const segmentIndex = hlsSegmentIndex(params.segment);
      if (segmentIndex !== null) {
        const touched = await touchTranscodeSessionSegmentRequest(
          params.sessionId,
          auth.userId,
          params.segment,
          { signal: request?.signal },
        );
        if (!touched) {
          if (request?.signal?.aborted)
            return withCastCors(cancelledSegmentResponse(), auth.cast);

          const stale = await hlsFailedActivityResponse({
            sessionId: params.sessionId,
            userId: auth.userId,
            playlistPath: artifact.playlistPath,
            artifact: "segment",
            allowCompleted: true,
          });
          if (stale) return withCastCors(stale, auth.cast);
        }
        if (request?.signal?.aborted)
          return withCastCors(cancelledSegmentResponse(), auth.cast);

        void ensureHlsLookaheadForSegment({
          sessionId: params.sessionId,
          userId: auth.userId,
          segment: params.segment,
        }).catch(() => undefined);
        void pruneHlsSegmentsBehind(artifact.playlistPath, params.segment).catch(() => undefined);
      }
    }
    return withCastCors(response, auth.cast);
  } catch {
    if (request?.signal?.aborted)
      return withCastCors(cancelledSegmentResponse(), auth.cast);
    return withCastCors(json({ error: "Playback segment was not found." }, { status: 404 }), auth.cast);
  }
};

export const HEAD: RequestHandler = async ({ params, locals, request, url }) => {
  const auth = authorizedUserId({
    localsUserId: locals.user?.id,
    sessionId: params.sessionId,
    token: url?.searchParams.get(CAST_TOKEN_QUERY_PARAM) ?? null,
  });
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await currentPlayableHlsArtifact(
    params.sessionId,
    auth.userId,
    { cancelledResponse: staleCancelledPlaybackSegmentResponse },
  );
  if (artifact instanceof Response) return withCastCors(artifact, auth.cast);

  let response: Response;
  try {
    response = await hlsSegmentHeadResponse(artifact.playlistPath, params.segment, {
      signal: request?.signal,
    });
  } catch {
    if (request?.signal?.aborted)
      return withCastCors(cancelledSegmentHeadResponse(), auth.cast);
    return withCastCors(new Response(null, { status: 404 }), auth.cast);
  }
  if (request?.signal?.aborted)
    return withCastCors(cancelledSegmentHeadResponse(), auth.cast);
  if (response.ok) {
    const current = await currentUnchangedPlayableHlsArtifact({
      sessionId: params.sessionId,
      userId: auth.userId,
      playlistPath: artifact.playlistPath,
      artifact: "segment",
    });
    if (current instanceof Response) return withCastCors(current, auth.cast);
    if (request?.signal?.aborted)
      return withCastCors(cancelledSegmentHeadResponse(), auth.cast);
  }
  return withCastCors(response, auth.cast);
};

export const OPTIONS: RequestHandler = async () => castOptionsResponse();
