import { getDb } from "$lib/server/db";
import { getMediaFile } from "$lib/server/media";
import { mediaContentTypeForExtension } from "$lib/server/media/stream";
import {
  absoluteCastUrl,
  createCastPlaybackToken,
  type CastPlaybackRoute,
} from "$lib/server/playback/cast";
import { getAuthorizedHlsArtifact } from "$lib/server/transcoding/sessions";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type CastPlaybackRequest = {
  mediaItemId?: unknown;
  mediaFileId?: unknown;
  playbackSessionId?: unknown;
  mode?: unknown;
  subtitleTrackIds?: unknown;
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArrayValue(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.length > 0,
  );
}

function hlsContentType() {
  return "application/vnd.apple.mpegurl";
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

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = locals.user.id;

  let body: CastPlaybackRequest;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const mediaItemId = stringValue(body.mediaItemId);
  const mediaFileId = stringValue(body.mediaFileId);
  const mode =
    body.mode === "remux" || body.mode === "transcode"
      ? body.mode
      : body.mode === "direct"
        ? "direct"
        : null;
  if (!mediaItemId || !mediaFileId || !mode) {
    return json(
      { error: "Cast playback request is incomplete." },
      { status: 400 },
    );
  }

  const file = await getMediaFile(mediaFileId, userId);
  if (!file || file.media_item_id !== mediaItemId) {
    return json({ error: "Playable item not found." }, { status: 404 });
  }

  let route: CastPlaybackRoute;
  let streamPath: string;
  let playbackSessionId: string | null = null;
  if (mode === "direct") {
    route = "direct";
    streamPath = `/media/files/${encodeURIComponent(mediaFileId)}/stream`;
  } else {
    const requestedSessionId = stringValue(body.playbackSessionId);
    if (!requestedSessionId) {
      return json(
        { error: "Cast HLS playback requires a session." },
        { status: 400 },
      );
    }
    const artifact = await getAuthorizedHlsArtifact(requestedSessionId, userId);
    if (!artifact || artifact.mediaFileId !== mediaFileId) {
      return json({ error: "Playback session not found." }, { status: 404 });
    }
    route = "hls";
    playbackSessionId = requestedSessionId;
    streamPath = `/media/playback-sessions/${encodeURIComponent(requestedSessionId)}/master.m3u8`;
  }

  const streamToken = createCastPlaybackToken({
    route,
    userId,
    mediaFileId,
    playbackSessionId: playbackSessionId ?? undefined,
  });
  const tracks = await subtitleTracks({
    mediaItemId,
    mediaFileId,
    ids: stringArrayValue(body.subtitleTrackIds),
  });

  return json({
    streamUrl: absoluteCastUrl(streamPath, streamToken),
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
        userId,
        mediaFileId,
        subtitleTrackId: track.id,
      });
      return {
        id: track.id,
        label: track.label,
        language: track.language,
        default: Boolean(track.is_default),
        src: absoluteCastUrl(
          `/media/subtitles/${encodeURIComponent(track.id)}`,
          token,
        ),
      };
    }),
  });
};
