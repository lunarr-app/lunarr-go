import {
  createTranscodeSession,
  deleteTranscodeHlsArtifacts,
  findActiveHlsArtifact,
  findRecentFailedHlsPlayback,
  getTranscodeSession,
  isTranscodeSessionActive,
  listActiveHlsPlaybackSessionsForMedia,
  listMismatchedActiveHlsArtifacts,
  registerTranscodeHlsArtifact,
  updateActiveTranscodeSessionStatus,
  updateTranscodeSessionPipeline,
  updateTranscodeSessionStatus,
} from "./sessions";
import { acquirePlaybackCache } from "./cache";
import type { ClientPlaybackCapabilities } from "$lib/playback/capabilities";
import { DEFAULT_HLS_SEGMENT_SECONDS, type HlsSegmentFormat, hlsSegmentName, virtualHlsPlaylist } from "./hls";
import { TRANSCODING_DISABLED_MESSAGE } from "./hls-segment-jobs";
import type { TranscodeMode } from "../db/schema/streaming";
import { currentDatabasePaths, getDb } from "../db";
import { getMediaFile } from "../media/files";
import {
  createDefaultLibraryStorageForTests,
  createLibraryStorage,
  remoteOperationTimeoutMsFromConfig,
} from "../storage";
import { isRemoteLibrarySource } from "../libraries/source";
import { getTranscodePolicy } from "./policy";
import {
  hasSeekableRemoteSize,
  createSeekableInputSourceFromStorage,
  REMOTE_READ_CANCELLED_MESSAGE,
} from "./seekable-input";
import { nodeAvInputFormat, remoteContainerSniffNeeded } from "./container-format";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  cancelPlaybackSession,
  cleanupTranscodeStartupFailure,
  requestDrivenHlsSegmentFormat,
} from "./playback-lifecycle";
import { getTranscodeBackend } from "./playback-backend";
import { ensureHlsSegmentForRequest } from "./segment-request-gateway";
import { withTimeout } from "../timeout";

const PLAYBACK_CANCELLED_MESSAGE = "Playback session was cancelled.";
const PLAYBACK_SESSION_INACTIVE_MESSAGE = "Playback session is no longer active.";
const TRANSCODE_START_OUTSIDE_DURATION_MESSAGE = "Playback start is outside the media duration.";
const MEDIA_FILE_UNAVAILABLE_MESSAGE = "Media file is no longer available.";
const REQUEST_DRIVEN_HLS_UNAVAILABLE_MESSAGE = "Request-driven HLS segment generation is not available.";
const REQUEST_DRIVEN_HLS_REQUIRES_DURATION_MESSAGE = "Request-driven HLS requires known media duration.";
const REMOTE_REQUEST_DRIVEN_INPUT_UNAVAILABLE_MESSAGE =
  "Remote media needs probe metadata before HLS playback can start.";
const PREPARING_PLAYBACK_MESSAGE = "Preparing playback. Try again shortly.";

let storageFactory: typeof createLibraryStorage = createLibraryStorage;
let sftpSeekableOperationTimeoutMsForTests: number | null = null;
let transcodePolicyRecheckDelayForTests: (() => Promise<void> | void) | null = null;

export function setStorageFactoryInternal(factory: typeof createLibraryStorage) {
  storageFactory = factory;
}

export function resetStorageFactoryInternal() {
  storageFactory = createDefaultLibraryStorageForTests;
  sftpSeekableOperationTimeoutMsForTests = null;
}

export function setSftpSeekableOperationTimeoutInternal(timeoutMs: number | null) {
  sftpSeekableOperationTimeoutMsForTests = timeoutMs === null ? null : Math.max(1, Math.floor(timeoutMs));
}

export function setTranscodePolicyRecheckDelayInternal(delay: (() => Promise<void> | void) | null) {
  transcodePolicyRecheckDelayForTests = delay;
}

type AudioStreamCandidate = {
  stream_index: number;
  codec_name: string | null;
  language: string | null;
  channels: number | null;
  bit_rate: number | null;
};

class TranscodeStartupAbortedError extends Error {}
class TranscodePolicyDisabledError extends Error {}

