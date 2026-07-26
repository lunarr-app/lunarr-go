import { browser } from "$app/environment";
import { tick } from "svelte";
import {
  defaultSubtitleTrackId,
  shouldApplyLocalWaitingState,
  shouldAttemptLocalAutoplay,
  type PlayerControlUiState,
} from "$lib/playback/controls";
import { formatHlsError, formatMediaElementError, type HlsPlaybackErrorData } from "$lib/playback/errors";
import {
  absolutePlaybackSeconds,
  createHlsSeekEventController,
  hlsRepositionHref,
  shouldReloadHlsPlaybackDataOnError,
  shouldRecoverHlsPlaybackError,
  streamRelativePlaybackSeconds,
} from "$lib/playback/seek";
import type { PlaybackData, PlaybackDecision } from "$lib/server/playback";

export type MediaPlayerHlsDeps = {
  getData: () => PlaybackData;
  getVideo: () => HTMLVideoElement | undefined;
  getPlayerUiState: () => PlayerControlUiState;
  setPlayerUiState: (state: PlayerControlUiState) => void;
  getCurrentPlaybackSeconds: () => number;
  setCurrentPlaybackSeconds: (seconds: number) => void;
  getDurationSeconds: () => number | null;
  setDurationSeconds: (seconds: number | null) => void;
  getSeekPreviewSeconds: () => number | null;
  setSeekPreviewSeconds: (seconds: number | null) => void;
  getHasPlaybackActivity: () => boolean;
  setHasPlaybackActivity: (value: boolean) => void;
  getHasStartedPlayback: () => boolean;
  setHasStartedPlayback: (value: boolean) => void;
  getSaveState: () => "idle" | "saving" | "saved" | "error";
  setSaveState: (state: "idle" | "saving" | "saved" | "error") => void;
  getPlayerControlsVisible: () => boolean;
  setPlayerControlsVisible: (visible: boolean) => void;
  setPlayerControlsFocused: (focused: boolean) => void;
  setPlayerControlsHovered: (hovered: boolean) => void;
  getSelectedSubtitleId: () => string;
  setSelectedSubtitleId: (id: string) => void;
  getSubtitleMenuOpen: () => boolean;
  setSubtitleMenuOpen: (open: boolean) => void;
  getVolume: () => number;
  getMuted: () => boolean;
  castControlsPlayback: () => boolean;
  playbackDurationSeconds: (sourceData?: PlaybackData) => number | null;
  updateTimelineFromVideo: (sourceData?: PlaybackData) => void;
  applyVideoVolume: () => void;
  syncDefaultSubtitleTrack: () => void;
  showControls: () => void;
  flushProgress: (sourceData?: PlaybackData) => void;
  cancelPlaybackSession: (playback?: PlaybackDecision) => void;
  save: (completed?: boolean, sourceData?: PlaybackData) => Promise<void>;
  onReload: () => void;
  onReposition: (href: string) => void;
  setPlaybackErrorDetail: (message: string | null) => void;
};

