import {
  createTranscodeSession,
  cleanupConfiguredPlaybackSessionArtifacts,
  deleteTranscodeHlsArtifacts,
  findActiveHlsArtifact,
  findRecentFailedHlsPlayback,
  getTranscodeSession,
  isTranscodeSessionActive,
  listActiveHlsPlaybackSessionsForMedia,
  listActiveTranscodeSessions,
  listIdleReadyHlsTranscodeSessions,
  listMismatchedActiveHlsArtifacts,
  listRunningHlsTranscodeSessions,
  listStaleActiveTranscodeSessions,
  registerTranscodeHlsArtifact,
  updateActiveTranscodeSessionStatus,
  updateTranscodeSessionMode,
  updateTranscodeSessionPipeline,
  updateTranscodeSessionStatus,
} from "./sessions";
import { cleanupJobHistory } from "../jobs";
import type { ClientPlaybackCapabilities } from "$lib/playback/capabilities";
import {
  DEFAULT_HLS_SEGMENT_SECONDS,
  type HlsSegmentFormat,
  hlsSegmentFileExists,
  hlsSegmentIndex,
  hlsSegmentName,
  pruneHlsSegmentsBehind,
  virtualHlsPlaylist,
} from "./hls";
import { ffmpegCliBackend } from "./ffmpeg-cli";
import type {
  CompatibilityHlsBackend,
  HlsSegmentWindowEntry,
  HlsSegmentWindowGeneration,
  HlsSegmentWindowTranscodeInput,
  TranscodeBackend,
} from "./backend";
import type { TranscodeMode } from "../db/schema/streaming";
import { currentDatabasePaths, getDb } from "../db";
import { getMediaFile } from "../media";
import { createLibraryStorage, remoteOperationTimeoutMsFromConfig } from "../storage";
import { isRemoteLibrarySource } from "../libraries/source";
import { getTranscodePolicy } from "./policy";
import { hasSeekableRemoteSize, nodeAvInputFormat } from "./seekable-input";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const PLAYBACK_CANCELLED_MESSAGE = "Playback session was cancelled.";
const PLAYBACK_SESSION_REPLACED_MESSAGE = "Playback session was replaced.";
const PLAYBACK_HEARTBEAT_EXPIRED_MESSAGE = "Playback session expired because playback stopped.";
const PLAYBACK_SEGMENT_IDLE_EXPIRED_MESSAGE = "Playback session expired because playback stopped requesting segments.";
const PLAYBACK_SESSION_INACTIVE_MESSAGE = "Playback session is no longer active.";
const TRANSCODE_START_OUTSIDE_DURATION_MESSAGE = "Playback start is outside the media duration.";
const MEDIA_FILE_UNAVAILABLE_MESSAGE = "Media file is no longer available.";
const REQUEST_DRIVEN_HLS_UNAVAILABLE_MESSAGE = "Request-driven HLS segment generation is not available.";
const REQUEST_DRIVEN_HLS_REQUIRES_DURATION_MESSAGE = "Request-driven HLS requires known media duration.";
const REMOTE_REQUEST_DRIVEN_INPUT_UNAVAILABLE_MESSAGE =
  "Remote media needs probe metadata before HLS playback can start.";
export const TRANSCODING_DISABLED_MESSAGE = "Transcoding is disabled by an administrator.";
const PREPARING_PLAYBACK_MESSAGE = "Preparing playback. Try again shortly.";
const TRANSCODE_HEARTBEAT_TIMEOUT_MS = 120_000;
const TRANSCODE_SEGMENT_IDLE_TIMEOUT_MS = 300_000;
const TRANSCODE_EXPIRY_INTERVAL_MS = 15_000;
const PLAYBACK_SESSION_ARTIFACT_CLEANUP_TICKS = 20;
const REQUEST_DRIVEN_SEGMENT_TIMEOUT_MS = 120_000;
const ACTIVE_TRANSCODE_CANCEL_BATCH_SIZE = 100;
const REQUEST_DRIVEN_SEGMENT_WINDOW_COUNT = 8;
const REQUEST_DRIVEN_LOOKAHEAD_WAIT_MS = REQUEST_DRIVEN_SEGMENT_TIMEOUT_MS;
const REQUEST_DRIVEN_LOOKAHEAD_FILE_POLL_MS = 25;
const REQUEST_DRIVEN_LOOKAHEAD_STATE_POLL_MS = 100;
const SFTP_SEEKABLE_READ_AHEAD_BYTES = 2 * 1024 * 1024;
const SFTP_SEEKABLE_MAX_BUFFER_BYTES = 4 * 1024 * 1024;

function configuredRequestDrivenHlsSegmentFormat() {
  const value = process.env.LUNARR_HLS_SEGMENT_FORMAT?.trim().toLowerCase();
  return value === "fmp4" || value === "auto" ? value : "mpegts";
}

function hlsSegmentFormatFromSegmentName(segment: string): HlsSegmentFormat {
  return path.extname(segment).toLowerCase() === ".m4s" ? "fmp4" : "mpegts";
}

export function requestDrivenHlsSegmentFormat(
  input: {
    clientCapabilities?: Partial<ClientPlaybackCapabilities> | null;
    segment?: string;
  } = {},
): HlsSegmentFormat {
  if (input.segment) return hlsSegmentFormatFromSegmentName(input.segment);
  const configured = configuredRequestDrivenHlsSegmentFormat();
  if (configured === "fmp4") return "fmp4";
  if (configured === "auto" && input.clientCapabilities?.hlsFmp4 === true) {
    return "fmp4";
  }
  return "mpegts";
}

