import type { PlaybackTarget } from "./capabilities";

export function isHlsPlaybackMode(mode: string) {
  return mode === "transcode" || mode === "remux";
}

export function shouldRecoverHlsPlaybackError(input: {
  mode: string;
  status: string;
  currentSeconds: number;
  hasPlaybackActivity: boolean;
}) {
  if (!isHlsPlaybackMode(input.mode) || input.status !== "ready") return false;
  if (!Number.isFinite(input.currentSeconds) || input.currentSeconds < 0) return false;
  return input.currentSeconds > 0;
}

export function shouldReloadHlsPlaybackDataOnError(input: {
  mode: string;
  status: string;
  currentSeconds: number;
  hasPlaybackActivity: boolean;
  hasLoadedMetadata?: boolean;
  repositionUnavailable?: boolean;
  alreadyRepositioning?: boolean;
}) {
  if (!isHlsPlaybackMode(input.mode) || input.status !== "ready") return false;
  if (!Number.isFinite(input.currentSeconds) || input.currentSeconds < 0) return false;
  if (input.currentSeconds <= 0) return false;
  if (!input.hasPlaybackActivity && input.hasLoadedMetadata) return false;
  if (input.alreadyRepositioning) return true;
  if (input.repositionUnavailable && input.hasPlaybackActivity) return true;
  return false;
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

export function playbackTargetHref(input: {
  currentUrl: URL;
  mediaFileId: string;
  target: PlaybackTarget;
  startSeconds: number;
}) {
  const url = new URL(input.currentUrl);
  url.searchParams.set("file", input.mediaFileId);
  if (input.target === "web") {
    url.searchParams.delete("target");
  } else {
    url.searchParams.set("target", input.target);
  }
  const startSeconds = Math.max(0, Math.floor(input.startSeconds));
  if (startSeconds > 0) {
    url.searchParams.set("start", String(startSeconds));
  } else {
    url.searchParams.delete("start");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function createHlsSeekEventController(input: { startSeconds: number; streamStartSeconds?: number | null }) {
  let lastPlaybackTime = initialPlayerTimelineSeconds({
    startSeconds: input.startSeconds,
    streamStartSeconds: input.streamStartSeconds,
  });
  const absoluteSeconds = (relativeSeconds: number) =>
    absolutePlaybackSeconds({
      relativeSeconds,
      streamStartSeconds: input.streamStartSeconds,
    });

  return {
    timeUpdate(event: { relativeSeconds: number; seeking: boolean }) {
      if (!event.seeking) lastPlaybackTime = absoluteSeconds(event.relativeSeconds);
      return lastPlaybackTime;
    },
    seeking() {
      return { uiState: "seeking" as const };
    },
    seeked(event: { relativeSeconds: number; paused: boolean }) {
      const targetSeconds = absoluteSeconds(event.relativeSeconds);
      lastPlaybackTime = targetSeconds;
      return {
        uiState: event.paused ? ("paused" as const) : ("playing" as const),
      };
    },
    lastPlaybackTime() {
      return lastPlaybackTime;
    },
  };
}

export function initialPlayerTimelineSeconds(input: { startSeconds: number; streamStartSeconds?: number | null }) {
  return Number.isFinite(input.startSeconds) ? Math.max(0, input.startSeconds) : 0;
}

export function streamRelativePlaybackSeconds(input: { absoluteSeconds: number; streamStartSeconds?: number | null }) {
  const absoluteSeconds = Number.isFinite(input.absoluteSeconds) ? Math.max(0, input.absoluteSeconds) : 0;
  const streamStartSeconds =
    Number.isFinite(input.streamStartSeconds) && Number(input.streamStartSeconds) > 0
      ? Number(input.streamStartSeconds)
      : 0;
  return Math.max(0, absoluteSeconds - streamStartSeconds);
}

export function absolutePlaybackSeconds(input: { relativeSeconds: number; streamStartSeconds?: number | null }) {
  const relativeSeconds = Number.isFinite(input.relativeSeconds) ? Math.max(0, input.relativeSeconds) : 0;
  const streamStartSeconds =
    Number.isFinite(input.streamStartSeconds) && Number(input.streamStartSeconds) > 0
      ? Number(input.streamStartSeconds)
      : 0;
  return streamStartSeconds + relativeSeconds;
}
