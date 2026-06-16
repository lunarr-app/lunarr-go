import {
  SIGNED_PLAYBACK_TOKEN_QUERY_PARAM,
  signedPlaybackOptionsResponse,
  verifySignedPlaybackToken,
  withSignedPlaybackHeaders,
} from "$lib/server/playback/signed-token";
import {
  hlsSegmentIndex,
  hlsSegmentHeadResponse,
  hlsSegmentResponse,
  pruneHlsSegmentsBehind,
} from "$lib/server/transcoding/hls";
import { getPlaybackCacheBindingForSession } from "$lib/server/transcoding/cache";
import { ensureHlsLookaheadForSegment, ensureHlsSegmentForRequest } from "$lib/server/transcoding/manager";
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

function authorizedUserId(input: { localsUserId?: string; sessionId: string; token: string | null }) {
  if (input.localsUserId) return { userId: input.localsUserId, signed: false };
  const payload = verifySignedPlaybackToken(input.token, {
    route: "hls",
    playbackSessionId: input.sessionId,
  });
  return payload ? { userId: payload.userId, signed: true } : null;
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

function staleCancelledPlaybackSegmentResponse(artifact: AuthorizedHlsArtifact) {
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
    token: url?.searchParams.get(SIGNED_PLAYBACK_TOKEN_QUERY_PARAM) ?? null,
  });
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await currentPlayableHlsArtifact(params.sessionId, auth.userId, {
    cancelledResponse: staleCancelledPlaybackSegmentResponse,
  });
  if (artifact instanceof Response) return withSignedPlaybackHeaders(artifact, auth.signed);

  if (hlsSegmentIndex(params.segment) !== null) {
    await touchTranscodeSessionHeartbeat(params.sessionId, auth.userId, {
      signal: request?.signal,
    });
  }

  try {
    let response = await hlsSegmentResponse(artifact.playlistPath, params.segment, {
      signal: request?.signal,
      encodeDirectory: artifact.encodeArtifactDirectory,
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
        const failedArtifact = await getAuthorizedHlsArtifact(params.sessionId, auth.userId);
        if (failedArtifact?.status === "cancelled") {
          return withSignedPlaybackHeaders(
            staleCancelledPlaybackSegmentResponse(failedArtifact) ??
              json(
                {
                  error: playbackRouteError(failedArtifact.errorMessage ?? "Playback session is not playable."),
                },
                { status: 409 },
              ),
            auth.signed,
          );
        }
        if (failedArtifact?.status === "failed") {
          return withSignedPlaybackHeaders(
            json(
              {
                error: playbackRouteError(failedArtifact.errorMessage ?? "Playback session is not playable."),
              },
              { status: 409 },
            ),
            auth.signed,
          );
        }
        throw new Error("Playback segment generation failed.");
      }
      if (generated) {
        if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledSegmentResponse(), auth.signed);
        const encodeDirectory =
          (await getPlaybackCacheBindingForSession(params.sessionId)).encodeArtifactDirectory ??
          artifact.encodeArtifactDirectory;
        response = await hlsSegmentResponse(artifact.playlistPath, params.segment, {
          signal: request?.signal,
          encodeDirectory,
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
      if (current instanceof Response) return withSignedPlaybackHeaders(current, auth.signed);
    }
    if (response.ok) {
      const current = await currentUnchangedPlayableHlsArtifact({
        sessionId: params.sessionId,
        userId: auth.userId,
        playlistPath: artifact.playlistPath,
        artifact: "segment",
        options: { cancelledResponse: staleCancelledPlaybackSegmentResponse },
      });
      if (current instanceof Response) return withSignedPlaybackHeaders(current, auth.signed);
      if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledSegmentResponse(), auth.signed);

      const segmentIndex = hlsSegmentIndex(params.segment);
      if (segmentIndex !== null) {
        const touched = await touchTranscodeSessionSegmentRequest(params.sessionId, auth.userId, params.segment, {
          signal: request?.signal,
        });
        if (!touched) {
          if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledSegmentResponse(), auth.signed);

          const stale = await hlsFailedActivityResponse({
            sessionId: params.sessionId,
            userId: auth.userId,
            playlistPath: artifact.playlistPath,
            artifact: "segment",
            allowCompleted: true,
            options: { cancelledResponse: staleCancelledPlaybackSegmentResponse },
          });
          if (stale) return withSignedPlaybackHeaders(stale, auth.signed);
        }
        if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledSegmentResponse(), auth.signed);

        setTimeout(() => {
          void ensureHlsLookaheadForSegment({
            sessionId: params.sessionId,
            userId: auth.userId,
            segment: params.segment,
          }).catch(() => undefined);
        }, 0);
        void pruneHlsSegmentsBehind(artifact.playlistPath, params.segment).catch(() => undefined);
      }
    }
    return withSignedPlaybackHeaders(response, auth.signed);
  } catch {
    if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledSegmentResponse(), auth.signed);
    return withSignedPlaybackHeaders(json({ error: "Playback segment was not found." }, { status: 404 }), auth.signed);
  }
};

export const HEAD: RequestHandler = async ({ params, locals, request, url }) => {
  const auth = authorizedUserId({
    localsUserId: locals.user?.id,
    sessionId: params.sessionId,
    token: url?.searchParams.get(SIGNED_PLAYBACK_TOKEN_QUERY_PARAM) ?? null,
  });
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await currentPlayableHlsArtifact(params.sessionId, auth.userId, {
    cancelledResponse: staleCancelledPlaybackSegmentResponse,
  });
  if (artifact instanceof Response) return withSignedPlaybackHeaders(artifact, auth.signed);

  let response: Response;
  try {
    response = await hlsSegmentHeadResponse(artifact.playlistPath, params.segment, {
      signal: request?.signal,
      encodeDirectory: artifact.encodeArtifactDirectory,
    });
  } catch {
    if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledSegmentHeadResponse(), auth.signed);
    return withSignedPlaybackHeaders(new Response(null, { status: 404 }), auth.signed);
  }
  if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledSegmentHeadResponse(), auth.signed);
  if (response.ok) {
    const current = await currentUnchangedPlayableHlsArtifact({
      sessionId: params.sessionId,
      userId: auth.userId,
      playlistPath: artifact.playlistPath,
      artifact: "segment",
      options: { cancelledResponse: staleCancelledPlaybackSegmentResponse },
    });
    if (current instanceof Response) return withSignedPlaybackHeaders(current, auth.signed);
    if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledSegmentHeadResponse(), auth.signed);
  }
  return withSignedPlaybackHeaders(response, auth.signed);
};

export const OPTIONS: RequestHandler = async () => signedPlaybackOptionsResponse();