export type HlsPlaybackResult =
  | {
      status: "ready";
      mode: TranscodeMode;
      sessionId: string;
      streamUrl: string;
      streamStartSeconds: number;
      message: null;
    }
  | {
      status: "preparing";
      mode: TranscodeMode;
      sessionId: string;
      streamUrl: null;
      streamStartSeconds: number;
      message: string;
    }
  | {
      status: "unavailable";
      mode: TranscodeMode | null;
      sessionId: string | null;
      streamUrl: null;
      streamStartSeconds: number;
      message: string;
    };

function playbackSessionStreamUrl(sessionId: string) {
  return `/media/playback-sessions/${sessionId}/master.m3u8`;
}

function playbackSessionArtifactDirectory(sessionId: string) {
  return path.join(currentDatabasePaths().dataDir, "playback-sessions", sessionId);
}

function virtualHlsPlaylistPath(sessionId: string) {
  return path.join(playbackSessionArtifactDirectory(sessionId), "master.m3u8");
}

function normalizedStartTimeSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function canUseRequestDrivenHls(file: NonNullable<Awaited<ReturnType<typeof getMediaFile>>>, startTimeSeconds: number) {
  if (
    file.duration_seconds === null ||
    !Number.isFinite(file.duration_seconds) ||
    file.duration_seconds <= startTimeSeconds
  ) {
    return false;
  }

  if (!isRemoteLibrarySource(file.source)) return true;

  return nodeAvInputFormat(file) !== null && hasSeekableRemoteSize(file);
}

function normalizedAudioCodec(codec: string | null) {
  return (
    codec
      ?.trim()
      .toLowerCase()
      .replace(/^mp4a\..*$/, "mp4a") ?? ""
  );
}

function isAacFamilyCodec(codec: string | null) {
  const normalized = normalizedAudioCodec(codec);
  return normalized === "aac" || normalized === "mp4a";
}

function normalizedAudioLanguage(language: string | null | undefined) {
  return language?.trim().toLowerCase() || null;
}

function preferredLanguageDelta(
  left: AudioStreamCandidate,
  right: AudioStreamCandidate,
  preferredLanguage: string | null | undefined,
) {
  const preferred = normalizedAudioLanguage(preferredLanguage);
  if (!preferred) return 0;
  return (
    Number(normalizedAudioLanguage(right.language) === preferred) -
    Number(normalizedAudioLanguage(left.language) === preferred)
  );
}

function compareTranscodeAudioCandidates(
  left: AudioStreamCandidate,
  right: AudioStreamCandidate,
  preferredLanguage?: string | null,
) {
  const languageDelta = preferredLanguageDelta(left, right, preferredLanguage);
  if (languageDelta !== 0) return languageDelta;
  const channelDelta = (right.channels ?? 0) - (left.channels ?? 0);
  if (channelDelta !== 0) return channelDelta;
  const bitrateDelta = (right.bit_rate ?? 0) - (left.bit_rate ?? 0);
  if (bitrateDelta !== 0) return bitrateDelta;
  return left.stream_index - right.stream_index;
}

function compareRemuxAudioCandidates(
  left: AudioStreamCandidate,
  right: AudioStreamCandidate,
  preferredLanguage?: string | null,
) {
  const codecDelta = Number(isAacFamilyCodec(right.codec_name)) - Number(isAacFamilyCodec(left.codec_name));
  if (codecDelta !== 0) return codecDelta;
  return compareTranscodeAudioCandidates(left, right, preferredLanguage);
}

export function requestDrivenGenerationMode(mode: TranscodeMode): TranscodeMode {
  return mode;
}

export async function selectPlaybackAudioStreamIndex(input: {
  mediaFileId: string;
  mode: TranscodeMode;
  preferredAudioLanguage?: string | null;
}) {
  const db = await getDb();
  const streams = await db
    .selectFrom("media_stream_info")
    .select(["stream_index", "codec_name", "language", "channels", "bit_rate"])
    .where("media_file_id", "=", input.mediaFileId)
    .where("stream_type", "=", "audio")
    .orderBy("stream_index", "asc")
    .execute();

  if (streams.length === 0) return null;
  const candidates = [...streams];
  candidates.sort(
    input.mode === "remux"
      ? (left, right) => compareRemuxAudioCandidates(left, right, input.preferredAudioLanguage)
      : (left, right) => compareTranscodeAudioCandidates(left, right, input.preferredAudioLanguage),
  );
  return candidates[0]?.stream_index ?? null;
}

