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

export const GET: RequestHandler = async ({ params, locals, url, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await currentPlayableHlsArtifact(
    params.sessionId,
    locals.user.id,
  );
  if (artifact instanceof Response) return artifact;

  if (url?.searchParams.get("playlist") === "virtual") {
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
      userId: locals.user.id,
      playlistPath: artifact.playlistPath,
      artifact: "playlist",
    });
    if (current instanceof Response) return current;
    if (request?.signal?.aborted) return cancelledPlaylistResponse();

    const touched = await touchTranscodeSessionHeartbeat(
      params.sessionId,
      locals.user.id,
      { signal: request?.signal },
    );
    if (!touched) {
      if (request?.signal?.aborted) return cancelledPlaylistResponse();

      const stale = await hlsFailedActivityResponse({
        sessionId: params.sessionId,
        userId: locals.user.id,
        playlistPath: artifact.playlistPath,
        artifact: "playlist",
        allowCompleted: false,
        notReadyMessage:
          "Virtual HLS playlist is not available for this session.",
      });
      if (stale) return stale;
    }
    if (request?.signal?.aborted) return cancelledPlaylistResponse();

    return virtualHlsPlaylistResponse({
      durationSeconds: artifact.durationSeconds,
      startTimeSeconds: artifact.startTimeSeconds,
      segmentFormat,
    });
  }

  try {
    const response = await hlsPlaylistResponse(artifact.playlistPath, {
      signal: request?.signal,
    });
    const current = await currentUnchangedPlayableHlsArtifact({
      sessionId: params.sessionId,
      userId: locals.user.id,
      playlistPath: artifact.playlistPath,
      artifact: "playlist",
    });
    if (current instanceof Response) return current;
    if (request?.signal?.aborted) return cancelledPlaylistResponse();

    const touched = await touchTranscodeSessionHeartbeat(
      params.sessionId,
      locals.user.id,
      { signal: request?.signal },
    );
    if (!touched) {
      if (request?.signal?.aborted) return cancelledPlaylistResponse();

      const stale = await hlsFailedActivityResponse({
        sessionId: params.sessionId,
        userId: locals.user.id,
        playlistPath: artifact.playlistPath,
        artifact: "playlist",
        allowCompleted: true,
      });
      if (stale) return stale;
    }
    if (request?.signal?.aborted) return cancelledPlaylistResponse();

    return response;
  } catch {
    if (request?.signal?.aborted) return cancelledPlaylistResponse();
    return json({ error: "Playback playlist was not found." }, { status: 404 });
  }
};

export const HEAD: RequestHandler = async ({ params, locals, url, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, { status: 401 });

  const artifact = await currentPlayableHlsArtifact(
    params.sessionId,
    locals.user.id,
  );
  if (artifact instanceof Response) return artifact;

  if (url?.searchParams.get("playlist") === "virtual") {
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
      userId: locals.user.id,
      playlistPath: artifact.playlistPath,
      artifact: "playlist",
    });
    if (current instanceof Response) return current;
    if (request?.signal?.aborted) return cancelledPlaylistHeadResponse();

    return virtualHlsPlaylistHeadResponse();
  }

  let response: Response;
  try {
    response = await hlsPlaylistHeadResponse(artifact.playlistPath, {
      signal: request?.signal,
    });
  } catch {
    if (request?.signal?.aborted) return cancelledPlaylistHeadResponse();
    return new Response(null, { status: 404 });
  }
  if (request?.signal?.aborted) return cancelledPlaylistHeadResponse();
  if (response.ok) {
    const current = await currentUnchangedPlayableHlsArtifact({
      sessionId: params.sessionId,
      userId: locals.user.id,
      playlistPath: artifact.playlistPath,
      artifact: "playlist",
    });
    if (current instanceof Response) return current;
    if (request?.signal?.aborted) return cancelledPlaylistHeadResponse();
  }
  return response;
};
