import { rm } from "node:fs/promises";
import path from "node:path";
import { getMediaFile } from "../media/files";
import { isRemoteLibrarySource } from "../libraries/source";
import {
  getEncodeAheadSegmentCount,
  getPlaybackCacheBindingForSession,
  isPlaybackCacheEntryStale,
  switchPlaybackCacheForSession,
  touchPlaybackCacheForSession,
  updatePlaybackCacheStats,
} from "./cache";
import type { HlsSegmentWindowEntry, HlsSegmentWindowGeneration, HlsSegmentWindowTranscodeInput } from "./backend";
import { encodeJobId, encodeLockKey, type EncodeJobHandle, getEncodeCoordinator } from "./encode-coordinator";
import {
  DEFAULT_HLS_SEGMENT_SECONDS,
  PREFETCH_SEEK_DISTANCE_SEGMENTS,
  type HlsSegmentFormat,
  hlsSegmentFileExists,
  hlsSegmentIndex,
  hlsSegmentName,
} from "./hls";
import { getTranscodePolicy } from "./policy";
import { getTranscodeSession, updateActiveTranscodeSessionStatus, updateTranscodeSessionMode } from "./sessions";
import type { TranscodeBackend } from "./backend";
export const REQUEST_DRIVEN_SEGMENT_TIMEOUT_MS = 120_000;
const PLAYBACK_SESSION_INACTIVE_MESSAGE = "Playback session is no longer active.";
export const TRANSCODING_DISABLED_MESSAGE = "Transcoding is disabled by an administrator.";
const MEDIA_FILE_UNAVAILABLE_MESSAGE = "Media file is no longer available.";

class SegmentGenerationAbortedError extends Error {}

type SegmentJobDeps = {
  transcodeBackend: TranscodeBackend;
  requestDrivenHlsSegmentFormat: (input?: { segment?: string }) => HlsSegmentFormat;
  selectPlaybackAudioStreamIndex: (input: {
    mediaFileId: string;
    mode: "remux" | "transcode";
    preferredAudioLanguage: string | null;
  }) => Promise<number | null>;
  createSeekableStorageInputSource: (
    file: NonNullable<Awaited<ReturnType<typeof getMediaFile>>>,
    signal?: AbortSignal,
  ) => Promise<NonNullable<HlsSegmentWindowTranscodeInput["inputSource"]>>;
  isReadableFile: (filePath: string) => Promise<boolean>;
  removeTranscodeSessionArtifacts: (sessionId: string) => Promise<void>;
  stopRequestDrivenSegmentWork: (sessionId: string) => Promise<void>;
};

function missingGeneratedSegmentMessage(segment: string) {
  return `Request-driven HLS segment generation completed without publishing ${segment}.`;
}

