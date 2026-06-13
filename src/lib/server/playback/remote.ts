import { getDb } from "$lib/server/db";
import { getMediaFile } from "$lib/server/media";
import { mediaContentTypeForExtension } from "$lib/server/media/stream";
import {
  absoluteCastUrl,
  appendCastToken,
  createCastPlaybackToken,
  type CastPlaybackRoute,
} from "$lib/server/playback/cast";
import { getAuthorizedHlsArtifact } from "$lib/server/transcoding/sessions";

export type RemotePlaybackRequest = {
  mediaItemId?: unknown;
  mediaFileId?: unknown;
  playbackSessionId?: unknown;
  mode?: unknown;
  subtitleTrackIds?: unknown;
};

export type RemotePlaybackResponse = {
  streamUrl: string;
  contentType: string;
  title: string | null;
  durationSeconds: number | null;
  playbackSessionId: string | null;
  tracks: {
    id: string;
    label: string;
    language: string;
    default: boolean;
    src: string;
  }[];
};

export class RemotePlaybackRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RemotePlaybackRequestError";
    this.status = status;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArrayValue(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
}

function hlsContentType() {
  return "application/vnd.apple.mpegurl";
}

function absoluteRemoteUrl(pathname: string, token: string, origin?: string) {
  if (!origin) return absoluteCastUrl(pathname, token);
  return new URL(appendCastToken(pathname, token), origin).toString();
}

async function subtitleTracks(input: {
  mediaItemId: string;
  mediaFileId: string;
  ids: string[];
}) {
  if (input.ids.length === 0) return [];
  const uniqueIds = [...new Set(input.ids)];
  const db = await getDb();
  return db
    .selectFrom("subtitle_track")
    .select(["id", "label", "language", "is_default"])
    .where("id", "in", uniqueIds)
    .where("media_item_id", "=", input.mediaItemId)
    .where((eb) =>
      eb.or([
        eb("media_file_id", "is", null),
        eb("media_file_id", "=", input.mediaFileId),
      ]),
    )
    .where("source_kind", "=", "external")
    .orderBy("is_default", "desc")
    .orderBy("label", "asc")
    .execute();
}

export async function prepareRemotePlayback(input: {
  request: RemotePlaybackRequest;
  userId: string;
  label: "AirPlay" | "Cast";
  origin?: string;
}): Promise<RemotePlaybackResponse> {
  const mediaItemId = stringValue(input.request.mediaItemId);
  const mediaFileId = stringValue(input.request.mediaFileId);
  const mode =
    input.request.mode === "remux" || input.request.mode === "transcode"
      ? input.request.mode
      : input.request.mode === "direct"
        ? "direct"
        : null;
  if (!mediaItemId || !mediaFileId || !mode) {
    throw new RemotePlaybackRequestError(
      `${input.label} playback request is incomplete.`,
      400,
    );
  }

  const file = await getMediaFile(mediaFileId, input.userId);
  if (!file || file.media_item_id !== mediaItemId) {
    throw new RemotePlaybackRequestError("Playable item not found.", 404);
  }

  let route: CastPlaybackRoute;
  let streamPath: string;
  let playbackSessionId: string | null = null;
  if (mode === "direct") {
    route = "direct";
    streamPath = `/media/files/${encodeURIComponent(mediaFileId)}/stream`;
  } else {
    const requestedSessionId = stringValue(input.request.playbackSessionId);
    if (!requestedSessionId) {
      throw new RemotePlaybackRequestError(
        `${input.label} HLS playback requires a session.`,
        400,
      );
    }
    const artifact = await getAuthorizedHlsArtifact(
      requestedSessionId,
      input.userId,
    );
    if (!artifact || artifact.mediaFileId !== mediaFileId) {
      throw new RemotePlaybackRequestError("Playback session not found.", 404);
    }
    route = "hls";
    playbackSessionId = requestedSessionId;
    streamPath = `/media/playback-sessions/${encodeURIComponent(requestedSessionId)}/master.m3u8`;
  }

  const streamToken = createCastPlaybackToken({
    route,
    userId: input.userId,
    mediaFileId,
    playbackSessionId: playbackSessionId ?? undefined,
  });
  const tracks = await subtitleTracks({
    mediaItemId,
    mediaFileId,
    ids: stringArrayValue(input.request.subtitleTrackIds),
  });

  return {
    streamUrl: absoluteRemoteUrl(streamPath, streamToken, input.origin),
    contentType:
      route === "hls"
        ? hlsContentType()
        : mediaContentTypeForExtension(file.extension),
    title: file.title,
    durationSeconds: file.duration_seconds,
    playbackSessionId,
    tracks: tracks.map((track) => {
      const token = createCastPlaybackToken({
        route: "subtitle",
        userId: input.userId,
        mediaFileId,
        subtitleTrackId: track.id,
      });
      return {
        id: track.id,
        label: track.label,
        language: track.language,
        default: Boolean(track.is_default),
        src: absoluteRemoteUrl(
          `/media/subtitles/${encodeURIComponent(track.id)}`,
          token,
          input.origin,
        ),
      };
    }),
  };
}
