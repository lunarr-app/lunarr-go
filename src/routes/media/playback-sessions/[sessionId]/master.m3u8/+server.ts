import { authorizePlaybackSessionMedia } from "$lib/server/shares/media-auth";
import {
  SIGNED_PLAYBACK_TOKEN_QUERY_PARAM,
  signedPlaybackOptionsResponse,
  signedPlaybackSegmentQuery,
  withSignedPlaybackHeaders,
} from "$lib/server/playback/signed-token";
import {
  hlsPlaylistFileExists,
  hlsPlaylistHeadResponse,
  hlsPlaylistResponse,
  hlsPlaylistSegmentFormat,
  virtualHlsPlaylistHeadResponse,
  virtualHlsPlaylistResponse,
} from "$lib/server/transcoding/hls";
import { touchTranscodeSessionHeartbeat } from "$lib/server/transcoding/sessions";
import { json } from "@sveltejs/kit";
import {
  currentPlayableHlsArtifact,
  currentUnchangedPlayableHlsArtifact,
  hlsFailedActivityResponse,
} from "../../hls-route-state";
import type { RequestHandler } from "./$types";

function cancelledPlaylistResponse() {
  return json({ error: "Playback playlist was not found." }, { status: 404 });
}

function cancelledPlaylistHeadResponse() {
  return new Response(null, { status: 404 });
}

function shouldServeVirtualPlaylistByDefault(artifact: {
  pipeline: string | null;
  status: string;
  durationSeconds: number | null;
}) {
  return (
    artifact.pipeline === "request_driven" &&
    artifact.status === "running" &&
    Boolean(artifact.durationSeconds && artifact.durationSeconds > 0)
  );
}

export const GET: RequestHandler = async ({ params, locals, url, request }) => {
  const auth = await authorizePlaybackSessionMedia({
    localsUserId: locals.user?.id,
    playbackSessionId: params.sessionId,
    url,
  });
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });
  const token = url?.searchParams.get(SIGNED_PLAYBACK_TOKEN_QUERY_PARAM) ?? null;

  const artifact = await currentPlayableHlsArtifact(params.sessionId, auth.userId);
  if (artifact instanceof Response) return withSignedPlaybackHeaders(artifact, auth.signed);

  if (url?.searchParams.get("playlist") === "virtual" || shouldServeVirtualPlaylistByDefault(artifact)) {
    if (artifact.status !== "running") {
      return json({ error: "Virtual HLS playlist is not available for this session." }, { status: 409 });
    }
    if (!(await hlsPlaylistFileExists(artifact.playlistPath))) {
      return json({ error: "Playback playlist was not found." }, { status: 404 });
    }
    if (!artifact.durationSeconds || artifact.durationSeconds <= 0) {
      return json({ error: "Virtual HLS playlist requires known media duration." }, { status: 409 });
    }
    const segmentFormat = await hlsPlaylistSegmentFormat(artifact.playlistPath, { signal: request?.signal });
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
        allowCompleted: false,
        notReadyMessage: "Virtual HLS playlist is not available for this session.",
      });
      if (stale) return withSignedPlaybackHeaders(stale, auth.signed);
    }
    if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledPlaylistResponse(), auth.signed);

    return withSignedPlaybackHeaders(
      virtualHlsPlaylistResponse({
        durationSeconds: artifact.durationSeconds,
        startTimeSeconds: artifact.startTimeSeconds,
        segmentFormat,
        segmentQuery: signedPlaybackSegmentQuery(token),
      }),
      auth.signed,
    );
  }

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
    return withSignedPlaybackHeaders(json({ error: "Playback playlist was not found." }, { status: 404 }), auth.signed);
  }
};

export const HEAD: RequestHandler = async ({ params, locals, url, request }) => {
  const auth = await authorizePlaybackSessionMedia({
    localsUserId: locals.user?.id,
    playbackSessionId: params.sessionId,
    url,
  });
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await currentPlayableHlsArtifact(params.sessionId, auth.userId);
  if (artifact instanceof Response) return withSignedPlaybackHeaders(artifact, auth.signed);

  if (url?.searchParams.get("playlist") === "virtual" || shouldServeVirtualPlaylistByDefault(artifact)) {
    if (artifact.status !== "running") {
      return json({ error: "Virtual HLS playlist is not available for this session." }, { status: 409 });
    }
    if (!(await hlsPlaylistFileExists(artifact.playlistPath))) {
      return new Response(null, { status: 404 });
    }
    if (!artifact.durationSeconds || artifact.durationSeconds <= 0) {
      return json({ error: "Virtual HLS playlist requires known media duration." }, { status: 409 });
    }
    const current = await currentUnchangedPlayableHlsArtifact({
      sessionId: params.sessionId,
      userId: auth.userId,
      playlistPath: artifact.playlistPath,
      artifact: "playlist",
    });
    if (current instanceof Response) return withSignedPlaybackHeaders(current, auth.signed);
    if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledPlaylistHeadResponse(), auth.signed);

    return withSignedPlaybackHeaders(virtualHlsPlaylistHeadResponse(), auth.signed);
  }

  let response: Response;
  try {
    response = await hlsPlaylistHeadResponse(artifact.playlistPath, {
      signal: request?.signal,
    });
  } catch {
    if (request?.signal?.aborted) return withSignedPlaybackHeaders(cancelledPlaylistHeadResponse(), auth.signed);
    return withSignedPlaybackHeaders(new Response(null, { status: 404 }), auth.signed);
  }
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
};

export const OPTIONS: RequestHandler = async () => signedPlaybackOptionsResponse();