function isTerminalTranscodeSessionStatus(status: string | null | undefined) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export async function isReadableFile(filePath: string) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export async function createSeekableStorageInputSource(
  file: NonNullable<Awaited<ReturnType<typeof getMediaFile>>>,
  setupSignal?: AbortSignal,
) {
  if (!hasSeekableRemoteSize(file)) {
    throw new Error("Remote media size is not known enough for seekable transcoding.");
  }

  const timeoutMs =
    sftpSeekableOperationTimeoutMsForTests ?? remoteOperationTimeoutMsFromConfig(file.source, file.config_json);
  const storage = await withTimeout(storageFactory(file), timeoutMs, `Remote input setup for ${file.path}`, {
    onLateResolve: (lateStorage) => lateStorage.close(),
    signal: setupSignal,
    abortMessage: PLAYBACK_CANCELLED_MESSAGE,
  });
  const inputSource = await createSeekableInputSourceFromStorage({
    file: {
      path: file.path,
      extension: file.extension,
      container: file.container,
      sizeBytes: file.size_bytes,
    },
    storage,
    timeoutMs,
    setupSignal,
    sniff: remoteContainerSniffNeeded(file),
  });

  return {
    kind: inputSource.kind,
    label: inputSource.label,
    sizeBytes: inputSource.sizeBytes,
    format: inputSource.format,
    async read(start: number, length: number, readSignal?: AbortSignal) {
      if (setupSignal?.aborted) {
        throw new Error(PLAYBACK_CANCELLED_MESSAGE);
      }
      try {
        return await inputSource.read(start, length, readSignal);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== REMOTE_READ_CANCELLED_MESSAGE) {
          throw error;
        }
        if (setupSignal?.aborted) {
          throw new Error(PLAYBACK_CANCELLED_MESSAGE);
        }
        if (readSignal?.aborted) {
          throw new Error(`Remote range read ${file.path} was cancelled.`);
        }
        throw error;
      }
    },
    async close() {
      await inputSource.close();
      await storage.close();
    },
  };
}

async function publishActiveHlsArtifact(input: { sessionId: string; mediaFileId: string; playlistPath: string }) {
  const updated = await updateActiveTranscodeSessionStatus(input.sessionId, "running", null);
  if (!updated) {
    await deleteTranscodeHlsArtifacts(input.sessionId);
    throw new TranscodeStartupAbortedError(PLAYBACK_SESSION_INACTIVE_MESSAGE);
  }

  await registerTranscodeHlsArtifact({
    sessionId: input.sessionId,
    mediaFileId: input.mediaFileId,
    path: input.playlistPath,
    mimeType: "application/vnd.apple.mpegurl",
  });

  if (!(await isTranscodeSessionActive(input.sessionId))) {
    await deleteTranscodeHlsArtifacts(input.sessionId);
    throw new TranscodeStartupAbortedError(PLAYBACK_SESSION_INACTIVE_MESSAGE);
  }
}

async function requireTranscodePolicyEnabled(userId: string) {
  await transcodePolicyRecheckDelayForTests?.();
  const policy = await getTranscodePolicy(userId);
  if (!policy.transcodingEnabled) {
    throw new TranscodePolicyDisabledError(TRANSCODING_DISABLED_MESSAGE);
  }
  return policy;
}

