import { browser } from "$app/environment";
import {
  castMediaTimelineSeconds,
  castPlaybackSecondsAfterSeek,
  castPlayerUiState,
  castReceiverTimelineSeconds,
  castUiStateAfterCommand,
  clampPlaybackSeconds,
  isCastOwnedPlaybackSession,
  markCastOwnedPlaybackSession,
  releaseCastOwnedPlaybackSession,
} from "$lib/playback/controls";
import { playbackContentTypeForMode } from "$lib/playback/content-type";
import { connectedCastSession } from "$lib/playback/cast";
import type {
  CastApi,
  CastMediaSession,
  CastMediaUpdateListener,
  CastRemotePlayer,
  CastRemotePlayerController,
  CastSession,
} from "$lib/playback/cast";
import type { PlaybackTarget } from "$lib/playback/capabilities";
import { playbackTargetHref, streamRelativePlaybackSeconds } from "$lib/playback/seek";
import type { PlaybackData, PlaybackDecision } from "$lib/server/playback";
import { activePlaybackSessionId } from "$lib/playback/session";

type PlayerUiState = "starting" | "playing" | "paused" | "buffering" | "seeking" | "autoplayBlocked" | "error";

type ProgressPayload = {
  mediaFileId: string;
  positionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
} | null;

export type MediaPlayerCastDeps = {
  getData: () => PlaybackData;
  getVideo: () => HTMLVideoElement | undefined;
  getPlayerUiState: () => PlayerUiState;
  setPlayerUiState: (state: PlayerUiState) => void;
  getCurrentPlaybackSeconds: () => number;
  setCurrentPlaybackSeconds: (seconds: number) => void;
  getDurationSeconds: () => number | null;
  setDurationSeconds: (seconds: number | null) => void;
  setHasPlaybackActivity: (value: boolean) => void;
  getPlaybackTargetStartSeconds: () => number;
  showControls: () => void;
  showSignedPlaybackNotice: (message: string) => void;
  clearSignedPlaybackNotice: () => void;
  progressPayload: (sourceData?: PlaybackData, completed?: boolean) => ProgressPayload;
  flushProgress: (sourceData?: PlaybackData) => void;
  cancelPlaybackSession: (playback?: PlaybackDecision, options?: { includeCastOwned?: boolean }) => void;
  onReposition: (href: string) => void;
  getPlaybackButtonAction: () => "play" | "pause";
};