export function createMediaPlayerHls(deps: MediaPlayerHlsDeps) {
  let playbackActivityKey: string | null = null;

  function repositionPlaybackTo(targetSeconds: number) {
    const data = deps.getData();
    const href = hlsRepositionHref({
      currentUrl: new URL(window.location.href),
      mediaFileId: data.playback.file.id,
      startSeconds: targetSeconds,
    });
    const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (href === currentHref) return;
    deps.flushProgress(data);
    deps.cancelPlaybackSession(data.playback);
    deps.onReposition(href);
  }

  function runPlaybackEffect() {
    $effect(() => {
      if (!browser) return;

      const sourceData = deps.getData();
      const playback = sourceData.playback;
      const startSeconds = sourceData.startSeconds;
      const player = deps.getVideo();
      let disposed = false;
      let cleanup: (() => void) | undefined;

      void (async () => {
        await tick();
        if (disposed) return;

        if (playback.status === "preparing") {
          const interval = window.setInterval(deps.onReload, 3000);

          cleanup = () => {
            window.clearInterval(interval);
          };
          return;
        }

        if (playback.status !== "ready" || !playback.streamUrl || !player) return;

        let hls: import("hls.js").default | null = null;
        const currentPlaybackActivityKey = [
          playback.mode,
          playback.playbackSessionId ?? playback.streamUrl,
          playback.file.id,
          playback.streamStartSeconds ?? 0,
        ].join(":");
        if (playbackActivityKey !== currentPlaybackActivityKey) {
          playbackActivityKey = currentPlaybackActivityKey;
          deps.setPlaybackErrorDetail(null);
          deps.setHasPlaybackActivity(false);
          deps.setHasStartedPlayback(false);
          deps.setPlayerUiState("starting");
          deps.setSaveState("idle");
          deps.setPlayerControlsVisible(true);
          deps.setPlayerControlsFocused(false);
          deps.setPlayerControlsHovered(false);
          deps.setCurrentPlaybackSeconds(Math.max(0, sourceData.startSeconds));
          deps.setDurationSeconds(deps.playbackDurationSeconds(sourceData));
          deps.setSeekPreviewSeconds(null);
          deps.setSelectedSubtitleId(defaultSubtitleTrackId(playback.tracks));
          deps.setSubtitleMenuOpen(false);
        }
        const relativeStartSeconds = () =>
          streamRelativePlaybackSeconds({
            absoluteSeconds: startSeconds,
            streamStartSeconds: playback.streamStartSeconds,
          });
        let repositioning = false;
        let bufferingTimer: number | undefined;
        const bufferingTimerDebounceMs = 1000;
        const cancelBufferingTimer = () => {
          if (bufferingTimer !== undefined) {
            window.clearTimeout(bufferingTimer);
            bufferingTimer = undefined;
          }
        };
        const streamUrl = playback.streamUrl;
        const currentPageHref = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const stopHlsTransport = () => {
          hls?.destroy();
          hls = null;
        };
        const setupPlayer = async () => {
          if (
            (playback.mode === "transcode" || playback.mode === "remux") &&
            !player.canPlayType("application/vnd.apple.mpegurl")
          ) {
            const { default: Hls } = await import("hls.js/light");
            if (disposed) return;
            if (Hls.isSupported()) {
              hls = new Hls({
                fragLoadingTimeOut: 120000,
                fragLoadingMaxRetry: 2,
                fragLoadingRetryDelay: 500,
                maxBufferLength: 60,
                backBufferLength: 60,
                startPosition: relativeStartSeconds(),
              });
              hls.on(Hls.Events.ERROR, (_event, eventData: HlsPlaybackErrorData) => {
                if (!disposed && eventData.fatal) {
                  restartHlsNearCurrentTime("hls", formatHlsError(eventData));
                }
              });
              hls.loadSource(streamUrl);
              hls.attachMedia(player);
              return;
            }
          }
          player.src = streamUrl;
        };

        await setupPlayer();
        if (disposed) return;

        const seekToStart = () => {
          if (startSeconds <= 0 || !Number.isFinite(startSeconds)) return;
          player.currentTime = relativeStartSeconds();
          hlsSeekController.timeUpdate({
            relativeSeconds: player.currentTime,
            seeking: false,
          });
          deps.setHasPlaybackActivity(true);
        };

        let autoplayAttempted = false;
        let autoplayRetriedAfterReady = false;
        const attemptAutoplay = async (options: { retryAfterReady?: boolean } = {}) => {
          const retryAfterReady = options.retryAfterReady === true;
          if (retryAfterReady && autoplayRetriedAfterReady) return;
          if (
            !shouldAttemptLocalAutoplay({
              autoplayAttempted,
              retryAfterReady,
              disposed,
              paused: player.paused,
              casting: deps.castControlsPlayback(),
            })
          )
            return;
          if (retryAfterReady) {
            autoplayRetriedAfterReady = true;
          } else {
            autoplayAttempted = true;
          }
          deps.setPlayerUiState("starting");
          try {
            await player.play();
            if (disposed || deps.castControlsPlayback()) return;
            deps.setHasPlaybackActivity(true);
            deps.setHasStartedPlayback(true);
            deps.setPlayerUiState("playing");
          } catch {
            if (!disposed && !deps.castControlsPlayback() && !deps.getHasStartedPlayback())
              deps.setPlayerUiState("autoplayBlocked");
          }
        };

        const prepareInitialPlayback = () => {
          deps.updateTimelineFromVideo(sourceData);
          deps.syncDefaultSubtitleTrack();
          deps.applyVideoVolume();
          seekToStart();
          void attemptAutoplay();
        };

        const currentPlayerTime = () =>
          absolutePlaybackSeconds({
            relativeSeconds: Number.isFinite(player.currentTime) ? player.currentTime : 0,
            streamStartSeconds: playback.streamStartSeconds,
          });
        const clearTransientOverlayIfPlaying = () => {
          const playerUiState = deps.getPlayerUiState();
          if (
            deps.castControlsPlayback() ||
            (playerUiState !== "buffering" && playerUiState !== "seeking") ||
            player.paused ||
            player.seeking ||
            player.ended ||
            player.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
          )
            return;
          deps.setHasPlaybackActivity(true);
          deps.setHasStartedPlayback(true);
          deps.setPlayerUiState("playing");
        };

        const repositionHlsPlayback = (targetSeconds: number) => {
          if (disposed || repositioning) return false;
          const href = hlsRepositionHref({
            currentUrl: new URL(window.location.href),
            mediaFileId: playback.file.id,
            startSeconds: targetSeconds,
          });
          if (href === currentPageHref()) return false;

          repositioning = true;
          stopHlsTransport();
          deps.flushProgress(sourceData);
          deps.cancelPlaybackSession(playback);
          deps.onReposition(href);
          return true;
        };

        const hlsSeekController = createHlsSeekEventController({
          startSeconds,
          streamStartSeconds: playback.streamStartSeconds,
        });

        const reportPlaybackError = (message: string | null | undefined) => {
          if (!message?.trim()) return;
          deps.setPlaybackErrorDetail(message);
          deps.setPlayerUiState("error");
        };

        const restartHlsNearCurrentTime = (source: "hls" | "native" = "native", errorDetail?: string | null) => {
          if (disposed) return;
          if (source === "native" && hls) {
            if (errorDetail) restartHlsNearCurrentTime("hls", errorDetail);
            return;
          }

          const recoveryContext = {
            mode: playback.mode,
            status: playback.status,
            currentSeconds: currentPlayerTime(),
            hasPlaybackActivity: deps.getHasPlaybackActivity(),
            hasLoadedMetadata: player.readyState >= HTMLMediaElement.HAVE_METADATA,
          };

          let repositionAttempted = false;

          if (shouldRecoverHlsPlaybackError(recoveryContext) && !repositioning) {
            repositionAttempted = true;
            if (repositionHlsPlayback(recoveryContext.currentSeconds)) {
              if (errorDetail) deps.setPlaybackErrorDetail(errorDetail);
              deps.setPlayerUiState("buffering");
              return;
            }
          }

          if (
            shouldReloadHlsPlaybackDataOnError({
              ...recoveryContext,
              repositionUnavailable: repositionAttempted,
              alreadyRepositioning: repositioning,
            })
          ) {
            repositioning = true;
            stopHlsTransport();
            if (errorDetail) deps.setPlaybackErrorDetail(errorDetail);
            deps.setPlayerUiState("buffering");
            deps.cancelPlaybackSession(playback);
            deps.onReload();
            return;
          }

          reportPlaybackError(errorDetail ?? "Playback failed and could not be recovered.");
        };

        const onTimeUpdate = () => {
          if (deps.castControlsPlayback()) return;
          if (player.currentTime > 0) deps.setHasPlaybackActivity(true);
          hlsSeekController.timeUpdate({
            relativeSeconds: Number.isFinite(player.currentTime) ? player.currentTime : 0,
            seeking: player.seeking,
          });
          deps.updateTimelineFromVideo(sourceData);
          clearTransientOverlayIfPlaying();
        };
        const onDurationChange = () => {
          if (deps.castControlsPlayback()) return;
          deps.updateTimelineFromVideo(sourceData);
        };
        const onLoadStart = () => {
          if (deps.castControlsPlayback()) return;
          if (!deps.getHasStartedPlayback()) deps.setPlayerUiState("starting");
        };
        const onCanPlay = () => {
          if (deps.castControlsPlayback()) return;
          cancelBufferingTimer();
          clearTransientOverlayIfPlaying();
          if (!deps.getHasStartedPlayback() && player.paused && deps.getPlayerUiState() !== "autoplayBlocked") {
            void attemptAutoplay({ retryAfterReady: true });
            return;
          }
          if (!deps.getHasStartedPlayback() && !autoplayAttempted && deps.getPlayerUiState() !== "autoplayBlocked") {
            deps.setPlayerUiState("paused");
          }
        };
        const onPlaying = () => {
          if (deps.castControlsPlayback()) return;
          cancelBufferingTimer();
          deps.setHasPlaybackActivity(true);
          deps.setHasStartedPlayback(true);
          deps.setPlayerUiState("playing");
        };
        const onPause = () => {
          if (
            disposed ||
            deps.castControlsPlayback() ||
            player.ended ||
            repositioning ||
            deps.getPlayerUiState() === "autoplayBlocked"
          )
            return;
          deps.setPlayerUiState("paused");
        };
        const onWaiting = () => {
          if (
            !shouldApplyLocalWaitingState({
              uiState: deps.getPlayerUiState(),
              paused: player.paused,
              ended: player.ended,
              casting: deps.castControlsPlayback(),
            })
          )
            return;
          if (player.seeking) {
            deps.setPlayerUiState("seeking");
            return;
          }
          cancelBufferingTimer();
          bufferingTimer = window.setTimeout(() => {
            bufferingTimer = undefined;
            if (player.paused || player.ended || player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
            deps.setPlayerUiState("buffering");
          }, bufferingTimerDebounceMs);
        };
        const onSeeking = () => {
          if (deps.castControlsPlayback()) return;
          const decision = hlsSeekController.seeking();
          deps.setPlayerUiState(decision.uiState);
          deps.updateTimelineFromVideo(sourceData);
          deps.showControls();
        };
        const onSeeked = () => {
          if (deps.castControlsPlayback()) return;
          const decision = hlsSeekController.seeked({
            relativeSeconds: Number.isFinite(player.currentTime) ? player.currentTime : 0,
            paused: player.paused,
          });
          deps.setPlayerUiState(decision.uiState);
          deps.setSeekPreviewSeconds(null);
          deps.updateTimelineFromVideo(sourceData);
        };
        const onPlayerError = () => {
          if (deps.castControlsPlayback()) return;
          restartHlsNearCurrentTime("native", formatMediaElementError(player));
        };
        const onEnded = () => {
          if (deps.castControlsPlayback()) return;
          deps.setHasPlaybackActivity(true);
          deps.setHasStartedPlayback(true);
          deps.setPlayerUiState("paused");
          deps.showControls();
          deps.updateTimelineFromVideo(sourceData);
          void deps.save(true, sourceData);
        };

        if (player.readyState >= HTMLMediaElement.HAVE_METADATA) {
          prepareInitialPlayback();
        } else {
          player.addEventListener("loadedmetadata", prepareInitialPlayback, {
            once: true,
          });
        }
        player.addEventListener("loadstart", onLoadStart);
        player.addEventListener("canplay", onCanPlay);
        player.addEventListener("durationchange", onDurationChange);
        player.addEventListener("playing", onPlaying);
        player.addEventListener("pause", onPause);
        player.addEventListener("waiting", onWaiting);
        player.addEventListener("stalled", onWaiting);
        player.addEventListener("timeupdate", onTimeUpdate);
        player.addEventListener("seeking", onSeeking);
        player.addEventListener("seeked", onSeeked);
        player.addEventListener("error", onPlayerError);
        player.addEventListener("ended", onEnded);

        const interval = window.setInterval(() => void deps.save(false, sourceData), 10000);
        const onVisibilityChange = () => {
          if (document.visibilityState === "hidden") deps.flushProgress(sourceData);
        };
        const flushCapturedProgress = () => deps.flushProgress(sourceData);
        window.addEventListener("pagehide", flushCapturedProgress);
        document.addEventListener("visibilitychange", onVisibilityChange);

        cleanup = () => {
          cancelBufferingTimer();
          player.removeEventListener("loadedmetadata", prepareInitialPlayback);
          player.removeEventListener("loadstart", onLoadStart);
          player.removeEventListener("canplay", onCanPlay);
          player.removeEventListener("durationchange", onDurationChange);
          player.removeEventListener("playing", onPlaying);
          player.removeEventListener("pause", onPause);
          player.removeEventListener("waiting", onWaiting);
          player.removeEventListener("stalled", onWaiting);
          player.removeEventListener("timeupdate", onTimeUpdate);
          player.removeEventListener("seeking", onSeeking);
          player.removeEventListener("seeked", onSeeked);
          player.removeEventListener("error", onPlayerError);
          player.removeEventListener("ended", onEnded);
          window.removeEventListener("pagehide", flushCapturedProgress);
          document.removeEventListener("visibilitychange", onVisibilityChange);
          window.clearInterval(interval);
          stopHlsTransport();
        };
      })();

      return () => {
        disposed = true;
        cleanup?.();
      };
    });
  }

  return {
    repositionPlaybackTo,
    runPlaybackEffect,
  };
}
