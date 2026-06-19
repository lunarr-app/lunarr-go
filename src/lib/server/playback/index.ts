import {
  normalizePlaybackTarget,
  parseClientPlaybackCapabilities,
  type ClientPlaybackCapabilities,
  type PlaybackTarget,
} from "$lib/playback/capabilities";
import { getDb } from "../db";
import { getFirstPlayableFile, getPlayableFile, getWatchItemDetail } from "../media/files";
import { nowIso } from "../time";
import { decidePlaybackMode, type PlaybackModeDecision } from "../transcoding/capabilities";
import {
  requestDrivenHlsSegmentFormat,
  resolveHlsPlayback,
  TRANSCODING_DISABLED_MESSAGE,
} from "../transcoding/manager";
import { normalizePlaybackSessionMessage } from "../transcoding/messages";
import { getTranscodePolicy } from "../transcoding/policy";
import { sql } from "kysely";

export type SubtitleTrack = {
  id: string;
  label: string;
  language: string;
  src: string;
  default: boolean;
};

type PlayableFile = NonNullable<
  Awaited<ReturnType<typeof getFirstPlayableFile>> | Awaited<ReturnType<typeof getPlayableFile>>
>;

export type PlaybackDecision = {
  mode: "direct" | "remux" | "transcode" | "unavailable";
  status: "ready" | "preparing" | "unavailable";
  target: PlaybackTarget;
  modeDecision: PlaybackModeDecision;
  file: Omit<PlayableFile, "media_item_id">;
  playbackSessionId: string | null;
  streamUrl: string | null;
  streamStartSeconds: number;
  tracks: SubtitleTrack[];
  message: string | null;
};

export type PlaybackItem = {
  id: string;
  kind: string;
  title: string;
  backHref: string;
};

export type PlaybackData = {
  item: PlaybackItem;
  playback: PlaybackDecision;
  startSeconds: number;
};

export type PlaybackProgressBody = {
  mediaFileId: string;
  positionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
};