export function requestDrivenSegmentWindow(input: {
  durationSeconds: number;
  segmentIndex: number;
  segmentSeconds: number;
  segmentFormat?: HlsSegmentFormat;
  maxSegmentCount: number;
}): HlsSegmentWindowEntry[] {
  const maxSegmentCount = Math.max(1, Math.floor(input.maxSegmentCount));
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

async function removeGeneratedSegmentFile(playlistPath: string, segment: string, encodeDirectory?: string | null) {
  const directories = encodeDirectory ? [encodeDirectory, path.dirname(playlistPath)] : [path.dirname(playlistPath)];
  await Promise.all(
    directories.map((directory) => rm(path.join(directory, segment), { force: true }).catch(() => undefined)),
  );
}

async function removeGeneratedSegmentFiles(
  playlistPath: string,
  segments: HlsSegmentWindowEntry[],
  encodeDirectory?: string | null,
) {
  await Promise.all(
    segments.map((segment) => removeGeneratedSegmentFile(playlistPath, segment.segment, encodeDirectory)),
  );
}

async function assertSegmentGenerationStillPlayable(
  deps: SegmentJobDeps,
  input: {
    sessionId: string;
    userId: string;
    playlistPath: string;
    stopSegmentWork?: () => Promise<void>;
  },
) {
  const [session, policy] = await Promise.all([getTranscodeSession(input.sessionId), getTranscodePolicy(input.userId)]);
  if (!policy.transcodingEnabled) {
    await (input.stopSegmentWork ?? (() => deps.stopRequestDrivenSegmentWork(input.sessionId)))();
    await updateActiveTranscodeSessionStatus(input.sessionId, "failed", TRANSCODING_DISABLED_MESSAGE);
    throw new SegmentGenerationAbortedError(TRANSCODING_DISABLED_MESSAGE);
  }
  if (
    !session ||
    session.userId !== input.userId ||
    session.status !== "running" ||
    session.playlistPath !== input.playlistPath
  ) {
    await (input.stopSegmentWork ?? (() => deps.stopRequestDrivenSegmentWork(input.sessionId)))();
    throw new SegmentGenerationAbortedError(PLAYBACK_SESSION_INACTIVE_MESSAGE);
  }
}

async function startHlsEncodeJob(
  deps: SegmentJobDeps,
  input: {
    sessionId: string;
    userId: string;
    segment: string;
    segmentIndex: number;
    segmentFormat: HlsSegmentFormat;
    playlistPath: string;
    requestSignal?: AbortSignal;
    signal: AbortSignal;
    stopSegmentWork: () => Promise<void>;
  },
): Promise<EncodeJobHandle | false> {
  if (input.signal.aborted) return false;
  if (!deps.transcodeBackend.generateHlsSegmentWindow) return false;

  const session = await getTranscodeSession(input.sessionId);
  if (!session || session.userId !== input.userId || !session.playlistPath) return false;
  if (session.status !== "running" || session.pipeline !== "request_driven") return false;
  if (session.durationSeconds === null || !Number.isFinite(session.durationSeconds) || session.durationSeconds <= 0) {
    return false;
  }

  const policy = await getTranscodePolicy(input.userId);
  const file = await getMediaFile(session.mediaFileId, input.userId);
  if (!file) return false;
  if (!isRemoteLibrarySource(file.source) && !(await deps.isReadableFile(file.path))) return false;

  const encodeAheadSegmentCount = await getEncodeAheadSegmentCount();
  const segmentWindow = requestDrivenSegmentWindow({
    durationSeconds: session.durationSeconds,
    segmentIndex: input.segmentIndex,
    segmentSeconds: DEFAULT_HLS_SEGMENT_SECONDS,
    segmentFormat: input.segmentFormat,
    maxSegmentCount: encodeAheadSegmentCount,
  });
  const requestedSegment = segmentWindow.find((entry) => entry.segmentIndex === input.segmentIndex);
  const lastWindowSegment = segmentWindow.at(-1);
  if (!requestedSegment || !lastWindowSegment || requestedSegment.segment !== input.segment) return false;

  const cacheBinding = await getPlaybackCacheBindingForSession(input.sessionId);
  let workingEncodeDirectory = cacheBinding.encodeArtifactDirectory ?? path.dirname(input.playlistPath);
  let workingCacheId = cacheBinding.cacheId ?? session.cacheId ?? null;

  if (await hlsSegmentFileExists(input.playlistPath, input.segment, workingEncodeDirectory)) {
    if (workingEncodeDirectory !== path.dirname(input.playlistPath)) {
      await touchPlaybackCacheForSession(input.sessionId);
    }
    return false;
  }

  const jobController = new AbortController();
  const linkedAbort = () => {
    jobController.abort();
  };
  input.signal.addEventListener("abort", linkedAbort, { once: true });
  input.requestSignal?.addEventListener("abort", linkedAbort, { once: true });

  const firstSegmentIndex = requestedSegment.segmentIndex;
  let inputSource: Awaited<ReturnType<typeof deps.createSeekableStorageInputSource>> | undefined;
  let segmentWindowInput: HlsSegmentWindowTranscodeInput | undefined;

  const runGeneration = async (): Promise<HlsSegmentWindowGeneration> => {
    inputSource = isRemoteLibrarySource(file.source)
      ? await deps.createSeekableStorageInputSource(file, jobController.signal)
      : undefined;
    await assertSegmentGenerationStillPlayable(deps, {
      sessionId: input.sessionId,
      userId: input.userId,
      playlistPath: input.playlistPath,
      stopSegmentWork: input.stopSegmentWork,
    });

    const audioStreamIndex = await deps.selectPlaybackAudioStreamIndex({
      mediaFileId: session.mediaFileId,
      mode: session.mode,
      preferredAudioLanguage: policy.preferredAudioLanguage,
    });

    segmentWindowInput = {
      sessionId: input.sessionId,
      mediaFileId: session.mediaFileId,
      inputPath: file.path,
      inputSource,
      artifactDirectory: workingEncodeDirectory,
      playlistPath: input.playlistPath,
      segments: segmentWindow,
      expectAudio: Boolean(file.audio_codec),
      audioStreamIndex,
      segmentSeconds: DEFAULT_HLS_SEGMENT_SECONDS,
      hlsSegmentFormat: input.segmentFormat,
      encodeAheadSegmentCount,
      segmentGenerationTimeoutMs: REQUEST_DRIVEN_SEGMENT_TIMEOUT_MS,
      signal: jobController.signal,
      mode: session.mode,
      hardwareAcceleration: policy.hardwareAcceleration,
      hardwareAccelerationRequired: policy.hardwareAccelerationRequired,
      transcodeQuality: policy.transcodeQuality,
    };

    const generateRequestedSegment = async (mode: "remux" | "transcode") => {
      if (!segmentWindowInput || !deps.transcodeBackend.generateHlsSegmentWindow) {
        throw new Error("Request-driven HLS segment generation is unavailable.");
      }
      return deps.transcodeBackend.generateHlsSegmentWindow({
        ...segmentWindowInput,
        mode,
      });
    };

    try {
      const generation = await generateRequestedSegment(session.mode);
      try {
        await generation.completion;
      } catch (error) {
        if (!(await hlsSegmentFileExists(input.playlistPath, input.segment, workingEncodeDirectory))) {
          throw error;
        }
      }
      if (!(await hlsSegmentFileExists(input.playlistPath, input.segment, workingEncodeDirectory))) {
        throw new Error(missingGeneratedSegmentMessage(input.segment));
      }
      return generation;
    } catch (error) {
      if (jobController.signal.aborted || input.signal?.aborted) {
        throw error;
      }
      if (session.mode !== "remux" || error instanceof SegmentGenerationAbortedError) {
        throw error;
      }

      await removeGeneratedSegmentFiles(input.playlistPath, segmentWindow, workingEncodeDirectory);
      await assertSegmentGenerationStillPlayable(deps, {
        sessionId: input.sessionId,
        userId: input.userId,
        playlistPath: input.playlistPath,
        stopSegmentWork: input.stopSegmentWork,
      });

      const transcodeAudioStreamIndex = await deps.selectPlaybackAudioStreamIndex({
        mediaFileId: session.mediaFileId,
        mode: "transcode",
        preferredAudioLanguage: policy.preferredAudioLanguage,
      });
      const switched = await switchPlaybackCacheForSession({
        sessionId: input.sessionId,
        mediaFileId: session.mediaFileId,
        fileSizeBytes: file.size_bytes,
        fileMtimeMs: file.mtime_ms,
        mode: "transcode",
        policy,
        segmentFormat: input.segmentFormat,
        audioStreamIndex: transcodeAudioStreamIndex,
      });
      workingEncodeDirectory = switched.encodeArtifactDirectory;
      workingCacheId = switched.cacheId;
      segmentWindowInput.artifactDirectory = workingEncodeDirectory;
      segmentWindowInput.mode = "transcode";
      segmentWindowInput.audioStreamIndex = transcodeAudioStreamIndex;

      try {
        const generation = await generateRequestedSegment("transcode");
        try {
          await generation.completion;
        } catch (fallbackCompletionError) {
          if (!(await hlsSegmentFileExists(input.playlistPath, input.segment, workingEncodeDirectory))) {
            throw fallbackCompletionError;
          }
        }
        if (!(await hlsSegmentFileExists(input.playlistPath, input.segment, workingEncodeDirectory))) {
          throw new Error(missingGeneratedSegmentMessage(input.segment));
        }
        if (!(await updateTranscodeSessionMode(input.sessionId, "transcode"))) {
          throw new SegmentGenerationAbortedError(PLAYBACK_SESSION_INACTIVE_MESSAGE);
        }
        return generation;
      } catch (fallbackError) {
        const message =
          fallbackError instanceof Error ? fallbackError.message : "Request-driven HLS segment generation failed.";
        throw new Error(`Remux segment generation failed, and the full transcode fallback also failed: ${message}`);
      }
    }
  };

  const completion = (async () => {
    try {
      const generation = await runGeneration();
      if (workingCacheId) {
        await updatePlaybackCacheStats(workingCacheId, lastWindowSegment.segmentIndex);
      }
      if (inputSource && generation.inputSourceDisposition !== "backend") {
        await inputSource.close().catch(() => undefined);
      }
    } catch (error) {
      if (jobController.signal.aborted || input.signal?.aborted) {
        if (error) throw error;
        throw new SegmentGenerationAbortedError("Request-driven HLS segment generation aborted.");
      }
      if (inputSource) {
        await inputSource.close().catch(() => undefined);
      }
      if (segmentWindowInput) {
        await removeGeneratedSegmentFiles(input.playlistPath, segmentWindow, workingEncodeDirectory);
      }
      if (error instanceof SegmentGenerationAbortedError) throw error;
      const latestPolicy = await getTranscodePolicy(input.userId);
      const message = !latestPolicy.transcodingEnabled
        ? TRANSCODING_DISABLED_MESSAGE
        : error instanceof Error
          ? error.message
          : "Request-driven HLS segment generation failed.";
      await input.stopSegmentWork();
      await updateActiveTranscodeSessionStatus(input.sessionId, "failed", message);
      await deps.removeTranscodeSessionArtifacts(input.sessionId);
      throw error;
    }
  })();

  if (jobController.signal.aborted || input.signal.aborted) return false;

  return {
    jobId: encodeJobId(input.sessionId, firstSegmentIndex),
    firstSegmentIndex,
    lastSegmentIndex: lastWindowSegment.segmentIndex,
    completion,
    abort: () => {
      linkedAbort();
      void deps.transcodeBackend.cancelJob?.(input.sessionId, firstSegmentIndex).catch(() => undefined);
    },
  };
}

async function awaitRequestDrivenFailureSettlement(sessionId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const session = await getTranscodeSession(sessionId);
    if (session?.status === "failed" || session?.status === "cancelled") return session;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return getTranscodeSession(sessionId);
}

export async function generateHlsSegmentForRequest(
  deps: SegmentJobDeps,
  input: {
    sessionId: string;
    userId: string;
    segment: string;
    signal?: AbortSignal;
  },
): Promise<boolean> {
  let segmentWorkStopped = false;
  const stopSegmentWork = async () => {
    if (segmentWorkStopped) return;
    segmentWorkStopped = true;
    await deps.stopRequestDrivenSegmentWork(input.sessionId);
  };

  const segmentIndex = hlsSegmentIndex(input.segment);
  if (input.signal?.aborted) return false;
  if (segmentIndex === null || !deps.transcodeBackend.generateHlsSegmentWindow) return false;

  const segmentFormat = deps.requestDrivenHlsSegmentFormat({ segment: input.segment });
  if (input.segment !== hlsSegmentName(segmentIndex, segmentFormat)) return false;

  const session = await getTranscodeSession(input.sessionId);
  if (!session || session.userId !== input.userId || !session.playlistPath) return false;
  const playlistPath = session.playlistPath;
  if (session.status === "failed" || session.status === "cancelled") {
    throw new SegmentGenerationAbortedError(PLAYBACK_SESSION_INACTIVE_MESSAGE);
  }
  if (session.status !== "running" || session.pipeline !== "request_driven") return false;

  const policy = await getTranscodePolicy(input.userId);
  if (!policy.transcodingEnabled) {
    await stopSegmentWork();
    await updateActiveTranscodeSessionStatus(input.sessionId, "failed", TRANSCODING_DISABLED_MESSAGE);
    await deps.removeTranscodeSessionArtifacts(input.sessionId);
    return false;
  }

  const file = await getMediaFile(session.mediaFileId, input.userId);
  if (!file) {
    await updateActiveTranscodeSessionStatus(input.sessionId, "failed", MEDIA_FILE_UNAVAILABLE_MESSAGE);
    await deps.removeTranscodeSessionArtifacts(input.sessionId);
    await stopSegmentWork();
    throw new Error(MEDIA_FILE_UNAVAILABLE_MESSAGE);
  }
  if (!isRemoteLibrarySource(file.source) && !(await deps.isReadableFile(file.path))) {
    await updateActiveTranscodeSessionStatus(input.sessionId, "failed", MEDIA_FILE_UNAVAILABLE_MESSAGE);
    await deps.removeTranscodeSessionArtifacts(input.sessionId);
    await stopSegmentWork();
    throw new Error(MEDIA_FILE_UNAVAILABLE_MESSAGE);
  }

  let encodeArtifactDirectory = (await getPlaybackCacheBindingForSession(input.sessionId)).encodeArtifactDirectory;
  if (session.cacheId && (await isPlaybackCacheEntryStale(session.cacheId))) {
    const audioStreamIndex = await deps.selectPlaybackAudioStreamIndex({
      mediaFileId: session.mediaFileId,
      mode: session.mode,
      preferredAudioLanguage: policy.preferredAudioLanguage,
    });
    ({ encodeArtifactDirectory } = await switchPlaybackCacheForSession({
      sessionId: input.sessionId,
      mediaFileId: session.mediaFileId,
      fileSizeBytes: file.size_bytes,
      fileMtimeMs: file.mtime_ms,
      mode: session.mode,
      policy,
      segmentFormat,
      audioStreamIndex,
    }));
  }

  const resolvedEncodeDirectory = encodeArtifactDirectory ?? path.dirname(playlistPath);
  if (await hlsSegmentFileExists(playlistPath, input.segment, encodeArtifactDirectory ?? undefined)) {
    if (encodeArtifactDirectory) await touchPlaybackCacheForSession(input.sessionId);
    return true;
  }

  const cacheBinding = await getPlaybackCacheBindingForSession(input.sessionId);
  const cacheKey = encodeLockKey(cacheBinding.cacheId ?? session.cacheId ?? null, resolvedEncodeDirectory);
  const coordinator = getEncodeCoordinator(cacheKey);
  const encodeAheadSegmentCount = await getEncodeAheadSegmentCount();

  let ready = false;
  try {
    ready = await coordinator.ensureSegment({
      sessionId: input.sessionId,
      segment: input.segment,
      segmentIndex,
      signal: input.signal,
      encodeAheadSegmentCount,
      segmentTimeoutMs: REQUEST_DRIVEN_SEGMENT_TIMEOUT_MS,
      segmentExists: async (segment) => {
        const binding = await getPlaybackCacheBindingForSession(input.sessionId);
        const directory = binding.encodeArtifactDirectory ?? encodeArtifactDirectory ?? undefined;
        return hlsSegmentFileExists(playlistPath, segment, directory);
      },
      assertPlayable: () =>
        assertSegmentGenerationStillPlayable(deps, {
          sessionId: input.sessionId,
          userId: input.userId,
          playlistPath,
          stopSegmentWork,
        }),
      startJob: (startIndex, jobSignal) =>
        startHlsEncodeJob(deps, {
          sessionId: input.sessionId,
          userId: input.userId,
          segment: hlsSegmentName(startIndex, segmentFormat),
          segmentIndex: startIndex,
          segmentFormat,
          playlistPath,
          requestSignal: input.signal,
          signal: jobSignal,
          stopSegmentWork,
        }),
    });
  } catch (error) {
    let settledSession = await awaitRequestDrivenFailureSettlement(input.sessionId);
    if (settledSession?.status !== "failed" && settledSession?.status !== "cancelled" && error instanceof Error) {
      await updateActiveTranscodeSessionStatus(input.sessionId, "failed", error.message);
      await deps.removeTranscodeSessionArtifacts(input.sessionId);
      settledSession = await getTranscodeSession(input.sessionId);
    }
    if (settledSession?.status === "failed" && settledSession.errorMessage) {
      throw new Error(settledSession.errorMessage);
    }
    throw error;
  }
  if (ready) return true;
  const latestSession = await awaitRequestDrivenFailureSettlement(input.sessionId);
  if (latestSession?.status === "failed" && latestSession.errorMessage) {
    throw new Error(latestSession.errorMessage);
  }
  return false;
}

export async function ensureHlsLookaheadForSegment(
  deps: SegmentJobDeps,
  input: {
    sessionId: string;
    userId: string;
    segment: string;
    signal?: AbortSignal;
  },
): Promise<boolean> {
  const segmentIndex = hlsSegmentIndex(input.segment);
  if (input.signal?.aborted || segmentIndex === null) return false;
  const segmentFormat = deps.requestDrivenHlsSegmentFormat({ segment: input.segment });
  if (input.segment !== hlsSegmentName(segmentIndex, segmentFormat)) return false;

  const encodeAheadSegmentCount = await getEncodeAheadSegmentCount();
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
    if (
      session.lastSegmentIndex !== null &&
      Math.abs(session.lastSegmentIndex - segmentIndex) > PREFETCH_SEEK_DISTANCE_SEGMENTS
    ) {
      return null;
    }
    return session;
  };

  const session = await currentSession();
  if (!session?.playlistPath || session.durationSeconds === null) return false;
  const playlistPath = session.playlistPath;
  const encodeDirectory = (await getPlaybackCacheBindingForSession(input.sessionId)).encodeArtifactDirectory;
  const cacheKey = encodeLockKey(
    (await getPlaybackCacheBindingForSession(input.sessionId)).cacheId,
    encodeDirectory ?? path.dirname(playlistPath),
  );
  const coordinator = getEncodeCoordinator(cacheKey);
  const lastSegmentIndex = Math.ceil(session.durationSeconds / DEFAULT_HLS_SEGMENT_SECONDS) - 1;

  return coordinator.prefetchAhead({
    sessionId: input.sessionId,
    servedSegmentIndex: segmentIndex,
    lastSegmentIndex,
    segmentFormat,
    encodeAheadSegmentCount,
    signal: input.signal,
    segmentExists: async (_index, name) => hlsSegmentFileExists(playlistPath, name, encodeDirectory ?? undefined),
    ensureSegmentAt: async (_index, name) => {
      const latestSession = await currentSession();
      if (!latestSession) return false;
      return generateHlsSegmentForRequest(deps, {
        sessionId: input.sessionId,
        userId: input.userId,
        segment: name,
        signal: input.signal,
      });
    },
  });
}
