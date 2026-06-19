import { browser } from "$app/environment";
import { playbackProgressSnapshot, shouldCancelPlaybackSessionForCleanup } from "$lib/playback/controls";
import {
  activePlaybackSessionId,
  cancelPlaybackSessionOnce,
  postWithBeaconFallback,
  shouldCancelCapturedPlaybackSession,
  shouldInvalidateAfterHeartbeat,
} from "$lib/playback/session";
import type { PlaybackData, PlaybackDecision } from "$lib/server/playback";

export const PLAYBACK_SESSION_HEARTBEAT_INTERVAL_MS = 30000;

export type MediaPlayerSessionDeps = {
  getData: () => PlaybackData;
  getVideo: () => HTMLVideoElement | undefined;
  isCasting: () => boolean;
  getCurrentPlaybackSeconds: () => number;
  getDurationSeconds: () => number | null;
  getHasPlaybackActivity: () => boolean;
  setHasPlaybackActivity: (value: boolean) => void;
  playbackIsCastOwned: (playback: PlaybackDecision) => boolean;
  onProgressSaved: () => void;
  onReload: () => void;
  persistProgress?: boolean | (() => boolean);
};

export function createMediaPlayerSession(deps: MediaPlayerSessionDeps) {
  let saveState = $state<"idle" | "saving" | "saved" | "error">("idle");
  const cancelledPlaybackSessions = new Set<string>();

  function progressPayload(sourceData: PlaybackData = deps.getData(), completed = false) {
    const video = deps.getVideo();
    if (!video) return null;
    const snapshot = playbackProgressSnapshot({
      casting: deps.isCasting(),
      videoRelativeSeconds: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      videoDurationSeconds: Number.isFinite(video.duration) ? video.duration : null,
      currentPlaybackSeconds: deps.getCurrentPlaybackSeconds(),
      uiDurationSeconds: deps.getDurationSeconds(),
      fileDurationSeconds: Number(sourceData.playback.file.duration_seconds),
      streamStartSeconds: sourceData.playback.streamStartSeconds,
    });
    const ended = completed || video.ended;
    const hasProgressActivity = deps.getHasPlaybackActivity() || (deps.isCasting() && snapshot.positionSeconds > 0);
    if (!ended && !hasProgressActivity && video.currentTime <= 0) return null;

    return {
      mediaFileId: sourceData.playback.file.id,
      positionSeconds: snapshot.positionSeconds,
      durationSeconds: snapshot.durationSeconds,
      completed: ended,
    };
  }

  async function save(completed = false, sourceData: PlaybackData = deps.getData()) {
    const persistProgress = typeof deps.persistProgress === "function" ? deps.persistProgress() : deps.persistProgress;
    if (persistProgress === false) return;
    const payload = progressPayload(sourceData, completed);
    if (!payload) return;

    saveState = "saving";
    try {
      const response = await fetch(`/api/playback/${sourceData.item.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      saveState = response.ok ? "saved" : "error";
      if (response.ok) deps.onProgressSaved();
    } catch {
      saveState = "error";
    }
  }

  function flushProgress(sourceData: PlaybackData = deps.getData()) {
    const persistProgress = typeof deps.persistProgress === "function" ? deps.persistProgress() : deps.persistProgress;
    if (persistProgress === false) return;
    const payload = progressPayload(sourceData, false);
    if (!payload) return;

    const url = `/api/playback/${sourceData.item.id}`;
    const body = JSON.stringify(payload);
    postWithBeaconFallback({
      url,
      body: new Blob([body], { type: "application/json" }),
      headers: { "content-type": "application/json" },
      navigatorRef: navigator,
      fetchFn: fetch,
    });
  }

  function cancelPlaybackSession(
    playback: PlaybackDecision = deps.getData().playback,
    options: { includeCastOwned?: boolean } = {},
  ) {
    if (
      !shouldCancelPlaybackSessionForCleanup({
        castOwned: deps.playbackIsCastOwned(playback),
        includeCastOwned: options.includeCastOwned ?? false,
      })
    )
      return;
    cancelPlaybackSessionOnce({
      playback,
      cancelledPlaybackSessions,
      navigatorRef: navigator,
      fetchFn: fetch,
    });
  }

  function cancelPlaybackSessionWhenReplaced(playback: PlaybackDecision) {
    const capturedSessionId = activePlaybackSessionId(playback);
    if (!capturedSessionId) return;

    queueMicrotask(() => {
      if (
        shouldCancelCapturedPlaybackSession({
          captured: playback,
          current: deps.getData().playback,
        })
      ) {
        cancelPlaybackSession(playback);
      }
    });
  }

  function heartbeatPlaybackSession(playback: PlaybackDecision) {
    const sessionId = activePlaybackSessionId(playback);
    if (!sessionId) return;
    const requestPathname = window.location.pathname;
    const requestSearch = window.location.search;
    void fetch(`/api/playback-sessions/${encodeURIComponent(sessionId)}/heartbeat`, {
      method: "POST",
    })
      .then((response) => {
        if (
          shouldInvalidateAfterHeartbeat({
            ok: response.ok,
            sessionId,
            cancelledPlaybackSessions,
            requestPathname,
            requestSearch,
            currentPathname: window.location.pathname,
            currentSearch: window.location.search,
          })
        ) {
          deps.onReload();
        }
      })
      .catch(() => undefined);
  }

  function runHeartbeatEffect() {
    $effect(() => {
      if (!browser) return;
      const playback = deps.getData().playback;
      if (
        (playback.mode !== "transcode" && playback.mode !== "remux") ||
        !playback.playbackSessionId ||
        (playback.status !== "preparing" && playback.status !== "ready")
      )
        return;

      heartbeatPlaybackSession(playback);
      const interval = window.setInterval(
        () => heartbeatPlaybackSession(playback),
        PLAYBACK_SESSION_HEARTBEAT_INTERVAL_MS,
      );
      const cancelCapturedPlaybackSession = () => cancelPlaybackSession(playback);
      window.addEventListener("pagehide", cancelCapturedPlaybackSession);

      return () => {
        window.clearInterval(interval);
        window.removeEventListener("pagehide", cancelCapturedPlaybackSession);
      };
    });
  }

  function runCleanupEffect() {
    $effect(() => {
      if (!browser) return;
      const sourceData = deps.getData();
      const playback = sourceData.playback;
      return () => {
        flushProgress(sourceData);
        cancelPlaybackSessionWhenReplaced(playback);
      };
    });
  }

  return {
    get saveState() {
      return saveState;
    },
    setSaveState(state: "idle" | "saving" | "saved" | "error") {
      saveState = state;
    },
    progressPayload,
    save,
    flushProgress,
    cancelPlaybackSession,
    cancelPlaybackSessionWhenReplaced,
    heartbeatPlaybackSession,
    runHeartbeatEffect,
    runCleanupEffect,
  };
}