async function startRequestDrivenHlsSession(input: {
  sessionId: string;
  mediaFileId: string;
  durationSeconds: number;
  startTimeSeconds: number;
  segmentFormat: HlsSegmentFormat;
}) {
  if (!(await updateTranscodeSessionPipeline(input.sessionId, "request_driven"))) {
    throw new TranscodeStartupAbortedError(PLAYBACK_SESSION_INACTIVE_MESSAGE);
  }

  const playlistPath = virtualHlsPlaylistPath(input.sessionId);
  await mkdir(path.dirname(playlistPath), { recursive: true });
  await writeFile(
    playlistPath,
    virtualHlsPlaylist({
      durationSeconds: input.durationSeconds,
      startTimeSeconds: input.startTimeSeconds,
      segmentSeconds: DEFAULT_HLS_SEGMENT_SECONDS,
      segmentFormat: input.segmentFormat,
    }),
  );
  try {
    await publishActiveHlsArtifact({
      sessionId: input.sessionId,
      mediaFileId: input.mediaFileId,
      playlistPath,
    });
  } catch (error) {
    await cleanupTranscodeStartupFailure(input.sessionId);
    throw error;
  }
}

async function warmInitialRequestDrivenHlsSegment(input: {
  sessionId: string;
  userId: string;
  segmentFormat: HlsSegmentFormat;
}): Promise<TranscodeMode> {
  const initialSession = await getTranscodeSession(input.sessionId);
  if (!initialSession || isTerminalTranscodeSessionStatus(initialSession.status)) {
    throw new TranscodeStartupAbortedError(initialSession?.errorMessage ?? PLAYBACK_SESSION_INACTIVE_MESSAGE);
  }
  const segmentIndex = Math.max(0, Math.floor(initialSession.startTimeSeconds / DEFAULT_HLS_SEGMENT_SECONDS));
  let ready = false;
  try {
    ready = await ensureHlsSegmentForRequest({
      sessionId: input.sessionId,
      userId: input.userId,
      segment: hlsSegmentName(segmentIndex, input.segmentFormat),
    });
  } catch (error) {
    const session = await getTranscodeSession(input.sessionId);
    if (session && isTerminalTranscodeSessionStatus(session.status)) {
      throw new TranscodeStartupAbortedError(
        session.errorMessage ?? (error instanceof Error ? error.message : PLAYBACK_SESSION_INACTIVE_MESSAGE),
      );
    }
    throw error;
  }

  const session = await getTranscodeSession(input.sessionId);
  if (!session || isTerminalTranscodeSessionStatus(session.status)) {
    throw new TranscodeStartupAbortedError(session?.errorMessage ?? PLAYBACK_SESSION_INACTIVE_MESSAGE);
  }
  if (!ready) {
    throw new Error("Initial HLS playback segment could not be generated.");
  }
  return session.mode;
}

async function cancelSupersededHlsPlaybackSessions(
  mediaFileId: string,
  userId: string,
  mode: TranscodeMode,
  replacementSessionId: string,
) {
  const PLAYBACK_SESSION_REPLACED_MESSAGE = "Playback session was replaced.";
  const supersededSessions = await listActiveHlsPlaybackSessionsForMedia(mediaFileId, userId, mode);
  for (const session of supersededSessions) {
    if (session.sessionId === replacementSessionId) continue;
    await cancelPlaybackSession(session.sessionId, PLAYBACK_SESSION_REPLACED_MESSAGE);
  }
}

