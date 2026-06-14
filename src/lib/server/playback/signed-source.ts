import {
  absoluteSignedPlaybackUrl,
  appendSignedPlaybackToken,
  createSignedPlaybackToken,
  type SignedPlaybackRoute,
} from "$lib/server/playback/signed-token";
import { hlsPlaylistFileExists } from "$lib/server/transcoding/hls";
import {
  getAuthorizedHlsArtifact,
  isEndedPlaybackArtifactFresh,
} from "$lib/server/transcoding/sessions";
import type { PlaybackData, PlaybackDecision } from "$lib/server/playback";

export class PlaybackSourceRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PlaybackSourceRequestError";
    this.status = status;
  }
}

function absoluteSignedUrl(pathname: string, token: string, origin?: string) {
  if (!origin) return absoluteSignedPlaybackUrl(pathname, token);
  return new URL(appendSignedPlaybackToken(pathname, token), origin).toString();
}

async function assertSignedHlsReady(input: {
  artifact: Awaited<ReturnType<typeof getAuthorizedHlsArtifact>>;
}) {
  const { artifact } = input;
  if (!artifact) {
    throw new PlaybackSourceRequestError("Playback session not found.", 404);
  }
  if (artifact.status === "failed" || artifact.status === "cancelled") {
    throw new PlaybackSourceRequestError(
      artifact.errorMessage ?? "Playback stream is not playable.",
      409,
    );
  }
  if (artifact.status !== "running" && artifact.status !== "completed") {
    throw new PlaybackSourceRequestError("Playback stream is not ready yet.", 409);
  }
  if (artifact.status === "completed" && !isEndedPlaybackArtifactFresh(artifact)) {
    throw new PlaybackSourceRequestError(
      "Playback stream is no longer active.",
      410,
    );
  }
  if (!artifact.playlistPath) {
    throw new PlaybackSourceRequestError("Playback stream is not ready yet.", 409);
  }
  if (!(await hlsPlaylistFileExists(artifact.playlistPath))) {
    throw new PlaybackSourceRequestError(
      "Playback playlist is not available yet.",
      409,
    );
  }
}

async function signedPlaybackStreamUrl(input: {
  playback: PlaybackDecision;
  userId: string;
  origin: string;
}) {
  const { playback } = input;
  let route: SignedPlaybackRoute;
  let streamPath: string;
  let playbackSessionId: string | undefined;

  if (playback.mode === "direct") {
    route = "direct";
    streamPath = `/media/files/${encodeURIComponent(playback.file.id)}/stream`;
  } else if (playback.mode === "remux" || playback.mode === "transcode") {
    if (!playback.playbackSessionId) {
      throw new PlaybackSourceRequestError(
        "HLS playback requires a session.",
        400,
      );
    }
    const artifact = await getAuthorizedHlsArtifact(
      playback.playbackSessionId,
      input.userId,
    );
    if (!artifact || artifact.mediaFileId !== playback.file.id) {
      throw new PlaybackSourceRequestError("Playback session not found.", 404);
    }
    await assertSignedHlsReady({ artifact });
    route = "hls";
    playbackSessionId = playback.playbackSessionId;
    streamPath = `/media/playback-sessions/${encodeURIComponent(playback.playbackSessionId)}/master.m3u8`;
  } else {
    return playback.streamUrl;
  }

  const token = createSignedPlaybackToken({
    route,
    userId: input.userId,
    mediaFileId: playback.file.id,
    playbackSessionId,
  });
  return absoluteSignedUrl(streamPath, token, input.origin);
}

function signedSubtitleSrc(input: {
  trackId: string;
  mediaFileId: string;
  userId: string;
  origin: string;
}) {
  const token = createSignedPlaybackToken({
    route: "subtitle",
    userId: input.userId,
    mediaFileId: input.mediaFileId,
    subtitleTrackId: input.trackId,
  });
  return absoluteSignedUrl(
    `/media/subtitles/${encodeURIComponent(input.trackId)}`,
    token,
    input.origin,
  );
}

export async function withSignedPlaybackSource(input: {
  data: PlaybackData;
  userId: string;
  origin: string;
}): Promise<PlaybackData> {
  const playback = input.data.playback;
  if (playback.status !== "ready" || !playback.streamUrl) return input.data;

  return {
    ...input.data,
    playback: {
      ...playback,
      streamUrl: await signedPlaybackStreamUrl({
        playback,
        userId: input.userId,
        origin: input.origin,
      }),
      tracks: playback.tracks.map((track) => ({
        ...track,
        src: signedSubtitleSrc({
          trackId: track.id,
          mediaFileId: playback.file.id,
          userId: input.userId,
          origin: input.origin,
        }),
      })),
    },
  };
}