const defaultPlaybackBackend: TranscodeBackend & CompatibilityHlsBackend = {
  validateHlsSegmentGenerationPolicy(input) {
    return ffmpegCliBackend.validateHlsSegmentGenerationPolicy?.(input);
  },
  async generateHlsSegmentWindow(input) {
    if (!ffmpegCliBackend.generateHlsSegmentWindow) {
      throw new Error("FFmpeg HLS segment generation is unavailable.");
    }
    return ffmpegCliBackend.generateHlsSegmentWindow(input);
  },
  startCompatibilityHls(input) {
    return ffmpegCliBackend.startCompatibilityHls(input);
  },
  async cancel(sessionId) {
    await ffmpegCliBackend.cancel(sessionId).catch(() => undefined);
  },
};
let transcodeBackend: TranscodeBackend & Partial<CompatibilityHlsBackend> = defaultPlaybackBackend;
let storageFactory: typeof createLibraryStorage = createLibraryStorage;
let sftpSeekableOperationTimeoutMsForTests: number | null = null;
let requestDrivenLookaheadWaitMs = REQUEST_DRIVEN_LOOKAHEAD_WAIT_MS;
let transcodePolicyRecheckDelayForTests: (() => Promise<void> | void) | null = null;
const activeRequestDrivenSegmentSetups = new Map<string, Set<AbortController>>();
const activeRequestDrivenSegmentWindows = new Map<string, { firstSegmentIndex: number; lastSegmentIndex: number }>();
type PendingSegmentGenerationWaiter = {
  signal?: AbortSignal;
  aborted: boolean;
  abort?: () => void;
};
type PendingSegmentGeneration = {
  controller: AbortController;
  promise: Promise<boolean>;
  waiters: Set<PendingSegmentGenerationWaiter>;
};
const pendingSegmentGenerations = new Map<string, PendingSegmentGeneration>();
const pendingLookaheadSegments = new Map<string, { controller: AbortController; promise: Promise<boolean> }>();
const sessionSegmentGenerationQueues = new Map<string, Promise<void>>();
let staleExpiryLoop: ReturnType<typeof setInterval> | null = null;
let staleExpiryLoopTicks = 0;

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

export type CancelPlaybackSessionResult = "cancelled" | "inactive" | "missing";

function playbackSessionStreamUrl(sessionId: string) {
  return `/media/playback-sessions/${sessionId}/master.m3u8`;
}

function playbackSessionArtifactDirectory(sessionId: string) {
  return path.join(currentDatabasePaths().dataDir, "playback-sessions", sessionId);
}

async function removeTranscodeSessionArtifacts(sessionId: string) {
  await Promise.all([
    deleteTranscodeHlsArtifacts(sessionId).catch(() => undefined),
    rm(playbackSessionArtifactDirectory(sessionId), {
      recursive: true,
      force: true,
    }).catch(() => undefined),
  ]);
}

async function cleanupTranscodeStartupFailure(sessionId: string) {
  await Promise.all([
    transcodeBackend.cancel(sessionId).catch(() => undefined),
    removeTranscodeSessionArtifacts(sessionId),
  ]);
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

function requestDrivenGenerationMode(mode: TranscodeMode): TranscodeMode {
  return mode;
}

async function selectPlaybackAudioStreamIndex(input: {
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

async function isReadableFile(filePath: string) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function streamToBuffer(stream: Readable, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error(PLAYBACK_CANCELLED_MESSAGE);
  const chunks: Buffer[] = [];
  const abort = () => stream.destroy(new Error(PLAYBACK_CANCELLED_MESSAGE));
  stream.on("error", () => undefined);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for await (const chunk of stream) {
      if (signal?.aborted) throw new Error(PLAYBACK_CANCELLED_MESSAGE);
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } finally {
    signal?.removeEventListener("abort", abort);
  }
  return Buffer.concat(chunks);
}

function withOperationTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  onLateResolve?: (value: T) => Promise<void> | void,
  signal?: AbortSignal,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let abortHandler: (() => void) | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      stopped = true;
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });
  const abortPromise = new Promise<never>((_, reject) => {
    if (!signal) return;
    abortHandler = () => {
      stopped = true;
      reject(new Error(PLAYBACK_CANCELLED_MESSAGE));
    };
    if (signal.aborted) {
      abortHandler();
      return;
    }
    signal.addEventListener("abort", abortHandler, { once: true });
  });
  promise
    .then((value) => {
      if (!stopped || !onLateResolve) return;
      void Promise.resolve(onLateResolve(value)).catch(() => undefined);
    })
    .catch(() => undefined);

  return Promise.race([promise, timeoutPromise, abortPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
    if (signal && abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
  });
}

function linkedAbortSignals(...signals: Array<AbortSignal | undefined>) {
  const activeSignals = signals.filter((item): item is AbortSignal => Boolean(item));
  if (activeSignals.length <= 1) {
    return {
      signal: activeSignals[0],
      cleanup: () => undefined,
    };
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const signal of activeSignals) {
        signal.removeEventListener("abort", abort);
      }
    },
  };
}

