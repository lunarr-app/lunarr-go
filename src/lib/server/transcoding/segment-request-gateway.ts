import { getPlaybackCacheBindingForSession } from "./cache";
import {
  ensureHlsLookaheadForSegment as ensureHlsLookaheadForSegmentJob,
  generateHlsSegmentForRequest as generateHlsSegmentForRequestJob,
} from "./hls-segment-jobs";
import { encodeLockKey, getEncodeCoordinator, onEncodeSessionEnded } from "./encode-coordinator";
import { getTranscodeSession } from "./sessions";
import path from "node:path";
import { getTranscodeBackend } from "./playback-backend";
import { removeTranscodeSessionArtifacts, requestDrivenHlsSegmentFormat } from "./playback-lifecycle";
import { createSeekableStorageInputSource, isReadableFile, selectPlaybackAudioStreamIndex } from "./playback-resolve";

type ActiveSegmentEnsureWaiter = {
  signal?: AbortSignal;
  aborted: boolean;
  abort?: () => void;
};

type ActiveSegmentEnsure = {
  sessionId: string;
  controller: AbortController;
  promise: Promise<boolean>;
  waiters: Set<ActiveSegmentEnsureWaiter>;
};

const activeSegmentEnsures = new Map<string, ActiveSegmentEnsure>();

function segmentEnsureKey(sessionId: string, segment: string) {
  return `${sessionId}\0${segment}`;
}

export function abortActiveSegmentEnsuresForSession(sessionId: string) {
  const prefix = `${sessionId}\0`;
  for (const [key, active] of activeSegmentEnsures) {
    if (!key.startsWith(prefix)) continue;
    active.controller.abort();
    activeSegmentEnsures.delete(key);
  }
  onEncodeSessionEnded(sessionId);
}

export function clearAllActiveSegmentEnsures() {
  for (const active of activeSegmentEnsures.values()) {
    active.controller.abort();
  }
  activeSegmentEnsures.clear();
}

function removeActiveSegmentEnsureWaiter(active: ActiveSegmentEnsure, waiter: ActiveSegmentEnsureWaiter) {
  if (waiter.signal && waiter.abort) {
    waiter.signal.removeEventListener("abort", waiter.abort);
  }
  active.waiters.delete(waiter);
  if (waiter.aborted && active.waiters.size === 0 && !active.controller.signal.aborted) {
    active.controller.abort();
  }
}

function waitForActiveSegmentEnsure(active: ActiveSegmentEnsure, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.resolve(false);

  const waiter: ActiveSegmentEnsureWaiter = { signal, aborted: false };
  active.waiters.add(waiter);

  if (!signal) {
    return active.promise.finally(() => {
      removeActiveSegmentEnsureWaiter(active, waiter);
    });
  }

  const abort = new Promise<boolean>((resolve) => {
    waiter.abort = () => {
      waiter.aborted = true;
      removeActiveSegmentEnsureWaiter(active, waiter);
      resolve(false);
    };
    signal.addEventListener("abort", waiter.abort, { once: true });
  });

  return Promise.race([active.promise, abort]).finally(() => {
    removeActiveSegmentEnsureWaiter(active, waiter);
  });
}

async function encodeCoordinatorCacheKeyForSession(sessionId: string) {
  const [binding, session] = await Promise.all([
    getPlaybackCacheBindingForSession(sessionId),
    getTranscodeSession(sessionId),
  ]);
  const encodeDirectory =
    binding.encodeArtifactDirectory ?? (session?.playlistPath ? path.dirname(session.playlistPath) : "");
  if (!binding.cacheId && !encodeDirectory) return null;
  return encodeLockKey(binding.cacheId, encodeDirectory);
}

function segmentJobDeps() {
  return {
    transcodeBackend: getTranscodeBackend(),
    requestDrivenHlsSegmentFormat,
    selectPlaybackAudioStreamIndex,
    createSeekableStorageInputSource,
    isReadableFile,
    removeTranscodeSessionArtifacts,
    stopRequestDrivenSegmentWork: async (sessionId: string) => {
      const { stopRequestDrivenSegmentWork } = await import("./playback-lifecycle");
      return stopRequestDrivenSegmentWork(sessionId);
    },
  };
}

export async function segmentEnsureWaiterCountForTests(sessionId: string, segment: string) {
  const active = activeSegmentEnsures.get(segmentEnsureKey(sessionId, segment));
  if (active) return active.waiters.size;
  const cacheKey = await encodeCoordinatorCacheKeyForSession(sessionId);
  if (!cacheKey) return 0;
  return getEncodeCoordinator(cacheKey).segmentEnsureWaiterCountForTests(segment);
}

export async function ensureHlsSegmentForRequest(input: {
  sessionId: string;
  userId: string;
  segment: string;
  signal?: AbortSignal;
}) {
  if (input.signal?.aborted) return false;
  const key = segmentEnsureKey(input.sessionId, input.segment);
  let active = activeSegmentEnsures.get(key);
  if (!active) {
    const controller = new AbortController();
    const promise = generateHlsSegmentForRequestJob(segmentJobDeps(), {
      sessionId: input.sessionId,
      userId: input.userId,
      segment: input.segment,
      signal: controller.signal,
    });
    active = { sessionId: input.sessionId, controller, promise, waiters: new Set() };
    activeSegmentEnsures.set(key, active);
    promise
      .finally(() => {
        if (activeSegmentEnsures.get(key) === active) {
          activeSegmentEnsures.delete(key);
        }
      })
      .catch(() => undefined);
  }
  return waitForActiveSegmentEnsure(active, input.signal);
}

export async function ensureHlsLookaheadForSegment(input: {
  sessionId: string;
  userId: string;
  segment: string;
  signal?: AbortSignal;
}) {
  return ensureHlsLookaheadForSegmentJob(segmentJobDeps(), input);
}