export function createMediaPlayerCast(deps: MediaPlayerCastDeps) {
  let castAvailable = $state(false);
  let castLaunchState = $state<"idle" | "connecting" | "connected" | "error">("idle");
  let castOwnedPlaybackSessionId = $state<string | null>(null);
  let castSession: CastSession | null = null;
  let castMedia: CastMediaSession | null = null;
  let castMediaUpdateListener: CastMediaUpdateListener | null = null;
  let castRemotePlayer: CastRemotePlayer | null = null;
  let castRemotePlayerController: CastRemotePlayerController | null = null;
  let detachCastRemotePlayerListener: (() => void) | null = null;
  const castOwnedPlaybackSessions = new Set<string>();
  let castFrameworkPromise: Promise<CastApi> | null = null;

  function isCasting() {
    return castLaunchState === "connected";
  }

  function castControlsPlayback() {
    return castLaunchState === "connecting" || castLaunchState === "connected";
  }

  function castWindow() {
    return window as typeof window & {
      __onGCastApiAvailable?: (available: boolean) => void;
      cast?: CastApi["cast"];
      chrome?: CastApi["chrome"];
    };
  }

  function configureCastFramework(api: CastApi) {
    const context = api.cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: api.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: api.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    return context;
  }

  function syncCastReceiverTimeline(input: { receiverSeconds: number; receiverDurationSeconds: number }) {
    const data = deps.getData();
    const nextDuration =
      Number.isFinite(input.receiverDurationSeconds) && input.receiverDurationSeconds > 0
        ? castMediaTimelineSeconds({
            receiverSeconds: input.receiverDurationSeconds,
            mode: data.playback.mode,
            streamStartSeconds: data.playback.streamStartSeconds,
          })
        : deps.getDurationSeconds();
    if (Number.isFinite(input.receiverSeconds) && input.receiverSeconds >= 0) {
      deps.setCurrentPlaybackSeconds(
        clampPlaybackSeconds({
          seconds: castMediaTimelineSeconds({
            receiverSeconds: input.receiverSeconds,
            mode: data.playback.mode,
            streamStartSeconds: data.playback.streamStartSeconds,
          }),
          durationSeconds: nextDuration,
        }),
      );
      if (deps.getCurrentPlaybackSeconds() > 0) deps.setHasPlaybackActivity(true);
    }
    if (nextDuration !== null && Number.isFinite(nextDuration) && nextDuration > 0) {
      deps.setDurationSeconds(nextDuration);
    }
  }

  function syncCastRemotePlayerState(player: CastRemotePlayer | null = castRemotePlayer) {
    if (!player) return;
    if (!player.isConnected || !player.isMediaLoaded) return;
    deps.setPlayerUiState(
      castPlayerUiState({
        alive: true,
        playerState: player.playerState,
        fallbackUiState: deps.getPlayerUiState(),
      }),
    );
    syncCastReceiverTimeline({
      receiverSeconds: Number(player.currentTime),
      receiverDurationSeconds: Number(player.duration),
    });
  }

  function ensureCastRemotePlayerController(api: CastApi) {
    if (castRemotePlayer && castRemotePlayerController) return;
    const player = new api.cast.framework.RemotePlayer();
    const controller = new api.cast.framework.RemotePlayerController(player);
    const eventType = api.cast.framework.RemotePlayerEventType.ANY_CHANGE;
    const onPlayerChanged = () => syncCastRemotePlayerState(player);
    controller.addEventListener(eventType, onPlayerChanged);
    castRemotePlayer = player;
    castRemotePlayerController = controller;
    detachCastRemotePlayerListener = () => {
      controller.removeEventListener(eventType, onPlayerChanged);
    };
    syncCastRemotePlayerState(player);
  }

  function detachCastRemotePlayerController() {
    detachCastRemotePlayerListener?.();
    detachCastRemotePlayerListener = null;
    castRemotePlayerController = null;
    castRemotePlayer = null;
  }

  function ensureCastFramework() {
    if (!browser) return Promise.reject(new Error("Cast is unavailable."));
    if (castFrameworkPromise) return castFrameworkPromise;

    castFrameworkPromise = new Promise<CastApi>((resolve, reject) => {
      const win = castWindow();
      const resolveApi = () => {
        if (win.cast?.framework && win.chrome?.cast) {
          const api = { cast: win.cast, chrome: win.chrome };
          configureCastFramework(api);
          ensureCastRemotePlayerController(api);
          castAvailable = true;
          resolve(api);
          return true;
        }
        return false;
      };

      if (resolveApi()) return;

      const timeout = window.setTimeout(() => {
        reject(new Error("Cast SDK did not become available."));
      }, 10000);

      win.__onGCastApiAvailable = (available: boolean) => {
        window.clearTimeout(timeout);
        if (!available || !resolveApi()) {
          reject(new Error("Cast SDK is unavailable."));
        }
      };

      let script = document.getElementById("google-cast-sender-sdk") as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = "google-cast-sender-sdk";
        script.async = true;
        script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
        script.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error("Cast SDK failed to load."));
        };
        document.head.appendChild(script);
      }
    }).catch((error) => {
      castFrameworkPromise = null;
      castAvailable = false;
      throw error;
    });

    return castFrameworkPromise;
  }

  function playbackIsCastOwned(playback: PlaybackDecision) {
    const sessionId = activePlaybackSessionId(playback);
    return isCastOwnedPlaybackSession({
      sessionId,
      castOwnedPlaybackSessions,
    });
  }

  function markCastOwnedSession(sessionId: string | null) {
    castOwnedPlaybackSessionId = markCastOwnedPlaybackSession({
      sessionId,
      castOwnedPlaybackSessions,
    });
  }

  function releaseCastOwnedSession(sessionId: string | null) {
    const next = releaseCastOwnedPlaybackSession({
      sessionId,
      activeSessionId: castOwnedPlaybackSessionId,
      castOwnedPlaybackSessions,
    });
    castOwnedPlaybackSessionId = next.activeSessionId;
  }

  function activeCastMedia() {
    return castMedia ?? castSession?.getMediaSession?.() ?? null;
  }

  function detachCastMediaUpdateListener(media: CastMediaSession | null = castMedia) {
    if (!castMediaUpdateListener) return;
    media?.removeUpdateListener?.(castMediaUpdateListener);
    castMediaUpdateListener = null;
  }

  function syncCastMediaState(media: CastMediaSession, alive = true) {
    deps.setPlayerUiState(
      castPlayerUiState({
        alive,
        playerState: media?.playerState,
        fallbackUiState: deps.getPlayerUiState(),
      }),
    );
    syncCastReceiverTimeline({
      receiverSeconds: Number(media?.currentTime),
      receiverDurationSeconds: Number(media?.media?.duration),
    });
    if (!alive) deps.showControls();
  }

  function attachCastMediaUpdateListener(media: CastMediaSession) {
    detachCastMediaUpdateListener();
    castMedia = media;
    syncCastMediaState(media, true);
    if (!media?.addUpdateListener) return;
    const listener = (isAlive: boolean) => {
      syncCastMediaState(media, isAlive);
    };
    castMediaUpdateListener = listener;
    media.addUpdateListener(listener);
  }

  function adoptCastSession(session: CastSession | null | undefined) {
    if (!session) return;
    castSession = session;
    castAvailable = true;
    castLaunchState = "connected";
    const media = session.getMediaSession?.();
    if (media) attachCastMediaUpdateListener(media);
    deps.getVideo()?.pause();
    deps.showControls();
  }

  function castCommand(command: "play" | "pause") {
    if (castRemotePlayer?.isConnected && castRemotePlayer?.isMediaLoaded && castRemotePlayerController?.playOrPause) {
      const paused =
        castRemotePlayer.isPaused === true ||
        castRemotePlayer.playerState === "PAUSED" ||
        castRemotePlayer.playerState === "IDLE";
      if ((command === "play" && paused) || (command === "pause" && !paused)) {
        castRemotePlayerController.playOrPause();
      }
      return true;
    }

    const media = activeCastMedia();
    if (!media?.[command]) return false;
    media[command](
      null,
      () => undefined,
      () => undefined,
    );
    return true;
  }

  function castSeek(seconds: number) {
    const data = deps.getData();
    const receiverSeconds = castReceiverTimelineSeconds({
      absoluteSeconds: seconds,
      mode: data.playback.mode,
      streamStartSeconds: data.playback.streamStartSeconds,
    });
    if (castRemotePlayer?.isConnected && castRemotePlayer?.isMediaLoaded && castRemotePlayerController?.seek) {
      castRemotePlayer.currentTime = receiverSeconds;
      castRemotePlayerController.seek();
      return true;
    }

    const media = activeCastMedia();
    const chromeApi = castWindow().chrome;
    if (!media?.seek || !chromeApi?.cast?.media?.SeekRequest) return false;
    const request = new chromeApi.cast.media.SeekRequest();
    request.currentTime = receiverSeconds;
    media.seek(
      request,
      () => undefined,
      () => undefined,
    );
    return true;
  }

  function clearCastPlaybackState() {
    const data = deps.getData();
    releaseCastOwnedSession(castOwnedPlaybackSessionId);
    detachCastMediaUpdateListener();
    castMedia = null;
    syncCastRemotePlayerState();
    const castPositionSeconds = deps.getCurrentPlaybackSeconds();
    castLaunchState = "idle";
    deps.setPlayerUiState("paused");
    const video = deps.getVideo();
    if (video && Number.isFinite(castPositionSeconds)) {
      video.currentTime = streamRelativePlaybackSeconds({
        absoluteSeconds: castPositionSeconds,
        streamStartSeconds: data.playback.streamStartSeconds,
      });
    }
    deps.showControls();
  }

  function stopCastPlayback() {
    const session = castSession;
    clearCastPlaybackState();
    castSession = null;
    session?.endSession?.(true);
  }

  function currentCastPositionSeconds() {
    const payload = deps.progressPayload(deps.getData(), false);
    if (payload) return payload.positionSeconds;
    const data = deps.getData();
    return Number.isFinite(data.startSeconds) ? data.startSeconds : 0;
  }

  function switchPlaybackTarget(target: PlaybackTarget) {
    const data = deps.getData();
    if (data.playback.target === target) return false;
    const startSeconds = deps.getPlaybackTargetStartSeconds();
    const href = playbackTargetHref({
      currentUrl: new URL(window.location.href),
      mediaFileId: data.playback.file.id,
      target,
      startSeconds,
    });
    deps.flushProgress(data);
    deps.cancelPlaybackSession(data.playback);
    deps.onReposition(href);
    return true;
  }

  async function castPlayback() {
    if (castLaunchState === "connecting") return;
    if (switchPlaybackTarget("cast")) return;
    const data = deps.getData();
    const previousUiState = deps.getPlayerUiState();
    castLaunchState = "connecting";
    try {
      if (data.playback.status !== "ready" || !data.playback.streamUrl) {
        throw new Error("Cast playback is not ready yet.");
      }
      const api = await ensureCastFramework();
      const context = configureCastFramework(api);
      const currentSession = connectedCastSession(context.getCurrentSession?.());
      let session = currentSession;
      if (!session) {
        const requestedSession = await context.requestSession();
        session = connectedCastSession(requestedSession) ?? connectedCastSession(context.getCurrentSession?.());
      }
      if (!session) {
        throw new Error("Cast receiver is not connected.");
      }

      const mediaInfo = new api.chrome.cast.media.MediaInfo(
        data.playback.streamUrl,
        playbackContentTypeForMode({
          mode: data.playback.mode,
          extension: data.playback.file.extension,
        }),
      );
      const metadata = new api.chrome.cast.media.MovieMediaMetadata();
      metadata.title = data.item.title;
      mediaInfo.metadata = metadata;
      mediaInfo.duration =
        Number.isFinite(data.playback.file.duration_seconds) && Number(data.playback.file.duration_seconds) > 0
          ? castReceiverTimelineSeconds({
              absoluteSeconds: Number(data.playback.file.duration_seconds),
              mode: data.playback.mode,
              streamStartSeconds: data.playback.streamStartSeconds,
            })
          : undefined;
      mediaInfo.tracks = data.playback.tracks.map((track, index) => {
        const castTrack = new api.chrome.cast.media.Track(index + 1, api.chrome.cast.media.TrackType.TEXT);
        castTrack.trackContentId = track.src;
        castTrack.trackContentType = "text/vtt";
        castTrack.name = track.label;
        castTrack.language = track.language;
        castTrack.subtype = api.chrome.cast.media.TextTrackType.SUBTITLES;
        return castTrack;
      });

      const loadRequest = new api.chrome.cast.media.LoadRequest(mediaInfo);
      loadRequest.autoplay = true;
      loadRequest.currentTime = castReceiverTimelineSeconds({
        absoluteSeconds: currentCastPositionSeconds(),
        mode: data.playback.mode,
        streamStartSeconds: data.playback.streamStartSeconds,
      });
      const defaultTrackIds = data.playback.tracks
        .map((track, index) => (track.default ? index + 1 : null))
        .filter((id): id is number => id !== null);
      if (defaultTrackIds.length > 0) {
        loadRequest.activeTrackIds = defaultTrackIds;
      }

      deps.setPlayerUiState("buffering");
      castSession = session;
      attachCastMediaUpdateListener(await session.loadMedia(loadRequest));
      markCastOwnedSession(data.playback.playbackSessionId ?? null);
      deps.clearSignedPlaybackNotice();
      syncCastRemotePlayerState();
      castLaunchState = "connected";
      deps.getVideo()?.pause();
    } catch (error) {
      castLaunchState = "error";
      deps.setPlayerUiState(previousUiState);
      const message = error instanceof Error && error.message ? error.message : "Could not prepare Cast playback.";
      deps.showSignedPlaybackNotice(message);
    }
  }

  function castPlaybackSecondsAfterSeekAction(targetSeconds: number) {
    return castPlaybackSecondsAfterSeek({
      commandSent: castSeek(targetSeconds),
      currentPlaybackSeconds: deps.getCurrentPlaybackSeconds(),
      targetSeconds,
    });
  }

  function castUiStateAfterPlaybackCommand() {
    const command = deps.getPlaybackButtonAction();
    return castUiStateAfterCommand({
      command,
      commandSent: castCommand(command),
      fallbackUiState: deps.getPlayerUiState(),
    });
  }

  function runCastFrameworkEffect() {
    $effect(() => {
      if (!browser) return;
      let disposed = false;
      let removeListener: (() => void) | undefined;

      void ensureCastFramework()
        .then((api) => {
          if (disposed) return;
          const context = configureCastFramework(api);
          adoptCastSession(context.getCurrentSession?.());
          const onSessionStateChanged = (event: { sessionState: string }) => {
            if (event.sessionState === api.cast.framework.SessionState.SESSION_ENDED) {
              clearCastPlaybackState();
              castSession = null;
            } else if (
              event.sessionState === api.cast.framework.SessionState.SESSION_STARTED ||
              event.sessionState === api.cast.framework.SessionState.SESSION_RESUMED
            ) {
              adoptCastSession(context.getCurrentSession?.());
            } else if (event.sessionState === api.cast.framework.SessionState.SESSION_START_FAILED) {
              castLaunchState = "error";
            }
          };
          context.addEventListener(
            api.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
            onSessionStateChanged,
          );
          removeListener = () => {
            context.removeEventListener(
              api.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
              onSessionStateChanged,
            );
          };
        })
        .catch(() => {
          castAvailable = false;
        });

      return () => {
        disposed = true;
        removeListener?.();
      };
    });
  }

  function destroy() {
    detachCastMediaUpdateListener();
    detachCastRemotePlayerController();
  }

  return {
    get castAvailable() {
      return castAvailable;
    },
    get castLaunchState() {
      return castLaunchState;
    },
    isCasting,
    castControlsPlayback,
    playbackIsCastOwned,
    castPlayback,
    stopCastPlayback,
    castSeek,
    castPlaybackSecondsAfterSeekAction,
    castUiStateAfterPlaybackCommand,
    switchPlaybackTarget,
    runCastFrameworkEffect,
    destroy,
  };
}
