export const HLS_REPOSITION_SEEK_THRESHOLD_SECONDS = 30;
export const HLS_REPOSITION_DEBOUNCE_MS = 120;

type RepositionTimer = unknown;

export function isHlsPlaybackMode(mode: string) {
  return mode === "transcode" || mode === "remux";
}

export function shouldRepositionHlsSeek(input: {
  mode: string;
  status: string;
  fromSeconds: number;
  toSeconds: number;
  thresholdSeconds?: number;
}) {
  if (!isHlsPlaybackMode(input.mode) || input.status !== "ready") return false;
  if (!Number.isFinite(input.fromSeconds) || !Number.isFinite(input.toSeconds))
    return false;
  if (input.toSeconds < 0) return false;

  const threshold =
    input.thresholdSeconds ?? HLS_REPOSITION_SEEK_THRESHOLD_SECONDS;
  return (
    Math.abs(input.toSeconds - input.fromSeconds) >= Math.max(0, threshold)
  );
}

export function shouldRecoverHlsPlaybackError(input: {
  mode: string;
  status: string;
  currentSeconds: number;
  hasPlaybackActivity: boolean;
}) {
  if (!isHlsPlaybackMode(input.mode) || input.status !== "ready") return false;
  if (!Number.isFinite(input.currentSeconds) || input.currentSeconds < 0)
    return false;
  return input.currentSeconds > 0;
}

export function shouldReloadHlsPlaybackDataOnError(input: {
  mode: string;
  status: string;
  currentSeconds: number;
  hasPlaybackActivity: boolean;
  hasLoadedMetadata?: boolean;
}) {
  if (!isHlsPlaybackMode(input.mode) || input.status !== "ready") return false;
  if (!Number.isFinite(input.currentSeconds) || input.currentSeconds < 0)
    return false;
  if (input.currentSeconds <= 0) return false;
  if (!input.hasPlaybackActivity && input.hasLoadedMetadata) return false;
  return !shouldRecoverHlsPlaybackError(input);
}

export function hlsRepositionHref(input: {
  currentUrl: URL;
  mediaFileId: string;
  startSeconds: number;
  forceTranscode?: boolean;
}) {
  const url = new URL(input.currentUrl);
  url.searchParams.set("file", input.mediaFileId);
  const startSeconds = Math.max(0, Math.floor(input.startSeconds));
  if (startSeconds > 0) {
    url.searchParams.set("start", String(startSeconds));
  } else {
    url.searchParams.delete("start");
  }
  if (input.forceTranscode) {
    url.searchParams.set("transcode", "1");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function createLatestHlsRepositionScheduler(input: {
  reposition: (startSeconds: number) => void;
  delayMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => RepositionTimer;
  clearTimer?: (timer: RepositionTimer) => void;
}) {
  const delayMs = Math.max(0, input.delayMs ?? HLS_REPOSITION_DEBOUNCE_MS);
  const setTimer =
    input.setTimer ??
    ((callback: () => void, delay: number): RepositionTimer =>
      setTimeout(callback, delay));
  const clearTimer =
    input.clearTimer ??
    ((activeTimer: RepositionTimer) =>
      clearTimeout(activeTimer as ReturnType<typeof setTimeout>));
  let timer: RepositionTimer | null = null;
  let latestStartSeconds = 0;
  let pending = false;

  const clearPendingTimer = () => {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  };

  return {
    schedule(startSeconds: number) {
      if (!Number.isFinite(startSeconds) || startSeconds < 0) return false;
      latestStartSeconds = Math.max(0, startSeconds);
      pending = true;
      clearPendingTimer();
      timer = setTimer(() => {
        timer = null;
        if (!pending) return;
        pending = false;
        input.reposition(latestStartSeconds);
      }, delayMs);
      return true;
    },
    cancel() {
      clearPendingTimer();
      pending = false;
    },
    pending() {
      return pending;
    },
  };
}

export function createHlsSeekEventController(input: {
  mode: string;
  status: string;
  startSeconds: number;
  streamStartSeconds?: number | null;
  reposition: (startSeconds: number) => void;
  delayMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => RepositionTimer;
  clearTimer?: (timer: RepositionTimer) => void;
}) {
  let lastPlaybackTime = initialPlayerTimelineSeconds({
    startSeconds: input.startSeconds,
    streamStartSeconds: input.streamStartSeconds,
  });
  const scheduler = createLatestHlsRepositionScheduler({
    reposition: input.reposition,
    delayMs: input.delayMs,
    setTimer: input.setTimer,
    clearTimer: input.clearTimer,
  });
  const absoluteSeconds = (relativeSeconds: number) =>
    absolutePlaybackSeconds({
      relativeSeconds,
      streamStartSeconds: input.streamStartSeconds,
    });
  const shouldReposition = (targetSeconds: number) =>
    shouldRepositionHlsSeek({
      mode: input.mode,
      status: input.status,
      fromSeconds: lastPlaybackTime,
      toSeconds: targetSeconds,
    });

  return {
    timeUpdate(event: { relativeSeconds: number; seeking: boolean }) {
      if (!event.seeking)
        lastPlaybackTime = absoluteSeconds(event.relativeSeconds);
      return lastPlaybackTime;
    },
    seeking(event: { relativeSeconds: number }) {
      const targetSeconds = absoluteSeconds(event.relativeSeconds);
      if (shouldReposition(targetSeconds)) {
        scheduler.schedule(targetSeconds);
        return { uiState: "seeking" as const, pendingReposition: true };
      }
      scheduler.cancel();
      return { uiState: "seeking" as const, pendingReposition: false };
    },
    seeked(event: { relativeSeconds: number; paused: boolean }) {
      const targetSeconds = absoluteSeconds(event.relativeSeconds);
      if (shouldReposition(targetSeconds)) {
        scheduler.schedule(targetSeconds);
        return { uiState: "seeking" as const, pendingReposition: true };
      }
      scheduler.cancel();
      lastPlaybackTime = targetSeconds;
      return {
        uiState: event.paused ? ("paused" as const) : ("playing" as const),
        pendingReposition: false,
      };
    },
    cancel() {
      scheduler.cancel();
    },
    pending() {
      return scheduler.pending();
    },
    lastPlaybackTime() {
      return lastPlaybackTime;
    },
  };
}

export function initialPlayerTimelineSeconds(input: {
  startSeconds: number;
  streamStartSeconds?: number | null;
}) {
  return Number.isFinite(input.startSeconds)
    ? Math.max(0, input.startSeconds)
    : 0;
}

export function streamRelativePlaybackSeconds(input: {
  absoluteSeconds: number;
  streamStartSeconds?: number | null;
}) {
  const absoluteSeconds = Number.isFinite(input.absoluteSeconds)
    ? Math.max(0, input.absoluteSeconds)
    : 0;
  const streamStartSeconds =
    Number.isFinite(input.streamStartSeconds) &&
    Number(input.streamStartSeconds) > 0
      ? Number(input.streamStartSeconds)
      : 0;
  return Math.max(0, absoluteSeconds - streamStartSeconds);
}

export function absolutePlaybackSeconds(input: {
  relativeSeconds: number;
  streamStartSeconds?: number | null;
}) {
  const relativeSeconds = Number.isFinite(input.relativeSeconds)
    ? Math.max(0, input.relativeSeconds)
    : 0;
  const streamStartSeconds =
    Number.isFinite(input.streamStartSeconds) &&
    Number(input.streamStartSeconds) > 0
      ? Number(input.streamStartSeconds)
      : 0;
  return streamStartSeconds + relativeSeconds;
}