export async function resolveHlsPlayback(input: {
  mediaFileId: string;
  userId: string;
  mode?: TranscodeMode;
  startTimeSeconds?: number | null;
  forceStartTime?: boolean;
  clientCapabilities?: Partial<ClientPlaybackCapabilities> | null;
}): Promise<HlsPlaybackResult> {
  const startTimeSeconds = normalizedStartTimeSeconds(input.startTimeSeconds);
  const mode = input.mode ?? "transcode";
  const policy = await getTranscodePolicy(input.userId);
  if (!policy.transcodingEnabled) {
    return {
      status: "unavailable",
      mode,
      sessionId: null,
      streamUrl: null,
      streamStartSeconds: startTimeSeconds,
      message: TRANSCODING_DISABLED_MESSAGE,
    };
  }

  if (input.forceStartTime === true) {
    const mismatchedSessions = await listMismatchedActiveHlsArtifacts(
      input.mediaFileId,
      input.userId,
      mode,
      startTimeSeconds,
    );
    for (const session of mismatchedSessions) {
      await cancelPlaybackSession(session.sessionId, "Playback session was repositioned.");
    }
  }

  const recentFailed = await findRecentFailedHlsPlayback(input.mediaFileId, input.userId, mode, startTimeSeconds);
  if (recentFailed) {
    return {
      status: "unavailable",
      mode: recentFailed.mode,
      sessionId: recentFailed.sessionId,
      streamUrl: null,
      streamStartSeconds: recentFailed.startTimeSeconds,
      message: recentFailed.errorMessage ?? "HLS playback failed to start.",
    };
  }

  let existing = await findActiveHlsArtifact(input.mediaFileId, input.userId, mode, startTimeSeconds);
  if (existing?.pipeline === "request_driven") {
    existing = null;
  }
  if (existing?.status === "running" && existing.playlistPath) {
    if (await isReadableFile(existing.playlistPath)) {
      return {
        status: "ready",
        mode: existing.mode,
        sessionId: existing.sessionId,
        streamUrl: playbackSessionStreamUrl(existing.sessionId),
        streamStartSeconds: existing.startTimeSeconds,
        message: null,
      };
    }
  }
  if (existing?.status === "queued" || existing?.status === "running") {
    return {
      status: "preparing",
      mode: existing.mode,
      sessionId: existing.sessionId,
      streamUrl: null,
      streamStartSeconds: existing.startTimeSeconds,
      message: PREPARING_PLAYBACK_MESSAGE,
    };
  }

  const sessionId = await createTranscodeSession({
    mediaFileId: input.mediaFileId,
    userId: input.userId,
    mode,
    startTimeSeconds,
  });

  const file = await getMediaFile(input.mediaFileId, input.userId);
  if (!file) {
    await updateTranscodeSessionStatus(sessionId, "failed", MEDIA_FILE_UNAVAILABLE_MESSAGE);
    return {
      status: "unavailable",
      mode,
      sessionId,
      streamUrl: null,
      streamStartSeconds: startTimeSeconds,
      message: MEDIA_FILE_UNAVAILABLE_MESSAGE,
    };
  }
  if (
    file.duration_seconds !== null &&
    Number.isFinite(file.duration_seconds) &&
    file.duration_seconds > 0 &&
    startTimeSeconds >= file.duration_seconds
  ) {
    await updateTranscodeSessionStatus(sessionId, "failed", TRANSCODE_START_OUTSIDE_DURATION_MESSAGE);
    await cleanupTranscodeStartupFailure(sessionId);
    return {
      status: "unavailable",
      mode,
      sessionId,
      streamUrl: null,
      streamStartSeconds: startTimeSeconds,
      message: TRANSCODE_START_OUTSIDE_DURATION_MESSAGE,
    };
  }

  const requestDrivenEligible = canUseRequestDrivenHls(file, startTimeSeconds);
  if (!isRemoteLibrarySource(file.source) && !(await isReadableFile(file.path))) {
    await updateTranscodeSessionStatus(sessionId, "failed", MEDIA_FILE_UNAVAILABLE_MESSAGE);
    await cleanupTranscodeStartupFailure(sessionId);
    return {
      status: "unavailable",
      mode,
      sessionId,
      streamUrl: null,
      streamStartSeconds: startTimeSeconds,
      message: MEDIA_FILE_UNAVAILABLE_MESSAGE,
    };
  }
  if (isRemoteLibrarySource(file.source) && !requestDrivenEligible) {
    await updateTranscodeSessionStatus(sessionId, "failed", REMOTE_REQUEST_DRIVEN_INPUT_UNAVAILABLE_MESSAGE);
    await cleanupTranscodeStartupFailure(sessionId);
    return {
      status: "unavailable",
      mode,
      sessionId,
      streamUrl: null,
      streamStartSeconds: startTimeSeconds,
      message: REMOTE_REQUEST_DRIVEN_INPUT_UNAVAILABLE_MESSAGE,
    };
  }

  const transcodeBackend = getTranscodeBackend();
  const validateHlsSegmentGenerationPolicy = transcodeBackend.validateHlsSegmentGenerationPolicy;
  const generateHlsSegmentWindow = transcodeBackend.generateHlsSegmentWindow;
  if (requestDrivenEligible && !generateHlsSegmentWindow) {
    await updateTranscodeSessionStatus(sessionId, "failed", REQUEST_DRIVEN_HLS_UNAVAILABLE_MESSAGE);
    await cleanupTranscodeStartupFailure(sessionId);
    return {
      status: "unavailable",
      mode,
      sessionId,
      streamUrl: null,
      streamStartSeconds: startTimeSeconds,
      message: REQUEST_DRIVEN_HLS_UNAVAILABLE_MESSAGE,
    };
  }

  if (requestDrivenEligible && generateHlsSegmentWindow) {
    try {
      const segmentFormat = requestDrivenHlsSegmentFormat({
        clientCapabilities: input.clientCapabilities,
      });
      const durationSeconds = file.duration_seconds;
      if (durationSeconds === null) {
        throw new Error("Request-driven HLS requires known media duration.");
      }
      await validateHlsSegmentGenerationPolicy?.({
        mode,
        hardwareAcceleration: policy.hardwareAcceleration,
        hardwareAccelerationRequired: policy.hardwareAccelerationRequired,
        transcodeQuality: policy.transcodeQuality,
      });
      await requireTranscodePolicyEnabled(input.userId);
      const audioStreamIndex = await selectPlaybackAudioStreamIndex({
        mediaFileId: input.mediaFileId,
        mode,
        preferredAudioLanguage: policy.preferredAudioLanguage,
      });
      await acquirePlaybackCache({
        sessionId,
        mediaFileId: input.mediaFileId,
        fileSizeBytes: file.size_bytes,
        fileMtimeMs: file.mtime_ms,
        mode,
        policy,
        segmentFormat,
        audioStreamIndex,
      });
      await startRequestDrivenHlsSession({
        sessionId,
        mediaFileId: input.mediaFileId,
        durationSeconds,
        startTimeSeconds,
        segmentFormat,
      });
      const effectiveMode = await warmInitialRequestDrivenHlsSegment({
        sessionId,
        userId: input.userId,
        segmentFormat,
      });
      await cancelSupersededHlsPlaybackSessions(input.mediaFileId, input.userId, mode, sessionId);
      return {
        status: "ready",
        mode: effectiveMode,
        sessionId,
        streamUrl: playbackSessionStreamUrl(sessionId),
        streamStartSeconds: 0,
        message: null,
      };
    } catch (error) {
      if (error instanceof TranscodeStartupAbortedError) {
        const terminalSession = await getTranscodeSession(sessionId);
        await cleanupTranscodeStartupFailure(sessionId);
        return {
          status: "unavailable",
          mode: terminalSession?.mode ?? mode,
          sessionId,
          streamUrl: null,
          streamStartSeconds: startTimeSeconds,
          message: error.message,
        };
      }
      const message = error instanceof Error ? error.message : "Request-driven HLS playback failed to start.";
      const terminalSession = await getTranscodeSession(sessionId);
      if (terminalSession && isTerminalTranscodeSessionStatus(terminalSession.status)) {
        await cleanupTranscodeStartupFailure(sessionId);
        return {
          status: "unavailable",
          mode: terminalSession.mode,
          sessionId,
          streamUrl: null,
          streamStartSeconds: startTimeSeconds,
          message: terminalSession.errorMessage ?? message,
        };
      }
      await updateTranscodeSessionStatus(sessionId, "failed", message);
      await cleanupTranscodeStartupFailure(sessionId);

      return {
        status: "unavailable",
        mode,
        sessionId,
        streamUrl: null,
        streamStartSeconds: startTimeSeconds,
        message,
      };
    }
  }

  await updateTranscodeSessionStatus(sessionId, "failed", REQUEST_DRIVEN_HLS_REQUIRES_DURATION_MESSAGE);
  await cleanupTranscodeStartupFailure(sessionId);
  return {
    status: "unavailable",
    mode,
    sessionId,
    streamUrl: null,
    streamStartSeconds: startTimeSeconds,
    message: REQUEST_DRIVEN_HLS_REQUIRES_DURATION_MESSAGE,
  };
}
