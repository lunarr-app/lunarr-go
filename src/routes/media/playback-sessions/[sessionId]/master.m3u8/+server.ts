import { authorizePlaybackSessionMedia } from "$lib/server/shares/media-auth";
import {
  SIGNED_PLAYBACK_TOKEN_QUERY_PARAM,
  signedPlaybackOptionsResponse,
  signedPlaybackSegmentQuery,
  withSignedPlaybackHeaders,
} from "$lib/server/playback/signed-token";
import {
  ensureHlsPlaylistOnDisk,
  hlsPlaylistHeadResponse,
  hlsPlaylistResponse,
} from "$lib/server/transcoding/hls";
import { lookupVideoFrameRate } from "$lib/server/transcoding/probe";
import { touchTranscodeSessionHeartbeat } from "$lib/server/transcoding/sessions";
import { requestDrivenHlsSegmentFormat } from "$lib/server/transcoding/playback-lifecycle";
import { apiError } from "$lib/server/api/json";
import {
  currentPlayableHlsArtifact,
  currentUnchangedPlayableHlsArtifact,
  hlsFailedActivityResponse,
} from "../../hls-route-state";
import type { RequestHandler } from "./$types";

function cancelledPlaylistResponse() {
  return apiError("Playback playlist was not found.", 404);
}

function cancelledPlaylistHeadResponse() {
  return new Response(null, { status: 404 });
}

async function regeneratePlaylistFromMetadata(
  artifact: { playlistPath: string; durationSeconds: number | null; startTimeSeconds: number; mediaFileId: string },
  signal?: AbortSignal,
): Promise<boolean> {
  if (!artifact.durationSeconds || artifact.durationSeconds <= 0) return false;
  const videoFrameRate = await lookupVideoFrameRate(artifact.mediaFileId);
  const segmentFormat = requestDrivenHlsSegmentFormat();
  await ensureHlsPlaylistOnDisk({
    playlistPath: artifact.playlistPath,
    durationSeconds: artifact.durationSeconds,
    startTimeSeconds: artifact.startTimeSeconds,
    videoFrameRate,
    segmentFormat,
    signal,
  });
  return true;
}

export const GET: RequestHandler = async ({ params, locals, url, request }) => {
  const auth = await authorizePlaybackSessionMedia({
    localsUserId: locals.user?.id,
    playbackSessionId: params.sessionId,
    url,
  });
  if (!auth) return apiError("Unauthorized", 401);
  const token = url?.searchParams.get(SIGNED_PLAYBACK_TOKEN_QUERY_PARAM) ?? null;

  const artifact = await currentPlayableHlsArtifact(params.sessionId, auth.userId);
  if (artifact instanceof Response) return withSignedPlaybackHeaders(artifact, auth.signed);

  try {
    const response = await hlsPlaylistResponse(artifact.playlistPath, {
      signal: request?.signal,
      segmentQuery: signedPlaybackSegmentQuery(token),
    });
    const current = await currentUnchangedPlayableHlsArtifact({
      sessionId: params.sessionId,
      userId: auth.userId,
      playlistPath: artifact.playlistPath,
      artifact: "playlist",
    });
    if (current instanceof Response) return withSignedPlaybackHeaders(current, auth.signed);
    if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledPlaylistResponse(), auth.signed);

    const touched = await touchTranscodeSessionHeartbeat(params.sessionId, auth.userId, { signal: request?.signal });
    if (!touched) {
      if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledPlaylistResponse(), auth.signed);

      const stale = await hlsFailedActivityResponse({
        sessionId: params.sessionId,
        userId: auth.userId,
        playlistPath: artifact.playlistPath,
        artifact: "playlist",
        allowCompleted: true,
      });
      if (stale) return withSignedPlaybackHeaders(stale, auth.signed);
    }
    if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledPlaylistResponse(), auth.signed);

    return withSignedPlaybackHeaders(response, auth.signed);
  } catch {
    if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledPlaylistResponse(), auth.signed);

    try {
      if (await regeneratePlaylistFromMetadata(artifact, request?.signal)) {
        if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledPlaylistResponse(), auth.signed);
        const response = await hlsPlaylistResponse(artifact.playlistPath, {
          signal: request?.signal,
          segmentQuery: signedPlaybackSegmentQuery(token),
        });
        return withSignedPlaybackHeaders(response, auth.signed);
      }
    } catch {
      if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledPlaylistResponse(), auth.signed);
    }

    return withSignedPlaybackHeaders(apiError("Playback playlist was not found.", 404), auth.signed);
  }
};

export const HEAD: RequestHandler = async ({ params, locals, url, request }) => {
  const auth = await authorizePlaybackSessionMedia({
    localsUserId: locals.user?.id,
    playbackSessionId: params.sessionId,
    url,
  });
  if (!auth) return apiError("Unauthorized", 401);

  const artifact = await currentPlayableHlsArtifact(params.sessionId, auth.userId);
  if (artifact instanceof Response) return withSignedPlaybackHeaders(artifact, auth.signed);

  try {
    let response = await hlsPlaylistHeadResponse(artifact.playlistPath, {
      signal: request?.signal,
    });
    if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledPlaylistHeadResponse(), auth.signed);
    if (response.ok) {
      const current = await currentUnchangedPlayableHlsArtifact({
        sessionId: params.sessionId,
        userId: auth.userId,
        playlistPath: artifact.playlistPath,
        artifact: "playlist",
      });
      if (current instanceof Response) return withSignedPlaybackHeaders(current, auth.signed);
      if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledPlaylistHeadResponse(), auth.signed);
    }
    return withSignedPlaybackHeaders(response, auth.signed);
  } catch {
    if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledPlaylistHeadResponse(), auth.signed);

    try {
      if (await regeneratePlaylistFromMetadata(artifact, request?.signal)) {
        if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledPlaylistHeadResponse(), auth.signed);
        const response = await hlsPlaylistHeadResponse(artifact.playlistPath, {
          signal: request?.signal,
        });
        return withSignedPlaybackHeaders(response, auth.signed);
      }
    } catch {
      if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledPlaylistHeadResponse(), auth.signed);
    }

    return withSignedPlaybackHeaders(new Response(null, { status: 404 }), auth.signed);
  }
};

export const OPTIONS: RequestHandler = async () => signedPlaybackOptionsResponse();
