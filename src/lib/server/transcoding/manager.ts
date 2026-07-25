import { cleanupConfiguredPlaybackSessionArtifacts } from "./sessions";
import { cleanupJobHistory } from "../jobs";
import { TRANSCODING_DISABLED_MESSAGE } from "./hls-segment-jobs";
import { resetEncodeCoordinatorsForTests } from "./encode-coordinator";
import { createLibraryStorage } from "../storage";
import { resetTranscodeBackendInternal, setTranscodeBackendInternal } from "./ffmpeg-cli";
import {
  resetStorageFactoryInternal,
  setSftpSeekableOperationTimeoutInternal,
  setStorageFactoryInternal,
  setTranscodePolicyRecheckDelayInternal,
} from "./playback-resolve";
import { clearAllActiveSegmentEnsures } from "./segment-request-gateway";
import type { TranscodeBackend } from "./backend";

export { TRANSCODING_DISABLED_MESSAGE };

export type { CancelPlaybackSessionResult } from "./playback-lifecycle";
export type { HlsPlaybackResult } from "./playback-resolve";

export {
  cancelActivePlaybackSessions,
  cancelPlaybackSession,
  cleanupTranscodeStartupFailure,
  expireIdleReadyHlsPlaybackSessions,
  expireStalePlaybackSessions,
  pruneActiveHlsSegmentArtifacts,
  requestDrivenHlsSegmentFormat,
} from "./playback-lifecycle";

export { resolveHlsPlayback } from "./playback-resolve";

export {
  ensureHlsLookaheadForSegment,
  ensureHlsSegmentForRequest,
  segmentEnsureWaiterCountForTests,
} from "./segment-request-gateway";

const TRANSCODE_EXPIRY_INTERVAL_MS = 15_000;
const PLAYBACK_SESSION_ARTIFACT_CLEANUP_TICKS = 20;

let staleExpiryLoop: ReturnType<typeof setInterval> | null = null;
let staleExpiryLoopTicks = 0;

export function setTranscodeBackendForTests(backend: TranscodeBackend | null) {
  if (backend === null) {
    resetTranscodeBackendInternal();
    clearAllActiveSegmentEnsures();
    resetEncodeCoordinatorsForTests();
    setTranscodePolicyRecheckDelayInternal(null);
    return;
  }
  setTranscodeBackendInternal(backend);
}

export function setTranscodeStorageFactoryForTests(factory: typeof createLibraryStorage | null) {
  if (factory === null) {
    resetStorageFactoryInternal();
    resetEncodeCoordinatorsForTests();
    return;
  }
  setStorageFactoryInternal(factory);
}

export function setSftpSeekableOperationTimeoutForTests(timeoutMs: number | null) {
  setSftpSeekableOperationTimeoutInternal(timeoutMs);
}

export function setTranscodePolicyRecheckDelayForTests(delay: (() => Promise<void> | void) | null) {
  setTranscodePolicyRecheckDelayInternal(delay);
}

export function startStaleTranscodeExpiryLoop() {
  if (staleExpiryLoop) return;
  staleExpiryLoop = setInterval(() => {
    void (async () => {
      const { expireStalePlaybackSessions, expireIdleReadyHlsPlaybackSessions, pruneActiveHlsSegmentArtifacts } =
        await import("./playback-lifecycle");
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