async function readStreamToBufferWithTimeout(input: {
  stream: Readable;
  signal?: AbortSignal;
  timeoutMs: number;
  label: string;
}) {
  try {
    return await withOperationTimeout(streamToBuffer(input.stream, input.signal), input.timeoutMs, input.label);
  } catch (error) {
    input.stream.destroy(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

async function createSeekableStorageInputSource(
  file: NonNullable<Awaited<ReturnType<typeof getMediaFile>>>,
  setupSignal?: AbortSignal,
) {
  const format = nodeAvInputFormat(file);
  if (!format) {
    throw new Error("Remote media format is not known enough for seekable transcoding.");
  }
  if (!hasSeekableRemoteSize(file)) {
    throw new Error("Remote media size is not known enough for seekable transcoding.");
  }

  let closed = false;
  let readAhead: {
    start: number;
    buffer: Buffer;
  } | null = null;
  const timeoutMs =
    sftpSeekableOperationTimeoutMsForTests ?? remoteOperationTimeoutMsFromConfig(file.source, file.config_json);
  const storage = await withOperationTimeout(
    storageFactory(file),
    timeoutMs,
    `Remote input setup for ${file.path}`,
    (lateStorage) => lateStorage.close(),
    setupSignal,
  );

  return {
    kind: "seekable" as const,
    label: file.path,
    sizeBytes: file.size_bytes,
    format,
    async read(start: number, length: number, readSignal?: AbortSignal) {
      if (closed) throw new Error("Remote media input is already closed.");
      if (setupSignal?.aborted) {
        throw new Error(PLAYBACK_CANCELLED_MESSAGE);
      }
      if (readSignal?.aborted) {
        throw new Error(`Remote range read ${file.path} was cancelled.`);
      }
      if (!Number.isSafeInteger(start) || start < 0) {
        throw new Error("Invalid remote media read offset.");
      }
      if (!Number.isSafeInteger(length) || length <= 0) {
        return Buffer.alloc(0);
      }
      if (start >= file.size_bytes) return Buffer.alloc(0);
      if (readAhead && start >= readAhead.start && start + length <= readAhead.start + readAhead.buffer.length) {
        return readAhead.buffer.subarray(start - readAhead.start, start - readAhead.start + length);
      }

      const requestedBytes = Math.min(file.size_bytes - start, length);
      const readAheadBytes =
        length <= SFTP_SEEKABLE_MAX_BUFFER_BYTES
          ? Math.min(
              file.size_bytes - start,
              Math.max(length, SFTP_SEEKABLE_READ_AHEAD_BYTES),
              SFTP_SEEKABLE_MAX_BUFFER_BYTES,
            )
          : requestedBytes;
      const end = start + readAheadBytes - 1;
      const readAbort = linkedAbortSignals(setupSignal, readSignal);
      let buffer: Buffer;
      try {
        const stream = await withOperationTimeout(
          storage.createReadStream(file.path, { start, end }, { keepOpen: true }),
          timeoutMs,
          `Remote range read ${file.path}`,
          (lateStream) => {
            lateStream.on("error", () => undefined);
            lateStream.destroy();
          },
          readAbort.signal,
        );
        buffer = await readStreamToBufferWithTimeout({
          stream,
          signal: readAbort.signal,
          timeoutMs,
          label: `Remote range read ${file.path}`,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === PLAYBACK_CANCELLED_MESSAGE &&
          !setupSignal?.aborted &&
          readSignal?.aborted
        ) {
          throw new Error(`Remote range read ${file.path} was cancelled.`);
        }
        throw error;
      } finally {
        readAbort.cleanup();
      }
      if (buffer.length < requestedBytes) {
        throw new Error(
          `Remote range read ${file.path} returned ${buffer.length} bytes for a ${requestedBytes} byte request.`,
        );
      }
      if (buffer.length <= SFTP_SEEKABLE_MAX_BUFFER_BYTES) {
        readAhead = { start, buffer };
      } else {
        readAhead = null;
      }
      return buffer.subarray(0, requestedBytes);
    },
    async close() {
      if (closed) return;
      closed = true;
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

export function setTranscodeBackendForTests(backend: (TranscodeBackend & Partial<CompatibilityHlsBackend>) | null) {
  transcodeBackend = backend ?? defaultPlaybackBackend;
  if (backend === null) {
    for (const pending of pendingLookaheadSegments.values()) {
      pending.controller.abort();
    }
    for (const active of activeRequestDrivenSegmentSetups.values()) {
      for (const controller of active) {
        controller.abort();
      }
    }
    for (const pending of pendingSegmentGenerations.values()) {
      pending.controller.abort();
    }
    pendingSegmentGenerations.clear();
    pendingLookaheadSegments.clear();
    activeRequestDrivenSegmentSetups.clear();
    activeRequestDrivenSegmentWindows.clear();
    sessionSegmentGenerationQueues.clear();
    requestDrivenLookaheadWaitMs = REQUEST_DRIVEN_LOOKAHEAD_WAIT_MS;
    transcodePolicyRecheckDelayForTests = null;
  }
}

export function setTranscodeStorageFactoryForTests(factory: typeof createLibraryStorage | null) {
  storageFactory = factory ?? createLibraryStorage;
  if (factory === null) {
    sftpSeekableOperationTimeoutMsForTests = null;
  }
}

export function setSftpSeekableOperationTimeoutForTests(timeoutMs: number | null) {
  sftpSeekableOperationTimeoutMsForTests = timeoutMs === null ? null : Math.max(1, Math.floor(timeoutMs));
}

export function setRequestDrivenLookaheadWaitForTests(timeoutMs: number | null) {
  requestDrivenLookaheadWaitMs =
    timeoutMs === null ? REQUEST_DRIVEN_LOOKAHEAD_WAIT_MS : Math.max(1, Math.floor(timeoutMs));
}

export function setTranscodePolicyRecheckDelayForTests(delay: (() => Promise<void> | void) | null) {
  transcodePolicyRecheckDelayForTests = delay;
}

function segmentGenerationKey(sessionId: string, segment: string) {
  return `${sessionId}\0${segment}`;
}

function segmentGenerationKeyParts(key: string) {
  const separatorIndex = key.indexOf("\0");
  if (separatorIndex < 0) return null;
  return {
    sessionId: key.slice(0, separatorIndex),
    segment: key.slice(separatorIndex + 1),
  };
}

function missingGeneratedSegmentMessage(segment: string) {
  return `Request-driven HLS segment generation completed without publishing ${segment}.`;
}

function delay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const done = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timeout = setTimeout(done, milliseconds);
    const abort = () => {
      clearTimeout(timeout);
      done();
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function waitForBooleanWithSignal(promise: Promise<boolean>, signal?: AbortSignal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.resolve(false);

  let abort: (() => void) | undefined;
  const abortPromise = new Promise<false>((resolve) => {
    abort = () => resolve(false);
    signal.addEventListener("abort", abort, { once: true });
  });

  return Promise.race([promise, abortPromise]).finally(() => {
    if (abort) signal.removeEventListener("abort", abort);
  });
}

async function waitForHlsSegmentFile(input: {
  playlistPath: string;
  segment: string;
  sessionId: string;
  userId: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}) {
  const deadline = Date.now() + Math.max(0, input.timeoutMs ?? requestDrivenLookaheadWaitMs);
  let nextStateCheckAt = 0;
  while (Date.now() < deadline) {
    if (input.signal?.aborted) return false;
    if (await hlsSegmentFileExists(input.playlistPath, input.segment)) return true;
    const now = Date.now();
    if (now >= nextStateCheckAt) {
      const [session, policy] = await Promise.all([
        getTranscodeSession(input.sessionId),
        getTranscodePolicy(input.userId),
      ]);
      if (
        !policy.transcodingEnabled ||
        !session ||
        session.userId !== input.userId ||
        session.status !== "running" ||
        session.playlistPath !== input.playlistPath
      ) {
        return false;
      }
      nextStateCheckAt = now + REQUEST_DRIVEN_LOOKAHEAD_STATE_POLL_MS;
    }
    await delay(REQUEST_DRIVEN_LOOKAHEAD_FILE_POLL_MS, input.signal);
  }
  if (input.signal?.aborted) return false;
  return hlsSegmentFileExists(input.playlistPath, input.segment);
}

function cancelPendingLookaheadSegments(sessionId: string) {
  const prefix = `${sessionId}\0`;
  for (const [key, pending] of pendingLookaheadSegments) {
    if (!key.startsWith(prefix)) continue;
    pending.controller.abort();
    pendingLookaheadSegments.delete(key);
  }
}

function cancelPendingSegmentGenerations(sessionId: string) {
  const prefix = `${sessionId}\0`;
  for (const [key, pending] of pendingSegmentGenerations) {
    if (!key.startsWith(prefix)) continue;
    pending.controller.abort();
    pendingSegmentGenerations.delete(key);
  }
}

function clearRequestDrivenSessionWork(sessionId: string) {
  cancelPendingLookaheadSegments(sessionId);
  cancelPendingSegmentGenerations(sessionId);
  abortActiveRequestDrivenSegmentSetups(sessionId);
  activeRequestDrivenSegmentWindows.delete(sessionId);
  sessionSegmentGenerationQueues.delete(sessionId);
}

function trackActiveRequestDrivenSegmentSetup(sessionId: string, controller: AbortController) {
  const active = activeRequestDrivenSegmentSetups.get(sessionId) ?? new Set<AbortController>();
  active.add(controller);
  activeRequestDrivenSegmentSetups.set(sessionId, active);

  return () => {
    active.delete(controller);
    if (active.size === 0 && activeRequestDrivenSegmentSetups.get(sessionId) === active) {
      activeRequestDrivenSegmentSetups.delete(sessionId);
    }
  };
}

function abortActiveRequestDrivenSegmentSetups(sessionId: string) {
  const active = activeRequestDrivenSegmentSetups.get(sessionId);
  if (!active) return;
  activeRequestDrivenSegmentSetups.delete(sessionId);
  for (const controller of active) {
    controller.abort();
  }
}

async function stopRequestDrivenSegmentWork(sessionId: string) {
  clearRequestDrivenSessionWork(sessionId);
  await transcodeBackend.cancel(sessionId).catch(() => undefined);
}

function isSegmentIndexNearWindow(
  segmentIndex: number,
  window: { firstSegmentIndex: number; lastSegmentIndex: number },
) {
  if (segmentIndex < window.firstSegmentIndex) {
    return window.firstSegmentIndex - segmentIndex <= REQUEST_DRIVEN_SEGMENT_WINDOW_COUNT;
  }
  if (segmentIndex > window.lastSegmentIndex) {
    return segmentIndex - window.lastSegmentIndex <= REQUEST_DRIVEN_SEGMENT_WINDOW_COUNT;
  }
  return true;
}

function isSegmentIndexNearTarget(segmentIndex: number, targetSegmentIndex: number) {
  return Math.abs(segmentIndex - targetSegmentIndex) <= REQUEST_DRIVEN_SEGMENT_WINDOW_COUNT;
}

async function replaceStaleRequestDrivenSegmentWork(sessionId: string, targetSegmentIndex: number) {
  let replaced = false;
  for (const [key, pending] of pendingSegmentGenerations) {
    const parts = segmentGenerationKeyParts(key);
    if (!parts || parts.sessionId !== sessionId) continue;
    const segmentIndex = hlsSegmentIndex(parts.segment);
    if (segmentIndex === null || isSegmentIndexNearTarget(segmentIndex, targetSegmentIndex)) {
      continue;
    }
    pending.controller.abort();
    replaced = true;
  }

  const activeWindow = activeRequestDrivenSegmentWindows.get(sessionId);
  if (activeWindow && !isSegmentIndexNearWindow(targetSegmentIndex, activeWindow)) {
    abortActiveRequestDrivenSegmentSetups(sessionId);
    activeRequestDrivenSegmentWindows.delete(sessionId);
    await transcodeBackend.cancel(sessionId).catch(() => undefined);
    replaced = true;
  }

  if (replaced) cancelPendingLookaheadSegments(sessionId);
}

export function pendingLookaheadSegmentCountForTests(sessionId: string) {
  const prefix = `${sessionId}\0`;
  let count = 0;
  for (const key of pendingLookaheadSegments.keys()) {
    if (key.startsWith(prefix)) count += 1;
  }
  return count;
}

export function pendingSegmentGenerationWaiterCountForTests(sessionId: string, segment: string) {
  return pendingSegmentGenerations.get(segmentGenerationKey(sessionId, segment))?.waiters.size ?? 0;
}

function trackPendingLookaheadSegments(input: {
  sessionId: string;
  userId: string;
  playlistPath: string;
  segments: HlsSegmentWindowEntry[];
  completion: Promise<void>;
}) {
  const completion = input.completion.then(
    () => undefined,
    () => undefined,
  );
  for (const segment of input.segments.slice(1)) {
    const key = segmentGenerationKey(input.sessionId, segment.segment);
    if (pendingLookaheadSegments.has(key)) continue;

    const controller = new AbortController();
    const promise = waitForHlsSegmentFile({
      playlistPath: input.playlistPath,
      segment: segment.segment,
      sessionId: input.sessionId,
      userId: input.userId,
      timeoutMs: requestDrivenLookaheadWaitMs,
      signal: controller.signal,
    });
    const pending = { controller, promise };
    pendingLookaheadSegments.set(key, pending);
    promise
      .finally(() => {
        if (pendingLookaheadSegments.get(key) === pending) {
          pendingLookaheadSegments.delete(key);
        }
      })
      .catch(() => undefined);
    void completion.then(async () => {
      if (pendingLookaheadSegments.get(key) !== pending) return;
      if (await hlsSegmentFileExists(input.playlistPath, segment.segment)) return;
      pending.controller.abort();
    });
  }
}

async function removeGeneratedSegmentFile(playlistPath: string, segment: string) {
  await rm(path.join(path.dirname(playlistPath), segment), {
    force: true,
  });
}

async function removeGeneratedSegmentFiles(playlistPath: string, segments: HlsSegmentWindowEntry[]) {
  await Promise.all(segments.map((segment) => removeGeneratedSegmentFile(playlistPath, segment.segment)));
}

class SegmentGenerationAbortedError extends Error {}

function removePendingSegmentGenerationWaiter(
  pending: PendingSegmentGeneration,
  waiter: PendingSegmentGenerationWaiter,
) {
  if (waiter.signal && waiter.abort) {
    waiter.signal.removeEventListener("abort", waiter.abort);
  }
  pending.waiters.delete(waiter);
  if (waiter.aborted && pending.waiters.size === 0 && !pending.controller.signal.aborted) {
    pending.controller.abort();
  }
}

function waitForPendingSegmentGeneration(pending: PendingSegmentGeneration, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.resolve(false);

  const waiter: PendingSegmentGenerationWaiter = {
    signal,
    aborted: false,
  };
  pending.waiters.add(waiter);

  if (!signal) {
    return pending.promise.finally(() => {
      removePendingSegmentGenerationWaiter(pending, waiter);
    });
  }

  const abort = new Promise<boolean>((resolve) => {
    waiter.abort = () => {
      waiter.aborted = true;
      removePendingSegmentGenerationWaiter(pending, waiter);
      resolve(false);
    };
    signal.addEventListener("abort", waiter.abort, { once: true });
  });

  return Promise.race([pending.promise, abort]).finally(() => {
    removePendingSegmentGenerationWaiter(pending, waiter);
  });
}

async function assertSegmentGenerationStillPlayable(input: {
  sessionId: string;
  userId: string;
  playlistPath: string;
  stopSegmentWork?: () => Promise<void>;
}) {
  const [session, policy] = await Promise.all([getTranscodeSession(input.sessionId), getTranscodePolicy(input.userId)]);
  if (!policy.transcodingEnabled) {
    await (input.stopSegmentWork ?? (() => stopRequestDrivenSegmentWork(input.sessionId)))();
    await updateActiveTranscodeSessionStatus(input.sessionId, "failed", TRANSCODING_DISABLED_MESSAGE);
    throw new SegmentGenerationAbortedError(TRANSCODING_DISABLED_MESSAGE);
  }
  if (
    !session ||
    session.userId !== input.userId ||
    session.status !== "running" ||
    session.playlistPath !== input.playlistPath
  ) {
    await (input.stopSegmentWork ?? (() => stopRequestDrivenSegmentWork(input.sessionId)))();
    throw new SegmentGenerationAbortedError(PLAYBACK_SESSION_INACTIVE_MESSAGE);
  }
}

async function runQueuedSegmentGeneration<T>(sessionId: string, task: () => Promise<T>) {
  const previous = sessionSegmentGenerationQueues.get(sessionId) ?? Promise.resolve();
  const running = previous.catch(() => undefined).then(task);
  const queueTail = running.then(
    () => undefined,
    () => undefined,
  );
  sessionSegmentGenerationQueues.set(sessionId, queueTail);
  queueTail
    .finally(() => {
      if (sessionSegmentGenerationQueues.get(sessionId) === queueTail) {
        sessionSegmentGenerationQueues.delete(sessionId);
      }
    })
    .catch(() => undefined);
  return running;
}

function requestDrivenSegmentWindow(input: {
  durationSeconds: number;
  segmentIndex: number;
  segmentSeconds: number;
  segmentFormat?: HlsSegmentFormat;
  maxSegmentCount?: number;
}): HlsSegmentWindowEntry[] {
  const maxSegmentCount = Math.max(1, Math.floor(input.maxSegmentCount ?? REQUEST_DRIVEN_SEGMENT_WINDOW_COUNT));
  const segments: HlsSegmentWindowEntry[] = [];

  for (let offset = 0; offset < maxSegmentCount; offset += 1) {
    const segmentIndex = input.segmentIndex + offset;
    const segmentStartSeconds = segmentIndex * input.segmentSeconds;
    if (segmentStartSeconds >= input.durationSeconds) break;

    const remainingSeconds = input.durationSeconds - segmentStartSeconds;
    const segmentSeconds = Math.min(input.segmentSeconds, remainingSeconds);
    if (segmentSeconds <= 0) break;

    segments.push({
      segment: hlsSegmentName(segmentIndex, input.segmentFormat),
      segmentIndex,
      segmentStartSeconds,
      segmentSeconds,
    });
  }

  return segments;
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
  const supersededSessions = await listActiveHlsPlaybackSessionsForMedia(mediaFileId, userId, mode);
  for (const session of supersededSessions) {
    if (session.sessionId === replacementSessionId) continue;
    await cancelPlaybackSession(session.sessionId, PLAYBACK_SESSION_REPLACED_MESSAGE);
  }
}

export async function cancelPlaybackSession(
  sessionId: string,
  message = PLAYBACK_CANCELLED_MESSAGE,
): Promise<CancelPlaybackSessionResult> {
  const session = await getTranscodeSession(sessionId);
  if (!session) return "missing";
  if (session.status !== "queued" && session.status !== "running" && session.status !== "completed") return "inactive";

  const updated =
    session.status === "completed"
      ? (await updateTranscodeSessionStatus(sessionId, "cancelled", message), true)
      : await updateActiveTranscodeSessionStatus(sessionId, "cancelled", message);
  if (!updated) return "inactive";

  clearRequestDrivenSessionWork(sessionId);
  await Promise.all([transcodeBackend.cancel(sessionId).catch(() => undefined)]);
  await rm(playbackSessionArtifactDirectory(sessionId), {
    recursive: true,
    force: true,
  });
  await deleteTranscodeHlsArtifacts(sessionId);

  return "cancelled";
}

export async function expireStalePlaybackSessions(maxIdleMs = TRANSCODE_HEARTBEAT_TIMEOUT_MS): Promise<number> {
  const cutoffIso = new Date(Date.now() - Math.max(0, maxIdleMs)).toISOString();
  const sessions = await listStaleActiveTranscodeSessions(cutoffIso);
  let expired = 0;
  for (const session of sessions) {
    const result = await cancelPlaybackSession(session.sessionId, PLAYBACK_HEARTBEAT_EXPIRED_MESSAGE);
    if (result === "cancelled") expired += 1;
  }
  return expired;
}

export async function expireIdleReadyHlsPlaybackSessions(
  maxIdleMs = TRANSCODE_SEGMENT_IDLE_TIMEOUT_MS,
): Promise<number> {
  const cutoffIso = new Date(Date.now() - Math.max(0, maxIdleMs)).toISOString();
  const sessions = await listIdleReadyHlsTranscodeSessions(cutoffIso);
  let expired = 0;
  for (const session of sessions) {
    const result = await cancelPlaybackSession(session.sessionId, PLAYBACK_SEGMENT_IDLE_EXPIRED_MESSAGE);
    if (result === "cancelled") expired += 1;
  }
  return expired;
}

export async function cancelActivePlaybackSessions(message = TRANSCODING_DISABLED_MESSAGE): Promise<number> {
  let cancelled = 0;

  while (true) {
    const sessions = await listActiveTranscodeSessions(ACTIVE_TRANSCODE_CANCEL_BATCH_SIZE);
    if (sessions.length === 0) break;

    let batchCancelled = 0;
    for (const session of sessions) {
      const result = await cancelPlaybackSession(session.sessionId, message);
      if (result === "cancelled") {
        cancelled += 1;
        batchCancelled += 1;
      }
    }

    if (sessions.length < ACTIVE_TRANSCODE_CANCEL_BATCH_SIZE || batchCancelled === 0) break;
  }

  return cancelled;
}

export async function pruneActiveHlsSegmentArtifacts(keepBehind?: number): Promise<number> {
  const sessions = await listRunningHlsTranscodeSessions();
  let pruned = 0;

  for (const session of sessions) {
    if (session.lastSegmentIndex === null) continue;
    pruned += await pruneHlsSegmentsBehind(
      session.playlistPath,
      hlsSegmentName(
        session.lastSegmentIndex,
        session.lastSegmentName
          ? hlsSegmentFormatFromSegmentName(session.lastSegmentName)
          : requestDrivenHlsSegmentFormat(),
      ),
      keepBehind,
    ).catch(() => 0);
  }

  return pruned;
}

async function generateHlsSegmentForRequest(input: {
  sessionId: string;
  userId: string;
  segment: string;
  signal?: AbortSignal;
}) {
  let segmentWorkStopped = false;
  const stopSegmentWork = async () => {
    if (segmentWorkStopped) return;
    segmentWorkStopped = true;
    await stopRequestDrivenSegmentWork(input.sessionId);
  };
  const segmentIndex = hlsSegmentIndex(input.segment);
  if (input.signal?.aborted) return false;
  if (segmentIndex === null || !transcodeBackend.generateHlsSegmentWindow) return false;
  const segmentFormat = requestDrivenHlsSegmentFormat({
    segment: input.segment,
  });
  if (input.segment !== hlsSegmentName(segmentIndex, segmentFormat)) return false;

  const session = await getTranscodeSession(input.sessionId);
  if (!session || session.userId !== input.userId || !session.playlistPath) return false;
  if (session.status === "failed" || session.status === "cancelled") {
    throw new SegmentGenerationAbortedError(PLAYBACK_SESSION_INACTIVE_MESSAGE);
  }
  if (session.status !== "running") return false;
  if (session.pipeline !== "request_driven") return false;
  const policy = await getTranscodePolicy(input.userId);
  if (!policy.transcodingEnabled) {
    await stopSegmentWork();
    await updateActiveTranscodeSessionStatus(input.sessionId, "failed", TRANSCODING_DISABLED_MESSAGE);
    return false;
  }
  if (await hlsSegmentFileExists(session.playlistPath, input.segment)) return true;
  const pendingLookahead = pendingLookaheadSegments.get(segmentGenerationKey(input.sessionId, input.segment));
  if (pendingLookahead) {
    const ready = await waitForBooleanWithSignal(pendingLookahead.promise, input.signal);
    if (input.signal?.aborted) return false;
    if (ready && (await hlsSegmentFileExists(session.playlistPath, input.segment))) {
      await assertSegmentGenerationStillPlayable({
        sessionId: input.sessionId,
        userId: input.userId,
        playlistPath: session.playlistPath,
        stopSegmentWork,
      });
      return true;
    }
    await assertSegmentGenerationStillPlayable({
      sessionId: input.sessionId,
      userId: input.userId,
      playlistPath: session.playlistPath,
      stopSegmentWork,
    });
  }
  if (session.durationSeconds === null || !Number.isFinite(session.durationSeconds) || session.durationSeconds <= 0) {
    return false;
  }

  const defaultSegmentSeconds = DEFAULT_HLS_SEGMENT_SECONDS;
  const segmentWindow = requestDrivenSegmentWindow({
    durationSeconds: session.durationSeconds,
    segmentIndex,
    segmentSeconds: defaultSegmentSeconds,
    segmentFormat,
  });
  const requestedSegment = segmentWindow[0];
  if (!requestedSegment || requestedSegment.segment !== input.segment) return false;

  const file = await getMediaFile(session.mediaFileId, input.userId);
  if (!file) {
    await updateActiveTranscodeSessionStatus(input.sessionId, "failed", MEDIA_FILE_UNAVAILABLE_MESSAGE);
    await removeTranscodeSessionArtifacts(input.sessionId);
    await stopSegmentWork();
    throw new Error(MEDIA_FILE_UNAVAILABLE_MESSAGE);
  }
  if (!isRemoteLibrarySource(file.source) && !(await isReadableFile(file.path))) {
    await updateActiveTranscodeSessionStatus(input.sessionId, "failed", MEDIA_FILE_UNAVAILABLE_MESSAGE);
    await removeTranscodeSessionArtifacts(input.sessionId);
    await stopSegmentWork();
    throw new Error(MEDIA_FILE_UNAVAILABLE_MESSAGE);
  }

  const segmentSetupController = new AbortController();
  const abortSegmentSetupFromRequest = () => segmentSetupController.abort();
  input.signal?.addEventListener("abort", abortSegmentSetupFromRequest, {
    once: true,
  });
  const cleanupSegmentSetup = trackActiveRequestDrivenSegmentSetup(input.sessionId, segmentSetupController);
  let activeSegmentWindow: { firstSegmentIndex: number; lastSegmentIndex: number } | undefined;
  let inputSource: Awaited<ReturnType<typeof createSeekableStorageInputSource>> | undefined;
  let segmentWindowInput: HlsSegmentWindowTranscodeInput | undefined;
  let segmentWindowGeneration: HlsSegmentWindowGeneration | undefined;
  const generateRequestedSegment = async (mode: NonNullable<typeof session.mode>) => {
    if (!segmentWindowInput || !transcodeBackend.generateHlsSegmentWindow) {
      throw new Error("Request-driven HLS segment generation is unavailable.");
    }
    return transcodeBackend.generateHlsSegmentWindow({
      ...segmentWindowInput,
      mode,
    });
  };
  try {
    const lastWindowSegment = segmentWindow.at(-1);
    if (!lastWindowSegment) return false;
    activeSegmentWindow = {
      firstSegmentIndex: requestedSegment.segmentIndex,
      lastSegmentIndex: lastWindowSegment.segmentIndex,
    };
    activeRequestDrivenSegmentWindows.set(input.sessionId, activeSegmentWindow);
    inputSource = isRemoteLibrarySource(file.source)
      ? await createSeekableStorageInputSource(file, segmentSetupController.signal)
      : undefined;
    await assertSegmentGenerationStillPlayable({
      sessionId: input.sessionId,
      userId: input.userId,
      playlistPath: session.playlistPath,
      stopSegmentWork,
    });
    const generationMode = requestDrivenGenerationMode(session.mode);
    if (generationMode !== session.mode) {
      if (!(await updateTranscodeSessionMode(input.sessionId, generationMode))) {
        throw new SegmentGenerationAbortedError(PLAYBACK_SESSION_INACTIVE_MESSAGE);
      }
    }
    const audioStreamIndex = await selectPlaybackAudioStreamIndex({
      mediaFileId: session.mediaFileId,
      mode: generationMode,
      preferredAudioLanguage: policy.preferredAudioLanguage,
    });
    segmentWindowInput = {
      sessionId: input.sessionId,
      mediaFileId: session.mediaFileId,
      inputPath: file.path,
      inputSource,
      artifactDirectory: path.dirname(session.playlistPath),
      playlistPath: session.playlistPath,
      segments: segmentWindow,
      expectAudio: Boolean(file.audio_codec),
      audioStreamIndex,
      segmentSeconds: defaultSegmentSeconds,
      hlsSegmentFormat: segmentFormat,
      segmentGenerationTimeoutMs: REQUEST_DRIVEN_SEGMENT_TIMEOUT_MS,
      signal: segmentSetupController.signal,
      mode: generationMode,
      hardwareAcceleration: policy.hardwareAcceleration,
      hardwareAccelerationRequired: policy.hardwareAccelerationRequired,
      transcodeQuality: policy.transcodeQuality,
    };
    segmentWindowGeneration = await generateRequestedSegment(generationMode);
    if (input.signal?.aborted) {
      await stopSegmentWork();
      await removeGeneratedSegmentFiles(session.playlistPath, segmentWindow);
      return false;
    }
    if (!(await hlsSegmentFileExists(session.playlistPath, input.segment))) {
      throw new Error(missingGeneratedSegmentMessage(input.segment));
    }
    await assertSegmentGenerationStillPlayable({
      sessionId: input.sessionId,
      userId: input.userId,
      playlistPath: session.playlistPath,
      stopSegmentWork,
    });
    trackPendingLookaheadSegments({
      sessionId: input.sessionId,
      userId: input.userId,
      playlistPath: session.playlistPath,
      segments: segmentWindow,
      completion: segmentWindowGeneration.completion,
    });
  } catch (error) {
    if (input.signal?.aborted) {
      await stopSegmentWork();
      if (segmentWindowInput) {
        await removeGeneratedSegmentFiles(session.playlistPath, segmentWindow);
      }
      return false;
    }

    if (
      segmentWindowInput?.mode === "remux" &&
      segmentWindowInput &&
      !(error instanceof SegmentGenerationAbortedError)
    ) {
      await removeGeneratedSegmentFiles(session.playlistPath, segmentWindow);
      await assertSegmentGenerationStillPlayable({
        sessionId: input.sessionId,
        userId: input.userId,
        playlistPath: session.playlistPath,
        stopSegmentWork,
      });
      try {
        segmentWindowGeneration = await generateRequestedSegment("transcode");
        if (input.signal?.aborted) {
          await stopSegmentWork();
          await removeGeneratedSegmentFiles(session.playlistPath, segmentWindow);
          return false;
        }
        if (!(await hlsSegmentFileExists(session.playlistPath, input.segment))) {
          throw new Error(missingGeneratedSegmentMessage(input.segment));
        }
        await assertSegmentGenerationStillPlayable({
          sessionId: input.sessionId,
          userId: input.userId,
          playlistPath: session.playlistPath,
          stopSegmentWork,
        });
        trackPendingLookaheadSegments({
          sessionId: input.sessionId,
          userId: input.userId,
          playlistPath: session.playlistPath,
          segments: segmentWindow,
          completion: segmentWindowGeneration.completion,
        });
        if (!(await updateTranscodeSessionMode(input.sessionId, "transcode"))) {
          throw new SegmentGenerationAbortedError(PLAYBACK_SESSION_INACTIVE_MESSAGE);
        }
        return true;
      } catch (fallbackError) {
        const latestPolicy = await getTranscodePolicy(input.userId);
        const fallbackMessage = !latestPolicy.transcodingEnabled
          ? TRANSCODING_DISABLED_MESSAGE
          : fallbackError instanceof Error
            ? fallbackError.message
            : "Request-driven HLS segment generation failed.";
        await stopSegmentWork();
        await removeGeneratedSegmentFiles(session.playlistPath, segmentWindow);
        if (!latestPolicy.transcodingEnabled) {
          await updateActiveTranscodeSessionStatus(input.sessionId, "failed", fallbackMessage);
          await removeTranscodeSessionArtifacts(input.sessionId);
          throw new SegmentGenerationAbortedError(fallbackMessage);
        }
        const message = `Remux segment generation failed; full transcode fallback failed: ${fallbackMessage}`;
        await updateActiveTranscodeSessionStatus(input.sessionId, "failed", message);
        await removeTranscodeSessionArtifacts(input.sessionId);
        throw new Error(message);
      }
    }

    const latestPolicy = await getTranscodePolicy(input.userId);
    const message = !latestPolicy.transcodingEnabled
      ? TRANSCODING_DISABLED_MESSAGE
      : error instanceof Error
        ? error.message
        : "Request-driven HLS segment generation failed.";
    await stopSegmentWork();
    if (segmentWindowInput) {
      await removeGeneratedSegmentFiles(session.playlistPath, segmentWindow);
    }
    await updateActiveTranscodeSessionStatus(input.sessionId, "failed", message);
    await removeTranscodeSessionArtifacts(input.sessionId);
    if (!latestPolicy.transcodingEnabled) {
      throw new SegmentGenerationAbortedError(message);
    }
    throw error;
  } finally {
    const generationCompletion = segmentWindowGeneration?.completion;
    if (activeSegmentWindow) {
      if (generationCompletion) {
        void generationCompletion
          .finally(() => {
            if (activeRequestDrivenSegmentWindows.get(input.sessionId) === activeSegmentWindow) {
              activeRequestDrivenSegmentWindows.delete(input.sessionId);
            }
          })
          .catch(() => undefined);
      } else if (activeRequestDrivenSegmentWindows.get(input.sessionId) === activeSegmentWindow) {
        activeRequestDrivenSegmentWindows.delete(input.sessionId);
      }
    }
    input.signal?.removeEventListener("abort", abortSegmentSetupFromRequest);
    cleanupSegmentSetup();
    if (inputSource && segmentWindowGeneration && segmentWindowGeneration.inputSourceDisposition !== "backend") {
      const source = inputSource;
      void segmentWindowGeneration.completion.finally(() => source.close()).catch(() => undefined);
    } else if (!segmentWindowGeneration) {
      await inputSource?.close().catch(() => undefined);
    }
  }

  return true;
}

export async function ensureHlsSegmentForRequest(input: {
  sessionId: string;
  userId: string;
  segment: string;
  signal?: AbortSignal;
}) {
  if (input.signal?.aborted) return false;
  const key = segmentGenerationKey(input.sessionId, input.segment);
  const pending = pendingSegmentGenerations.get(key);
  if (pending) return waitForPendingSegmentGeneration(pending, input.signal);
  const segmentIndex = hlsSegmentIndex(input.segment);
  if (
    segmentIndex !== null &&
    input.segment === hlsSegmentName(segmentIndex, requestDrivenHlsSegmentFormat({ segment: input.segment }))
  ) {
    await replaceStaleRequestDrivenSegmentWork(input.sessionId, segmentIndex);
  }
  const pendingAfterStaleReplacement = pendingSegmentGenerations.get(key);
  if (pendingAfterStaleReplacement) {
    return waitForPendingSegmentGeneration(pendingAfterStaleReplacement, input.signal);
  }

  const controller = new AbortController();
  const generation = runQueuedSegmentGeneration(input.sessionId, () =>
    generateHlsSegmentForRequest({
      ...input,
      signal: controller.signal,
    }),
  );
  const created: PendingSegmentGeneration = {
    controller,
    promise: generation,
    waiters: new Set(),
  };
  pendingSegmentGenerations.set(key, created);
  generation
    .finally(() => {
      if (pendingSegmentGenerations.get(key) === created) {
        pendingSegmentGenerations.delete(key);
      }
    })
    .catch(() => undefined);
  return waitForPendingSegmentGeneration(created, input.signal);
}

export async function ensureHlsLookaheadForSegment(input: {
  sessionId: string;
  userId: string;
  segment: string;
  signal?: AbortSignal;
}) {
  const segmentIndex = hlsSegmentIndex(input.segment);
  if (input.signal?.aborted || segmentIndex === null) return false;
  const segmentFormat = requestDrivenHlsSegmentFormat({
    segment: input.segment,
  });
  if (input.segment !== hlsSegmentName(segmentIndex, segmentFormat)) {
    return false;
  }

  const currentSession = async () => {
    const session = await getTranscodeSession(input.sessionId);
    if (
      !session ||
      session.userId !== input.userId ||
      session.status !== "running" ||
      session.pipeline !== "request_driven" ||
      !session.playlistPath ||
      session.durationSeconds === null ||
      !Number.isFinite(session.durationSeconds) ||
      session.durationSeconds <= 0
    ) {
      return null;
    }
    if (session.lastSegmentIndex !== null && !isSegmentIndexNearTarget(session.lastSegmentIndex, segmentIndex)) {
      return null;
    }
    return session;
  };

  const session = await currentSession();
  if (!session) return false;
  const durationSeconds = session.durationSeconds;
  const playlistPath = session.playlistPath;
  if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || !playlistPath) {
    return false;
  }

  const lastSegmentIndex = Math.ceil(durationSeconds / DEFAULT_HLS_SEGMENT_SECONDS) - 1;
  const targetSegmentIndex = Math.min(lastSegmentIndex, segmentIndex + REQUEST_DRIVEN_SEGMENT_WINDOW_COUNT);
  if (targetSegmentIndex <= segmentIndex) return true;

  for (let candidateIndex = segmentIndex + 1; candidateIndex <= targetSegmentIndex; candidateIndex += 1) {
    if (input.signal?.aborted) return false;
    const candidateSegment = hlsSegmentName(candidateIndex, segmentFormat);
    const latestSession = await currentSession();
    if (!latestSession) return false;
    if (await hlsSegmentFileExists(playlistPath, candidateSegment)) {
      continue;
    }
    const pendingLookahead = pendingLookaheadSegments.get(segmentGenerationKey(input.sessionId, candidateSegment));
    if (pendingLookahead) {
      const ready = await waitForBooleanWithSignal(pendingLookahead.promise, input.signal);
      if (!ready) return false;
      continue;
    }
    const ready = await ensureHlsSegmentForRequest({
      sessionId: input.sessionId,
      userId: input.userId,
      segment: candidateSegment,
      signal: input.signal,
    });
    if (!ready) return false;
  }

  return true;
}

export function startStaleTranscodeExpiryLoop() {
  if (staleExpiryLoop) return;
  staleExpiryLoop = setInterval(() => {
    void (async () => {
      await expireStalePlaybackSessions();
      await expireIdleReadyHlsPlaybackSessions();
      await pruneActiveHlsSegmentArtifacts();
      staleExpiryLoopTicks += 1;
      if (staleExpiryLoopTicks % PLAYBACK_SESSION_ARTIFACT_CLEANUP_TICKS === 0) {
        await cleanupConfiguredPlaybackSessionArtifacts();
        await cleanupJobHistory();
      }
    })().catch((error: unknown) => {
      console.error("Failed to clean up stale playback sessions.", error);
    });
  }, TRANSCODE_EXPIRY_INTERVAL_MS);
  if (typeof staleExpiryLoop === "object" && "unref" in staleExpiryLoop) {
    staleExpiryLoop.unref();
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
