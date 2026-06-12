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

export const GET: RequestHandler = async ({ params, locals, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await currentPlayableHlsArtifact(
    params.sessionId,
    locals.user.id,
    { cancelledResponse: staleCancelledPlaybackSegmentResponse },
  );
  if (artifact instanceof Response) return artifact;

  if (hlsSegmentIndex(params.segment) !== null) {
    await touchTranscodeSessionHeartbeat(params.sessionId, locals.user.id, {
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
          userId: locals.user.id,
          segment: params.segment,
          signal: request?.signal,
        });
      } catch {
        const failedArtifact = await getAuthorizedHlsArtifact(
          params.sessionId,
          locals.user.id,
        );
        if (failedArtifact?.status === "cancelled") {
          return (
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
            )
          );
        }
        if (failedArtifact?.status === "failed") {
          return json(
            {
              error:
                playbackRouteError(
                  failedArtifact.errorMessage ??
                    "Playback session is not playable.",
                ),
            },
            { status: 409 },
          );
        }
        throw new Error("Playback segment generation failed.");
      }
      if (generated) {
        if (request?.signal?.aborted) return cancelledSegmentResponse();
        response = await hlsSegmentResponse(artifact.playlistPath, params.segment, {
          signal: request?.signal,
        });
      }
    }
    if (response.status === 404) {
      const current = await currentUnchangedPlayableHlsArtifact({
        sessionId: params.sessionId,
        userId: locals.user.id,
        playlistPath: artifact.playlistPath,
        artifact: "segment",
        options: { cancelledResponse: staleCancelledPlaybackSegmentResponse },
      });
      if (current instanceof Response) return current;
    }
    if (response.ok) {
      const current = await currentUnchangedPlayableHlsArtifact({
        sessionId: params.sessionId,
        userId: locals.user.id,
        playlistPath: artifact.playlistPath,
        artifact: "segment",
      });
      if (current instanceof Response) return current;
      if (request?.signal?.aborted) return cancelledSegmentResponse();

      const segmentIndex = hlsSegmentIndex(params.segment);
      if (segmentIndex !== null) {
        const touched = await touchTranscodeSessionSegmentRequest(
          params.sessionId,
          locals.user.id,
          params.segment,
          { signal: request?.signal },
        );
        if (!touched) {
          if (request?.signal?.aborted) return cancelledSegmentResponse();

          const stale = await hlsFailedActivityResponse({
            sessionId: params.sessionId,
            userId: locals.user.id,
            playlistPath: artifact.playlistPath,
            artifact: "segment",
            allowCompleted: true,
          });
          if (stale) return stale;
        }
        if (request?.signal?.aborted) return cancelledSegmentResponse();

        void ensureHlsLookaheadForSegment({
          sessionId: params.sessionId,
          userId: locals.user.id,
          segment: params.segment,
        }).catch(() => undefined);
        void pruneHlsSegmentsBehind(artifact.playlistPath, params.segment).catch(() => undefined);
      }
    }
    return response;
  } catch {
    if (request?.signal?.aborted) return cancelledSegmentResponse();
    return json({ error: "Playback segment was not found." }, { status: 404 });
  }
};

export const HEAD: RequestHandler = async ({ params, locals, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await currentPlayableHlsArtifact(
    params.sessionId,
    locals.user.id,
    { cancelledResponse: staleCancelledPlaybackSegmentResponse },
  );
  if (artifact instanceof Response) return artifact;

  let response: Response;
  try {
    response = await hlsSegmentHeadResponse(artifact.playlistPath, params.segment, {
      signal: request?.signal,
    });
  } catch {
    if (request?.signal?.aborted) return cancelledSegmentHeadResponse();
    return new Response(null, { status: 404 });
  }
  if (request?.signal?.aborted) return cancelledSegmentHeadResponse();
  if (response.ok) {
    const current = await currentUnchangedPlayableHlsArtifact({
      sessionId: params.sessionId,
      userId: locals.user.id,
      playlistPath: artifact.playlistPath,
      artifact: "segment",
    });
    if (current instanceof Response) return current;
    if (request?.signal?.aborted) return cancelledSegmentHeadResponse();
  }
  return response;
};
