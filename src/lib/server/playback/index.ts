import {
  normalizePlaybackTarget,
  parseClientPlaybackCapabilities,
  type ClientPlaybackCapabilities,
  type PlaybackTarget,
} from "$lib/playback/capabilities";
import { normalizePreferredLanguage } from "$lib/media/preferred-language";
import { getDb } from "../db";
import type { MediaKind } from "../db/schema";
import { loadPlaybackSegmentsForMediaItem } from "../introdb";
import { getFirstPlayableFile, getPlayableFile, getWatchItemDetail } from "../media/files";
import { getSegmentSkipPreferences, type SegmentSkipPreferences } from "./segment-skip-preferences";
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
import { accessibleLibrarySql } from "../media/catalog";

export type SubtitleTrack = {
  id: string;
  label: string;
  language: string;
  src: string;
  default: boolean;
};

export type AudioTrack = {
  id: number;
  label: string;
  language: string;
  channels: number | null;
  codec: string;
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
  audioTracks: AudioTrack[];
  message: string | null;
};

export type PlaybackItem = {
  id: string;
  kind: string;
  title: string;
  backHref: string;
};

export type PlaybackSegmentType = "intro" | "recap" | "credits";

export type PlaybackSegment = {
  type: PlaybackSegmentType;
  startSeconds: number;
  endSeconds: number | null;
  label: string;
};

export type PlaybackData = {
  item: PlaybackItem;
  playback: PlaybackDecision;
  startSeconds: number;
  segments: PlaybackSegment[];
  segmentSkip: SegmentSkipPreferences;
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

const EPISODE_END_CREDITS_SECONDS = 90;
const MOVIE_END_CREDITS_SECONDS = 420;
const COMPLETION_GRACE_SECONDS = 30;
const COMPLETION_MIN_FRACTION = 0.8;

export function completionThresholdSeconds(durationSeconds: number, kind?: MediaKind): number | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const credits = kind === "episode" ? EPISODE_END_CREDITS_SECONDS : MOVIE_END_CREDITS_SECONDS;
  return Math.max(durationSeconds - credits - COMPLETION_GRACE_SECONDS, durationSeconds * COMPLETION_MIN_FRACTION);
}

export function normalizePlaybackProgress(input: {
  positionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
  kind?: MediaKind;
}): NormalizedPlaybackProgress {
  const durationSeconds = input.durationSeconds === null ? null : Math.max(0, input.durationSeconds);
  let positionSeconds = Math.max(0, input.positionSeconds);

  if (durationSeconds !== null && durationSeconds > 0) {
    positionSeconds = Math.min(positionSeconds, durationSeconds);
  }

  const threshold = durationSeconds === null ? null : completionThresholdSeconds(durationSeconds, input.kind);

  return {
    positionSeconds,
    durationSeconds,
    completed: input.completed || (threshold !== null && positionSeconds >= threshold),
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

async function fetchAudioStreams(mediaFileId: string) {
  const db = await getDb();
  return db
    .selectFrom("media_stream_info")
    .select(["stream_index", "codec_name", "language", "channels"])
    .where("media_file_id", "=", mediaFileId)
    .where("stream_type", "=", "audio")
    .orderBy("stream_index", "asc")
    .execute();
}

async function resolveDecisionAudioCodec(
  audioStreams: { codec_name: string | null; language: string | null }[],
  fallbackAudioCodec: string | null,
  preferredAudioLanguage: string | null,
): Promise<string | null> {
  if (!preferredAudioLanguage) return fallbackAudioCodec;
  const preferredStream = audioStreams.find(
    (stream) => normalizePreferredLanguage(stream.language) === preferredAudioLanguage,
  );
  return preferredStream?.codec_name ?? fallbackAudioCodec;
}

function buildAudioTracks(
  audioStreams: {
    stream_index: number;
    codec_name: string | null;
    language: string | null;
    channels: number | null;
  }[],
  normalizedPreference: string | null,
): AudioTrack[] {
  let defaultAssigned = false;

  return audioStreams.map((stream) => {
    const codec = stream.codec_name ?? "Unknown";
    const language = stream.language ?? "";
    const matchesPreference =
      Boolean(normalizedPreference) && normalizePreferredLanguage(language) === normalizedPreference;
    const isDefault = matchesPreference ? !defaultAssigned : !normalizedPreference && !defaultAssigned;
    if (isDefault) defaultAssigned = true;

    return {
      id: stream.stream_index,
      label: formatAudioTrackLabel({ codec, language, channels: stream.channels }),
      language,
      channels: stream.channels,
      codec,
      default: isDefault,
    };
  });
}

function formatAudioTrackLabel(input: { codec: string; language: string; channels: number | null }): string {
  const language = input.language || "Unknown";
  const channels = input.channels && input.channels > 0 ? `${input.channels}ch` : "";
  return [language, input.codec, channels].filter(Boolean).join(" · ");
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
  const audioStreams = await fetchAudioStreams(file.id);
  const normalizedAudioPreference = normalizePreferredLanguage(policy.preferredAudioLanguage);
  const decisionAudioCodec = await resolveDecisionAudioCodec(audioStreams, file.audio_codec, normalizedAudioPreference);
  const mediaCapabilities = {
    extension: file.extension,
    container: file.container,
    videoCodec: file.video_codec,
    audioCodec: decisionAudioCodec,
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

  const preferredSubtitleLanguage = normalizePreferredLanguage(policy.preferredSubtitleLanguage);
  const preferredSubtitleTrackId = preferredSubtitleLanguage
    ? tracks.find((track) => normalizePreferredLanguage(track.language) === preferredSubtitleLanguage)?.id
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

  const audioTracks = buildAudioTracks(audioStreams, normalizedAudioPreference);

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
      audioTracks,
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
      audioTracks,
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
      audioTracks,
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
    audioTracks,
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
  const [playback, segmentSkip] = await Promise.all([
    getPlaybackDecision(input.mediaItemId, mediaFileId, input.userId, startSecondsForPlayback, {
      forceStartTime: explicitStartSeconds !== null,
      forceTranscode: parseForceTranscode(input.url),
      clientCapabilities: parseClientPlaybackCapabilities(input.url),
      playbackTarget: normalizePlaybackTarget(input.url.searchParams.get("target")),
    }),
    getSegmentSkipPreferences(input.userId),
  ]);
  if (!playback?.file) return null;
  const segments = segmentSkip.enabled
    ? await loadPlaybackSegmentsForMediaItem(input.mediaItemId, playback.file.duration_seconds)
    : [];
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
    segments,
    segmentSkip,
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
    .select(["media_file.id", "media_item.kind"])
    .where("media_file.id", "=", input.mediaFileId)
    .where("media_file.media_item_id", "=", input.mediaItemId)
    .where("media_item.kind", "in", ["movie", "episode"])
    .where(accessibleLibrarySql(input.userId, "media_file.library_id"))
    .executeTakeFirst();

  if (!file) {
    throw new Error("Media file does not belong to a playable item.");
  }

  const normalized = normalizePlaybackProgress({
    positionSeconds: input.positionSeconds,
    durationSeconds: input.durationSeconds,
    completed: input.completed,
    kind: file.kind,
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