export type NormalizedPlaybackProgress = {
  positionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequestedStartSeconds(url: URL) {
  const value = url.searchParams.get("start");
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function parseForceTranscode(url: URL) {
  const value = url.searchParams.get("transcode")?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "transcode";
}

function normalizedLanguage(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

export function parsePlaybackProgressBody(body: unknown): PlaybackProgressBody {
  if (!isObject(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  const mediaFileId = typeof body.mediaFileId === "string" ? body.mediaFileId.trim() : "";
  if (!mediaFileId) {
    throw new Error("mediaFileId is required.");
  }

  const positionSeconds =
    body.positionSeconds === null || body.positionSeconds === undefined ? 0 : body.positionSeconds;
  if (typeof positionSeconds !== "number" || !Number.isFinite(positionSeconds)) {
    throw new Error("Position must be a finite number.");
  }

  const durationSeconds =
    body.durationSeconds === null || body.durationSeconds === undefined ? null : body.durationSeconds;
  if (durationSeconds !== null && (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds))) {
    throw new Error("Duration must be a finite number.");
  }

  return {
    mediaFileId,
    positionSeconds,
    durationSeconds,
    completed: body.completed === true,
  };
}

export function normalizePlaybackProgress(input: {
  positionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
}): NormalizedPlaybackProgress {
  const durationSeconds = input.durationSeconds === null ? null : Math.max(0, input.durationSeconds);
  let positionSeconds = Math.max(0, input.positionSeconds);

  if (durationSeconds !== null && durationSeconds > 0) {
    positionSeconds = Math.min(positionSeconds, durationSeconds);
  }

  return {
    positionSeconds,
    durationSeconds,
    completed:
      input.completed || (durationSeconds !== null && durationSeconds > 0 && positionSeconds / durationSeconds >= 0.9),
  };
}

const REWATCH_MAX_START_SECONDS = 30;
const REWATCH_MAX_START_FRACTION = 0.05;

export function isRewatchFromStart(positionSeconds: number, durationSeconds: number | null) {
  if (positionSeconds <= 0) return true;
  if (durationSeconds !== null && durationSeconds > 0) {
    return positionSeconds / durationSeconds <= REWATCH_MAX_START_FRACTION;
  }
  return positionSeconds <= REWATCH_MAX_START_SECONDS;
}

export async function getPlaybackDecision(
  mediaItemId: string,
  mediaFileId?: string | null,
  userId?: string | null,
  startTimeSeconds?: number | null,
  options: {
    forceStartTime?: boolean;
    forceTranscode?: boolean;
    clientCapabilities?: Partial<ClientPlaybackCapabilities> | null;
    playbackTarget?: PlaybackTarget;
  } = {},
): Promise<PlaybackDecision | null> {
  const db = await getDb();
  const effectiveUserId = userId ?? "";
  const file = mediaFileId
    ? await getPlayableFile(mediaItemId, mediaFileId, effectiveUserId)
    : await getFirstPlayableFile(mediaItemId, effectiveUserId);
  const policy = await getTranscodePolicy(userId);
  if (!file) return null;
  const mediaCapabilities = {
    extension: file.extension,
    container: file.container,
    videoCodec: file.video_codec,
    audioCodec: file.audio_codec,
  };
  const hlsSegmentFormat = requestDrivenHlsSegmentFormat({
    clientCapabilities: options.clientCapabilities,
  });
  const playbackTarget = options.playbackTarget ?? "web";
  const modeDecision = decidePlaybackMode({
    file: mediaCapabilities,
    policy,
    clientCapabilities: options.clientCapabilities,
    hlsSegmentFormat,
    target: playbackTarget,
  });
  const tracks = await db
    .selectFrom("subtitle_track")
    .select(["id", "label", "language", "is_default"])
    .where("media_item_id", "=", mediaItemId)
    .where((eb) => eb.or([eb("media_file_id", "is", null), eb("media_file_id", "=", file.id)]))
    .where("source_kind", "=", "external")
    .orderBy("is_default", "desc")
    .orderBy("label", "asc")
    .execute();

  const preferredSubtitleLanguage = normalizedLanguage(policy.preferredSubtitleLanguage);
  const preferredSubtitleTrackId = preferredSubtitleLanguage
    ? tracks.find((track) => normalizedLanguage(track.language) === preferredSubtitleLanguage)?.id
    : null;
  let defaultAssigned = false;
  const mappedTracks = tracks.map((track) => {
    const isDefault = preferredSubtitleTrackId
      ? track.id === preferredSubtitleTrackId
      : Boolean(track.is_default) && !defaultAssigned;
    if (isDefault) defaultAssigned = true;

    return {
      id: track.id,
      label: track.label,
      language: track.language,
      src: `/media/subtitles/${track.id}`,
      default: isDefault,
    };
  });

  const safeFile = {
    id: file.id,
    basename: file.basename,
    extension: file.extension,
    size_bytes: file.size_bytes,
    duration_seconds: file.duration_seconds,
    video_codec: file.video_codec,
    audio_codec: file.audio_codec,
    container: file.container,
    source: file.source,
  };

  if (modeDecision.mode === "unavailable") {
    return {
      mode: "unavailable",
      status: "unavailable",
      target: playbackTarget,
      modeDecision,
      file: safeFile,
      playbackSessionId: null,
      streamUrl: null,
      streamStartSeconds: 0,
      tracks: mappedTracks,
      message: TRANSCODING_DISABLED_MESSAGE,
    };
  }

  const hlsMode = options.forceTranscode && policy.transcodingEnabled ? "transcode" : modeDecision.mode;

  if ((hlsMode === "transcode" || hlsMode === "remux") && userId) {
    const transcode = await resolveHlsPlayback({
      mediaFileId: file.id,
      userId,
      mode: hlsMode,
      startTimeSeconds,
      forceStartTime: options.forceStartTime,
      clientCapabilities: options.clientCapabilities,
    });
    return {
      mode: transcode.status === "unavailable" ? "unavailable" : transcode.mode,
      status: transcode.status,
      target: playbackTarget,
      modeDecision,
      file: safeFile,
      playbackSessionId: transcode.sessionId,
      streamUrl: transcode.streamUrl,
      streamStartSeconds: transcode.streamStartSeconds,
      tracks: mappedTracks,
      message: normalizePlaybackSessionMessage(transcode.message),
    };
  }

  if (hlsMode === "transcode" || hlsMode === "remux") {
    return {
      mode: "unavailable",
      status: "unavailable",
      target: playbackTarget,
      modeDecision,
      file: safeFile,
      playbackSessionId: null,
      streamUrl: null,
      streamStartSeconds: 0,
      tracks: mappedTracks,
      message: "Sign in to start playback.",
    };
  }

  return {
    mode: "direct",
    status: "ready",
    target: playbackTarget,
    modeDecision,
    file: safeFile,
    playbackSessionId: null,
    streamUrl: `/media/files/${file.id}/stream`,
    streamStartSeconds: 0,
    tracks: mappedTracks,
    message: null,
  };
}

export async function getPlaybackData(input: {
  mediaItemId: string;
  userId: string;
  url: URL;
  skipProgress?: boolean;
  backHref?: string;
}): Promise<PlaybackData | null> {
  const detail = await getWatchItemDetail(input.mediaItemId, input.userId);
  if (!detail) return null;

  const requestedMediaFileId = input.url.searchParams.get("file")?.trim() || null;
  const explicitStartSeconds = parseRequestedStartSeconds(input.url);
  const latestResumeProgress = input.skipProgress
    ? undefined
    : [...detail.progress]
        .filter((item) => !Boolean(item.completed) && Number(item.position_seconds ?? 0) > 0)
        .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))[0];
  const mediaFileId = requestedMediaFileId ?? latestResumeProgress?.media_file_id ?? null;
  const requestedProgress =
    input.skipProgress || !mediaFileId ? null : detail.progress.find((item) => item.media_file_id === mediaFileId);
  const startSecondsForPlayback =
    explicitStartSeconds ??
    (requestedProgress && !requestedProgress.completed ? Math.floor(requestedProgress.position_seconds ?? 0) : 0);
  const playback = await getPlaybackDecision(input.mediaItemId, mediaFileId, input.userId, startSecondsForPlayback, {
    forceStartTime: explicitStartSeconds !== null,
    forceTranscode: parseForceTranscode(input.url),
    clientCapabilities: parseClientPlaybackCapabilities(input.url),
    playbackTarget: normalizePlaybackTarget(input.url.searchParams.get("target")),
  });
  if (!playback?.file) return null;
  const progress = input.skipProgress
    ? undefined
    : detail.progress.find((item) => item.media_file_id === playback.file.id);

  return {
    item: {
      ...detail.item,
      backHref: input.backHref ?? detail.item.backHref,
    },
    playback,
    startSeconds:
      input.skipProgress || explicitStartSeconds !== null
        ? (explicitStartSeconds ?? 0)
        : progress?.completed
          ? 0
          : Math.floor(progress?.position_seconds ?? 0),
  };
}

export async function saveProgress(input: {
  userId: string;
  mediaItemId: string;
  mediaFileId: string;
  positionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
  clearCompleted?: boolean;
}) {
  if (!Number.isFinite(input.positionSeconds)) {
    throw new Error("Position must be a finite number.");
  }

  if (input.durationSeconds !== null && !Number.isFinite(input.durationSeconds)) {
    throw new Error("Duration must be a finite number.");
  }

  const db = await getDb();
  const file = await db
    .selectFrom("media_file")
    .innerJoin("media_item", "media_item.id", "media_file.media_item_id")
    .innerJoin("library", "library.id", "media_file.library_id")
    .select("media_file.id")
    .where("media_file.id", "=", input.mediaFileId)
    .where("media_file.media_item_id", "=", input.mediaItemId)
    .where("media_item.kind", "in", ["movie", "episode"])
    .where(
      sql<boolean>`(
      exists (
        select 1 from user
        where user.id = ${input.userId}
          and user.role = 'admin'
      )
      or library.access_mode = 'all'
      or exists (
        select 1 from library_user
        where library_user.library_id = media_file.library_id
          and library_user.user_id = ${input.userId}
      )
    )`,
    )
    .executeTakeFirst();

  if (!file) {
    throw new Error("Media file does not belong to a playable item.");
  }

  const normalized = normalizePlaybackProgress({
    positionSeconds: input.positionSeconds,
    durationSeconds: input.durationSeconds,
    completed: input.completed,
  });
  const existing = await db
    .selectFrom("watch_progress")
    .select("completed")
    .where("user_id", "=", input.userId)
    .where("media_item_id", "=", input.mediaItemId)
    .where("media_file_id", "=", input.mediaFileId)
    .executeTakeFirst();
  const rewatchingFromStart =
    Boolean(existing?.completed) &&
    !normalized.completed &&
    isRewatchFromStart(normalized.positionSeconds, normalized.durationSeconds);
  const completed =
    normalized.completed || (Boolean(existing?.completed) && input.clearCompleted !== true && !rewatchingFromStart);

  const values = {
    user_id: input.userId,
    media_item_id: input.mediaItemId,
    media_file_id: input.mediaFileId,
    position_seconds: normalized.positionSeconds,
    duration_seconds: normalized.durationSeconds,
    completed: completed ? 1 : 0,
    updated_at: nowIso(),
  };

  await db
    .insertInto("watch_progress")
    .values(values)
    .onConflict((oc) =>
      oc.columns(["user_id", "media_item_id", "media_file_id"]).doUpdateSet({
        position_seconds: values.position_seconds,
        duration_seconds: values.duration_seconds,
        completed: values.completed,
        updated_at: values.updated_at,
      }),
    )
    .execute();
}

export async function markWatched(input: {
  userId: string;
  mediaItemId: string;
  mediaFileId: string;
  completed: boolean;
}) {
  await saveProgress({
    ...input,
    positionSeconds: 0,
    durationSeconds: null,
    clearCompleted: !input.completed,
  });

  if (!input.completed) {
    const db = await getDb();
    await db
      .updateTable("watch_progress")
      .set({
        position_seconds: 0,
        duration_seconds: null,
        completed: 0,
        updated_at: nowIso(),
      })
      .where("user_id", "=", input.userId)
      .where("media_item_id", "=", input.mediaItemId)
      .where(sql<boolean>`completed = 1`)
      .execute();
  }
}
