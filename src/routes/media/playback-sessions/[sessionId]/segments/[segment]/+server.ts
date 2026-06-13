import {
  REMOTE_PLAYBACK_TOKEN_QUERY_PARAM,
  remotePlaybackOptionsResponse,
  verifyRemotePlaybackToken,
  withRemotePlaybackCors,
} from "$lib/server/playback/remote-auth";
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
  if (input.localsUserId) return { userId: input.localsUserId, remote: false };
  const payload = verifyRemotePlaybackToken(input.token, {
    route: "hls",
    playbackSessionId: input.sessionId,
  });
  return payload ? { userId: payload.userId, remote: true } : null;
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
    token: url?.searchParams.get(REMOTE_PLAYBACK_TOKEN_QUERY_PARAM) ?? null,
  });
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await currentPlayableHlsArtifact(
    params.sessionId,
    auth.userId,
    { cancelledResponse: staleCancelledPlaybackSegmentResponse },
  );
  if (artifact instanceof Response)
    return withRemotePlaybackCors(artifact, auth.remote);

  if (hlsSegmentIndex(params.segment) !== null) {
    await touchTranscodeSessionHeartbeat(params.sessionId, auth.userId, {
      signal: request?.signal,
    });
  }

  try {
    let response = await hlsSegmentResponse(
      artifact.playlistPath,
      params.segment,
      {
        signal: request?.signal,
      },
    );
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
          return withRemotePlaybackCors(
            staleCancelledPlaybackSegmentResponse(failedArtifact) ??
              json(
                {
                  error: playbackRouteError(
                    failedArtifact.errorMessage ??
                      "Playback session is not playable.",
                  ),
                },
                { status: 409 },
              ),
            auth.remote,
          );
        }
        if (failedArtifact?.status === "failed") {
          return withRemotePlaybackCors(
            json(
              {
                error: playbackRouteError(
                  failedArtifact.errorMessage ??
                    "Playback session is not playable.",
                ),
              },
              { status: 409 },
            ),
            auth.remote,
          );
        }
        throw new Error("Playback segment generation failed.");
      }
      if (generated) {
        if (request?.signal?.aborted)
          return withRemotePlaybackCors(
            cancelledSegmentResponse(),
            auth.remote,
          );
        response = await hlsSegmentResponse(
          artifact.playlistPath,
          params.segment,
          {
            signal: request?.signal,
          },
        );
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
      if (current instanceof Response)
        return withRemotePlaybackCors(current, auth.remote);
    }
    if (response.ok) {
      const current = await currentUnchangedPlayableHlsArtifact({
        sessionId: params.sessionId,
        userId: auth.userId,
        playlistPath: artifact.playlistPath,
        artifact: "segment",
      });
      if (current instanceof Response)
        return withRemotePlaybackCors(current, auth.remote);
      if (request?.signal?.aborted)
        return withRemotePlaybackCors(cancelledSegmentResponse(), auth.remote);

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
            return withRemotePlaybackCors(
              cancelledSegmentResponse(),
              auth.remote,
            );

          const stale = await hlsFailedActivityResponse({
            sessionId: params.sessionId,
            userId: auth.userId,
            playlistPath: artifact.playlistPath,
            artifact: "segment",
            allowCompleted: true,
          });
          if (stale) return withRemotePlaybackCors(stale, auth.remote);
        }
        if (request?.signal?.aborted)
          return withRemotePlaybackCors(
            cancelledSegmentResponse(),
            auth.remote,
          );

        void ensureHlsLookaheadForSegment({
          sessionId: params.sessionId,
          userId: auth.userId,
          segment: params.segment,
        }).catch(() => undefined);
        void pruneHlsSegmentsBehind(
          artifact.playlistPath,
          params.segment,
        ).catch(() => undefined);
      }
    }
    return withRemotePlaybackCors(response, auth.remote);
  } catch {
    if (request?.signal?.aborted)
      return withRemotePlaybackCors(cancelledSegmentResponse(), auth.remote);
    return withRemotePlaybackCors(
      json({ error: "Playback segment was not found." }, { status: 404 }),
      auth.remote,
    );
  }
};

export const HEAD: RequestHandler = async ({
  params,
  locals,
  request,
  url,
}) => {
  const auth = authorizedUserId({
    localsUserId: locals.user?.id,
    sessionId: params.sessionId,
    token: url?.searchParams.get(REMOTE_PLAYBACK_TOKEN_QUERY_PARAM) ?? null,
  });
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await currentPlayableHlsArtifact(
    params.sessionId,
    auth.userId,
    { cancelledResponse: staleCancelledPlaybackSegmentResponse },
  );
  if (artifact instanceof Response)
    return withRemotePlaybackCors(artifact, auth.remote);

  let response: Response;
  try {
    response = await hlsSegmentHeadResponse(
      artifact.playlistPath,
      params.segment,
      {
        signal: request?.signal,
      },
    );
  } catch {
    if (request?.signal?.aborted)
      return withRemotePlaybackCors(
        cancelledSegmentHeadResponse(),
        auth.remote,
      );
    return withRemotePlaybackCors(
      new Response(null, { status: 404 }),
      auth.remote,
    );
  }
  if (request?.signal?.aborted)
    return withRemotePlaybackCors(cancelledSegmentHeadResponse(), auth.remote);
  if (response.ok) {
    const current = await currentUnchangedPlayableHlsArtifact({
      sessionId: params.sessionId,
      userId: auth.userId,
      playlistPath: artifact.playlistPath,
      artifact: "segment",
    });
    if (current instanceof Response)
      return withRemotePlaybackCors(current, auth.remote);
    if (request?.signal?.aborted)
      return withRemotePlaybackCors(
        cancelledSegmentHeadResponse(),
        auth.remote,
      );
  }
  return withRemotePlaybackCors(response, auth.remote);
};

export const OPTIONS: RequestHandler = async () =>
  remotePlaybackOptionsResponse();
