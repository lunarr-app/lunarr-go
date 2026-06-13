import {
  CAST_TOKEN_QUERY_PARAM,
  castOptionsResponse,
  castSegmentQuery,
  verifyCastPlaybackToken,
  withCastCors,
} from "$lib/server/playback/cast";
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
  const token = url?.searchParams.get(CAST_TOKEN_QUERY_PARAM) ?? null;
  const auth = authorizedUserId({
    localsUserId: locals.user?.id,
    sessionId: params.sessionId,
    token,
  });
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await currentPlayableHlsArtifact(
    params.sessionId,
    auth.userId,
  );
  if (artifact instanceof Response) return withCastCors(artifact, auth.cast);

  if (
    url?.searchParams.get("playlist") === "virtual" ||
    shouldServeVirtualPlaylistByDefault(artifact)
  ) {
    if (artifact.status !== "running") {
      return json(
        { error: "Virtual HLS playlist is not available for this session." },
        { status: 409 },
      );
    }
    if (!(await hlsPlaylistFileExists(artifact.playlistPath))) {
      return json({ error: "Playback playlist was not found." }, { status: 404 });
    }
    if (!artifact.durationSeconds || artifact.durationSeconds <= 0) {
      return json(
        { error: "Virtual HLS playlist requires known media duration." },
        { status: 409 },
      );
    }
    const segmentFormat = await hlsPlaylistSegmentFormat(
      artifact.playlistPath,
      { signal: request?.signal },
    );
    const current = await currentUnchangedPlayableHlsArtifact({
      sessionId: params.sessionId,
      userId: auth.userId,
      playlistPath: artifact.playlistPath,
      artifact: "playlist",
    });
    if (current instanceof Response) return withCastCors(current, auth.cast);
    if (request?.signal?.aborted)
      return withCastCors(cancelledPlaylistResponse(), auth.cast);

    const touched = await touchTranscodeSessionHeartbeat(
      params.sessionId,
      auth.userId,
      { signal: request?.signal },
    );
    if (!touched) {
      if (request?.signal?.aborted)
        return withCastCors(cancelledPlaylistResponse(), auth.cast);

      const stale = await hlsFailedActivityResponse({
        sessionId: params.sessionId,
        userId: auth.userId,
        playlistPath: artifact.playlistPath,
        artifact: "playlist",
        allowCompleted: false,
        notReadyMessage:
          "Virtual HLS playlist is not available for this session.",
      });
      if (stale) return withCastCors(stale, auth.cast);
    }
    if (request?.signal?.aborted)
      return withCastCors(cancelledPlaylistResponse(), auth.cast);

    return withCastCors(virtualHlsPlaylistResponse({
      durationSeconds: artifact.durationSeconds,
      startTimeSeconds: artifact.startTimeSeconds,
      segmentFormat,
      segmentQuery: castSegmentQuery(token),
    }), auth.cast);
  }

  try {
    const response = await hlsPlaylistResponse(artifact.playlistPath, {
      signal: request?.signal,
      segmentQuery: castSegmentQuery(token),
    });
    const current = await currentUnchangedPlayableHlsArtifact({
      sessionId: params.sessionId,
      userId: auth.userId,
      playlistPath: artifact.playlistPath,
      artifact: "playlist",
    });
    if (current instanceof Response) return withCastCors(current, auth.cast);
    if (request?.signal?.aborted)
      return withCastCors(cancelledPlaylistResponse(), auth.cast);

    const touched = await touchTranscodeSessionHeartbeat(
      params.sessionId,
      auth.userId,
      { signal: request?.signal },
    );
    if (!touched) {
      if (request?.signal?.aborted)
        return withCastCors(cancelledPlaylistResponse(), auth.cast);

      const stale = await hlsFailedActivityResponse({
        sessionId: params.sessionId,
        userId: auth.userId,
        playlistPath: artifact.playlistPath,
        artifact: "playlist",
        allowCompleted: true,
      });
      if (stale) return withCastCors(stale, auth.cast);
    }
    if (request?.signal?.aborted)
      return withCastCors(cancelledPlaylistResponse(), auth.cast);

    return withCastCors(response, auth.cast);
  } catch {
    if (request?.signal?.aborted)
      return withCastCors(cancelledPlaylistResponse(), auth.cast);
    return withCastCors(json({ error: "Playback playlist was not found." }, { status: 404 }), auth.cast);
  }
};

export const HEAD: RequestHandler = async ({ params, locals, url, request }) => {
  const token = url?.searchParams.get(CAST_TOKEN_QUERY_PARAM) ?? null;
  const auth = authorizedUserId({
    localsUserId: locals.user?.id,
    sessionId: params.sessionId,
    token,
  });
  if (!auth) return json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await currentPlayableHlsArtifact(
    params.sessionId,
    auth.userId,
  );
  if (artifact instanceof Response) return withCastCors(artifact, auth.cast);

  if (
    url?.searchParams.get("playlist") === "virtual" ||
    shouldServeVirtualPlaylistByDefault(artifact)
  ) {
    if (artifact.status !== "running") {
      return json(
        { error: "Virtual HLS playlist is not available for this session." },
        { status: 409 },
      );
    }
    if (!(await hlsPlaylistFileExists(artifact.playlistPath))) {
      return new Response(null, { status: 404 });
    }
    if (!artifact.durationSeconds || artifact.durationSeconds <= 0) {
      return json(
        { error: "Virtual HLS playlist requires known media duration." },
        { status: 409 },
      );
    }
    const current = await currentUnchangedPlayableHlsArtifact({
      sessionId: params.sessionId,
      userId: auth.userId,
      playlistPath: artifact.playlistPath,
      artifact: "playlist",
    });
    if (current instanceof Response) return withCastCors(current, auth.cast);
    if (request?.signal?.aborted)
      return withCastCors(cancelledPlaylistHeadResponse(), auth.cast);

    return withCastCors(virtualHlsPlaylistHeadResponse(), auth.cast);
  }

  let response: Response;
  try {
    response = await hlsPlaylistHeadResponse(artifact.playlistPath, {
      signal: request?.signal,
    });
  } catch {
    if (request?.signal?.aborted)
      return withCastCors(cancelledPlaylistHeadResponse(), auth.cast);
    return withCastCors(new Response(null, { status: 404 }), auth.cast);
  }
  if (request?.signal?.aborted)
    return withCastCors(cancelledPlaylistHeadResponse(), auth.cast);
  if (response.ok) {
    const current = await currentUnchangedPlayableHlsArtifact({
      sessionId: params.sessionId,
      userId: auth.userId,
      playlistPath: artifact.playlistPath,
      artifact: "playlist",
    });
    if (current instanceof Response) return withCastCors(current, auth.cast);
    if (request?.signal?.aborted)
      return withCastCors(cancelledPlaylistHeadResponse(), auth.cast);
  }
  return withCastCors(response, auth.cast);
};

export const OPTIONS: RequestHandler = async () => castOptionsResponse();
