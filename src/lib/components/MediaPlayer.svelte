<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, tick } from "svelte";
  import PlayerShell from "$lib/components/PlayerShell.svelte";
  import {
    Airplay,
    Captions,
    Cast,
    FastForward,
    Maximize,
    Minimize,
    Pause,
    Play,
    Rewind,
    Volume2,
    VolumeX,
    X,
  } from "@lucide/svelte";
  import {
    airPlayActiveFromVideo,
    airPlayAvailableFromEvent,
    airPlayControlState,
    airPlayTargetPickerAction,
    castControlLabel,
    castMediaTimelineSeconds,
    castPlaybackSecondsAfterSeek,
    castPlaybackCommandForUiState,
    castPlayerUiState,
    castReceiverTimelineSeconds,
    castUiStateAfterCommand,
    clampPlaybackSeconds,
    defaultSubtitleTrackId,
    fullscreenAction,
    hasAirPlayPicker,
    isCastOwnedPlaybackSession,
    markCastOwnedPlaybackSession,
    mediaTimelineSeconds,
    nextControlsActivityTick,
    nextSubtitleMenuOptionIndex,
    playerKeyboardShortcuts,
    playbackProgressSnapshot,
    playbackSliderAriaValue,
    playbackSeekAction,
    playbackTimeRangeText,
    playerSurfaceClickAction,
    playerSurfaceClickState,
    playerStatusOverlayState,
    primaryPlaybackButtonState,
    releaseCastOwnedPlaybackSession,
    shouldAutoHideControls,
    shouldCancelPlaybackSessionForCleanup,
    shouldCloseSubtitleMenuOnPlayerKeydown,
    shouldAttemptLocalAutoplay,
    shouldHandlePlayerShortcut,
    shouldRefreshControlsOnPointerMove,
    shouldShowCustomControls,
    subtitleTextTrackMode,
    volumeSliderAriaValue,
    volumeStateForMuteToggle,
    volumeStateForSliderValue,
  } from "$lib/playback/controls";
  import {
    absolutePlaybackSeconds,
    createHlsSeekEventController,
    hlsRepositionHref,
    shouldReloadHlsPlaybackDataOnError,
    shouldRecoverHlsPlaybackError,
    streamRelativePlaybackSeconds,
  } from "$lib/playback/seek";
  import {
    activePlaybackSessionId,
    cancelPlaybackSessionOnce,
    postWithBeaconFallback,
    shouldCancelCapturedPlaybackSession,
    shouldInvalidateAfterHeartbeat,
  } from "$lib/playback/session";
  import type { PlaybackData, PlaybackDecision } from "$lib/server/playback";

  type PlayerUiState =
    | "starting"
    | "playing"
    | "paused"
    | "buffering"
    | "seeking"
    | "autoplayBlocked"
    | "error";

  type CastApi = {
    cast: any;
    chrome: any;
  };

  type RemotePlaybackResponse = {
    streamUrl: string;
    contentType: string;
    title: string | null;
    durationSeconds: number | null;
    playbackSessionId: string | null;
    tracks: {
      id: string;
      label: string;
      language: string;
      default: boolean;
      src: string;
    }[];
  };

  type SafariVideoElement = HTMLVideoElement & {
    webkitDisplayingFullscreen?: boolean;
    webkitEnterFullScreen?: () => void;
    webkitEnterFullscreen?: () => void;
    webkitExitFullscreen?: () => void;
    webkitShowPlaybackTargetPicker?: () => void;
    webkitCurrentPlaybackTargetIsWireless?: boolean;
  };

  type ScreenWakeLockSentinel = EventTarget & {
    release: () => Promise<void>;
  };

  type ScreenWakeLockNavigator = Navigator & {
    wakeLock?: {
      request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
    };
  };

  type SurfaceFeedback = "seek-backward" | "play" | "pause" | "seek-forward";
  const POINTER_CONTROLS_REFRESH_INTERVAL_MS = 250;

  let {
    data,
    onClose,
    onProgressSaved,
    onReload,
    onReposition,
  }: {
    data: PlaybackData;
    onClose?: () => void;
    onProgressSaved: () => void;
    onReload: () => void;
    onReposition: (href: string) => void;
  } = $props();

  function playbackDurationSeconds(sourceData: PlaybackData = data) {
    const fileDurationSeconds = Number(
      sourceData.playback.file.duration_seconds,
    );
    if (Number.isFinite(fileDurationSeconds) && fileDurationSeconds > 0) {
      return fileDurationSeconds;
    }
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      return mediaTimelineSeconds({
        relativeSeconds: video.duration,
        streamStartSeconds: sourceData.playback.streamStartSeconds,
      });
    }
    return null;
  }

  let playerShell: HTMLDivElement | undefined = $state();
  let video: HTMLVideoElement | undefined = $state();
  let saveState = $state<"idle" | "saving" | "saved" | "error">("idle");
  let playerUiState = $state<PlayerUiState>("starting");
  let hasStartedPlayback = $state(false);
  let playerControlsVisible = $state(true);
  let playerControlsFocused = $state(false);
  let playerControlsHovered = $state(false);
  let surfaceFeedback = $state<SurfaceFeedback | null>(null);
  let surfaceFeedbackTimeout: number | null = null;
  let playerControlsActivityTick = $state(0);
  let currentPlaybackSeconds = $state(0);
  let durationSeconds = $state<number | null>(null);
  let seekPreviewSeconds = $state<number | null>(null);
  let volume = $state(1);
  let muted = $state(false);
  let subtitleMenuOpen = $state(false);
  let selectedSubtitleId = $state("off");
  let subtitleToggleButton: HTMLButtonElement | undefined = $state();
  let subtitleMenuElement: HTMLDivElement | undefined = $state();
  let isFullscreen = $state(false);
  let castAvailable = $state(false);
  let castLaunchState = $state<"idle" | "connecting" | "connected" | "error">(
    "idle",
  );
  let airPlayAvailable = $state(false);
  let airPlayActive = $state(false);
  let airPlayPreparedKey: string | null = null;
  let airPlayPreparedPlayback: RemotePlaybackResponse | null = null;
  let remotePlaybackNotice = $state<string | null>(null);
  let remotePlaybackNoticeTimeout: number | null = null;
  let castOwnedPlaybackSessionId = $state<string | null>(null);
  let castSession: any = null;
  let castMedia: any = null;
  let castMediaUpdateListener: ((isAlive: boolean) => void) | null = null;
  let screenWakeLock: ScreenWakeLockSentinel | null = null;
  let screenWakeLockRequest: Promise<void> | null = null;
  let hasPlaybackActivity = false;
  let playbackActivityKey: string | null = null;
  let lastPointerControlsRefreshAt = -Infinity;
  const cancelledPlaybackSessions = new Set<string>();
  const castOwnedPlaybackSessions = new Set<string>();
  let castFrameworkPromise: Promise<CastApi> | null = null;
  let airPlayPreparePromise: Promise<RemotePlaybackResponse | null> | null =
    null;

  function clearRemotePlaybackNotice() {
    remotePlaybackNotice = null;
    if (remotePlaybackNoticeTimeout !== null) {
      window.clearTimeout(remotePlaybackNoticeTimeout);
      remotePlaybackNoticeTimeout = null;
    }
  }

  function showRemotePlaybackNotice(message: string) {
    remotePlaybackNotice = message;
    if (remotePlaybackNoticeTimeout !== null) {
      window.clearTimeout(remotePlaybackNoticeTimeout);
    }
    remotePlaybackNoticeTimeout = window.setTimeout(() => {
      remotePlaybackNotice = null;
      remotePlaybackNoticeTimeout = null;
    }, 5000);
    showControls();
  }

  async function remotePlaybackErrorMessage(
    response: Response,
    fallback: string,
  ) {
    try {
      const body = (await response.json()) as { error?: unknown };
      return typeof body.error === "string" && body.error.length > 0
        ? body.error
        : fallback;
    } catch {
      return fallback;
    }
  }

  function isCasting() {
    return castLaunchState === "connected";
  }

  function shouldHoldScreenWakeLock() {
    return (
      browser &&
      document.visibilityState === "visible" &&
      Boolean(video) &&
      !isCasting() &&
      !video?.paused &&
      !video?.ended &&
      (playerUiState === "starting" ||
        playerUiState === "playing" ||
        playerUiState === "buffering" ||
        playerUiState === "seeking")
    );
  }

  function releaseScreenWakeLock() {
    const lock = screenWakeLock;
    screenWakeLock = null;
    void lock?.release().catch(() => undefined);
  }

  function requestScreenWakeLock() {
    if (
      !shouldHoldScreenWakeLock() ||
      screenWakeLock ||
      screenWakeLockRequest
    )
      return;
    const wakeLock = (navigator as ScreenWakeLockNavigator).wakeLock;
    if (!wakeLock?.request) return;

    screenWakeLockRequest = (async () => {
      try {
        const lock = await wakeLock.request("screen");
        if (!shouldHoldScreenWakeLock()) {
          await lock.release().catch(() => undefined);
          return;
        }
        screenWakeLock = lock;
        lock.addEventListener(
          "release",
          () => {
            if (screenWakeLock === lock) screenWakeLock = null;
          },
          { once: true },
        );
      } catch {
        // Wake Lock is best-effort; unsupported or denied requests keep normal playback.
      } finally {
        screenWakeLockRequest = null;
      }
    })();
  }

  function syncScreenWakeLock() {
    if (shouldHoldScreenWakeLock()) {
      requestScreenWakeLock();
      return;
    }
    releaseScreenWakeLock();
  }

  function airPlayVideoElement() {
    return video as SafariVideoElement | undefined;
  }

  function syncAirPlayActiveState() {
    airPlayActive = airPlayActiveFromVideo({
      currentPlaybackTargetIsWireless:
        airPlayVideoElement()?.webkitCurrentPlaybackTargetIsWireless,
    });
  }

  function airPlayPreparationKey() {
    const playback = data.playback;
    return [
      playback.mode,
      playback.playbackSessionId ?? playback.streamUrl ?? "",
      playback.file.id,
      playback.streamStartSeconds ?? 0,
      playback.tracks.map((track) => track.id).join(","),
    ].join(":");
  }

  async function prepareAirPlayPlayback() {
    if (data.playback.status !== "ready" || !data.playback.streamUrl)
      return null;

    const key = airPlayPreparationKey();
    if (airPlayPreparedKey === key && airPlayPreparedPlayback) {
      return airPlayPreparedPlayback;
    }
    if (airPlayPreparePromise) return airPlayPreparePromise;

    airPlayPreparePromise = (async () => {
      const response = await fetch("/api/playback/airplay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(remotePlaybackRequestBody()),
      });
      if (!response.ok) {
        throw new Error(
          await remotePlaybackErrorMessage(
            response,
            "Could not prepare AirPlay playback.",
          ),
        );
      }

      const prepared = (await response.json()) as RemotePlaybackResponse;
      airPlayPreparedKey = key;
      airPlayPreparedPlayback = prepared;
      return prepared;
    })();

    try {
      return await airPlayPreparePromise;
    } finally {
      airPlayPreparePromise = null;
    }
  }

  function applyPreparedAirPlayPlayback(prepared: RemotePlaybackResponse) {
    const player = video;
    if (!player) return;

    clearRemotePlaybackNotice();
    const wasPaused = player.paused;
    const targetSeconds = currentPlaybackSeconds;
    applyAirPlayTrackSources(prepared);

    if (
      player.currentSrc !== prepared.streamUrl &&
      player.src !== prepared.streamUrl
    ) {
      player.src = prepared.streamUrl;
      void restorePlaybackPositionAfterSourceSwap(player, targetSeconds).then(
        async () => {
          if (!wasPaused) await player.play().catch(() => undefined);
        },
      );
    }
  }

  function applyAirPlayTrackSources(prepared: RemotePlaybackResponse) {
    if (!video || prepared.tracks.length === 0) return;
    const srcById = new Map(
      prepared.tracks.map((track) => [track.id, track.src] as const),
    );
    for (const trackElement of Array.from(video.querySelectorAll("track"))) {
      const src = srcById.get(trackElement.dataset.trackId ?? "");
      if (src) trackElement.src = src;
    }
    void applySubtitleTrack(selectedSubtitleId);
  }

  async function restorePlaybackPositionAfterSourceSwap(
    player: HTMLVideoElement,
    absoluteSeconds: number,
  ) {
    const relativeSeconds = streamRelativePlaybackSeconds({
      absoluteSeconds,
      streamStartSeconds: data.playback.streamStartSeconds,
    });
    if (player.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve) => {
        player.addEventListener("loadedmetadata", () => resolve(), {
          once: true,
        });
      });
    }
    if (Number.isFinite(relativeSeconds) && relativeSeconds > 0) {
      player.currentTime = relativeSeconds;
    }
    updateTimelineFromVideo();
  }

  function showAirPlayTargetPicker() {
    const player = airPlayVideoElement();
    const picker = player?.webkitShowPlaybackTargetPicker;
    if (
      airPlayTargetPickerAction({
        available: airPlayAvailable,
        showPlaybackTargetPicker: picker,
      }) !== "show-picker"
    )
      return;

    const prepared =
      airPlayPreparedKey === airPlayPreparationKey()
        ? airPlayPreparedPlayback
        : null;
    if (prepared) {
      applyPreparedAirPlayPlayback(prepared);
      picker?.call(player);
      showControls();
      return;
    }

    void prepareAirPlayPlayback()
      .then((nextPrepared) => {
        if (!nextPrepared) return;
        applyPreparedAirPlayPlayback(nextPrepared);
        picker?.call(player);
        showControls();
      })
      .catch((error) => {
        airPlayPreparedKey = null;
        airPlayPreparedPlayback = null;
        showRemotePlaybackNotice(
          error instanceof Error && error.message
            ? error.message
            : "Could not prepare AirPlay playback.",
        );
      });
  }

  function statusOverlayState() {
    return playerStatusOverlayState({
      uiState: playerUiState,
      casting: isCasting(),
    });
  }

  function controlsAreVisible() {
    return shouldShowCustomControls({
      controlsVisible: playerControlsVisible,
      uiState: playerUiState,
      casting: isCasting(),
      subtitleMenuOpen,
      controlsFocused: playerControlsFocused,
      controlsHovered: playerControlsHovered,
    });
  }

  function displayedPlaybackSeconds() {
    return seekPreviewSeconds ?? currentPlaybackSeconds;
  }

  function seekSliderMax() {
    return Math.max(1, Math.ceil(durationSeconds ?? currentPlaybackSeconds ?? 1));
  }

  function seekSliderAriaValue() {
    return playbackSliderAriaValue({
      seconds: displayedPlaybackSeconds(),
      durationSeconds,
    });
  }

  function volumeAriaValue() {
    return volumeSliderAriaValue({ volume, muted });
  }

  function airPlayButtonState() {
    return airPlayControlState({
      available: airPlayAvailable,
      active: airPlayActive,
      casting: isCasting(),
    });
  }

  function playbackButtonState() {
    return primaryPlaybackButtonState({ uiState: playerUiState });
  }

  function showControls() {
    playerControlsVisible = true;
    playerControlsActivityTick = nextControlsActivityTick(
      playerControlsActivityTick,
    );
  }

  function handlePlayerPointerMove() {
    if (
      shouldRefreshControlsOnPointerMove({
        controlsVisible: playerControlsVisible,
        uiState: playerUiState,
        casting: isCasting(),
        subtitleMenuOpen,
        controlsFocused: playerControlsFocused,
        controlsHovered: playerControlsHovered,
      })
    ) {
      const now = window.performance.now();
      if (
        playerControlsVisible &&
        now - lastPointerControlsRefreshAt <
          POINTER_CONTROLS_REFRESH_INTERVAL_MS
      ) {
        return;
      }
      lastPointerControlsRefreshAt = now;
      showControls();
    }
  }

  function handleControlsFocusIn() {
    playerControlsFocused = true;
    showControls();
  }

  function handleControlsFocusOut(event: FocusEvent) {
    const nextTarget = event.relatedTarget;
    const currentTarget = event.currentTarget;
    playerControlsFocused = Boolean(
      nextTarget instanceof Node &&
        currentTarget instanceof HTMLElement &&
        currentTarget.contains(nextTarget),
    );
  }

  function toggleControls() {
    const next = playerSurfaceClickState({
      uiState: playerUiState,
      controlsVisible: playerControlsVisible,
      subtitleMenuOpen,
    });
    playerControlsVisible = next.controlsVisible;
    subtitleMenuOpen = next.subtitleMenuOpen;
  }

  function showSurfaceFeedback(action: SurfaceFeedback) {
    surfaceFeedback = action;
    if (surfaceFeedbackTimeout !== null) {
      window.clearTimeout(surfaceFeedbackTimeout);
    }
    surfaceFeedbackTimeout = window.setTimeout(() => {
      surfaceFeedback = null;
      surfaceFeedbackTimeout = null;
    }, 620);
  }

  function handleSurfaceClick(event: MouseEvent) {
    if (subtitleMenuOpen) {
      toggleControls();
      return;
    }

    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    const rect = target.getBoundingClientRect();
    const action = playerSurfaceClickAction({
      clientX: event.clientX,
      left: rect.left,
      width: rect.width,
    });
    showControls();
    if (action === "seek-backward") {
      showSurfaceFeedback("seek-backward");
      skipPlayback(-10);
    } else if (action === "seek-forward") {
      showSurfaceFeedback("seek-forward");
      skipPlayback(30);
    } else {
      showSurfaceFeedback(video?.paused || video?.ended ? "play" : "pause");
      void toggleLocalPlayback();
    }
  }

  function focusPlayerShell() {
    playerShell?.focus({ preventScroll: true });
  }

  function castWindow() {
    return window as typeof window & {
      __onGCastApiAvailable?: (available: boolean) => void;
      cast?: any;
      chrome?: any;
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

  function ensureCastFramework() {
    if (!browser) return Promise.reject(new Error("Cast is unavailable."));
    if (castFrameworkPromise) return castFrameworkPromise;

    castFrameworkPromise = new Promise<CastApi>((resolve, reject) => {
      const win = castWindow();
      const resolveApi = () => {
        if (win.cast?.framework && win.chrome?.cast) {
          const api = { cast: win.cast, chrome: win.chrome };
          configureCastFramework(api);
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

      let script = document.getElementById(
        "google-cast-sender-sdk",
      ) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = "google-cast-sender-sdk";
        script.async = true;
        script.src =
          "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
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

  function detachCastMediaUpdateListener(media: any = castMedia) {
    if (!castMediaUpdateListener) return;
    media?.removeUpdateListener?.(castMediaUpdateListener);
    castMediaUpdateListener = null;
  }

  function syncCastMediaState(media: any, alive = true) {
    playerUiState = castPlayerUiState({
      alive,
      playerState: media?.playerState,
      fallbackUiState: playerUiState,
    });
    const castCurrentTime = Number(media?.currentTime);
    const castDuration = Number(media?.media?.duration);
    const nextDuration =
      Number.isFinite(castDuration) && castDuration > 0
        ? castMediaTimelineSeconds({
            receiverSeconds: castDuration,
            mode: data.playback.mode,
            streamStartSeconds: data.playback.streamStartSeconds,
          })
        : durationSeconds;
    if (Number.isFinite(castCurrentTime) && castCurrentTime >= 0) {
      currentPlaybackSeconds = clampPlaybackSeconds({
        seconds: castMediaTimelineSeconds({
          receiverSeconds: castCurrentTime,
          mode: data.playback.mode,
          streamStartSeconds: data.playback.streamStartSeconds,
        }),
        durationSeconds: nextDuration,
      });
      if (currentPlaybackSeconds > 0) hasPlaybackActivity = true;
    }
    if (nextDuration !== null && Number.isFinite(nextDuration) && nextDuration > 0) {
      durationSeconds = nextDuration;
    }
    if (!alive) showControls();
  }

  function attachCastMediaUpdateListener(media: any) {
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

  function adoptCastSession(session: any) {
    if (!session) return;
    castSession = session;
    castAvailable = true;
    castLaunchState = "connected";
    const media = session.getMediaSession?.();
    if (media) attachCastMediaUpdateListener(media);
    video?.pause();
    showControls();
  }

  function castCommand(command: "play" | "pause") {
    const media = activeCastMedia();
    if (!media?.[command]) return false;
    media[command](null, () => undefined, () => undefined);
    return true;
  }

  function castSeek(seconds: number) {
    const media = activeCastMedia();
    const chromeApi = castWindow().chrome;
    if (!media?.seek || !chromeApi?.cast?.media?.SeekRequest) return false;
    const request = new chromeApi.cast.media.SeekRequest();
    request.currentTime = castReceiverTimelineSeconds({
      absoluteSeconds: seconds,
      mode: data.playback.mode,
      streamStartSeconds: data.playback.streamStartSeconds,
    });
    media.seek(request, () => undefined, () => undefined);
    return true;
  }

  function clearCastPlaybackState() {
    const sessionId = castOwnedPlaybackSessionId;
    releaseCastOwnedSession(sessionId);
    if (sessionId) cancelPlaybackSessionById(sessionId);
    detachCastMediaUpdateListener();
    castMedia = null;
    castLaunchState = "idle";
    playerUiState = "paused";
    showControls();
  }

  function stopCastPlayback() {
    const session = castSession;
    clearCastPlaybackState();
    castSession = null;
    session?.endSession?.(true);
  }

  function playerOverlayMessage() {
    switch (playerUiState) {
      case "autoplayBlocked":
      case "paused":
        return "Press play";
      case "buffering":
        return "Buffering";
      case "seeking":
        return "Seeking";
      case "error":
        return "Playback error";
      default:
        return "Starting playback";
    }
  }

  async function playFromOverlay() {
    if (!video) return;
    showControls();
    playerUiState = "starting";
    try {
      await video.play();
      hasPlaybackActivity = true;
      hasStartedPlayback = true;
      playerUiState = "playing";
    } catch {
      playerUiState = "autoplayBlocked";
    }
  }

  function progressPayload(sourceData: PlaybackData = data, completed = false) {
    if (!video) return null;
    const snapshot = playbackProgressSnapshot({
      casting: isCasting(),
      videoRelativeSeconds: Number.isFinite(video.currentTime)
        ? video.currentTime
        : 0,
      videoDurationSeconds: Number.isFinite(video.duration)
        ? video.duration
        : null,
      currentPlaybackSeconds,
      uiDurationSeconds: durationSeconds,
      fileDurationSeconds: Number(sourceData.playback.file.duration_seconds),
      streamStartSeconds: sourceData.playback.streamStartSeconds,
    });
    const ended = completed || video.ended;
    const hasProgressActivity =
      hasPlaybackActivity || (isCasting() && snapshot.positionSeconds > 0);
    if (!ended && !hasProgressActivity && video.currentTime <= 0) return null;

    return {
      mediaFileId: sourceData.playback.file.id,
      positionSeconds: snapshot.positionSeconds,
      durationSeconds: snapshot.durationSeconds,
      completed: ended,
    };
  }

  async function save(completed = false, sourceData: PlaybackData = data) {
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
      if (response.ok) onProgressSaved();
    } catch {
      saveState = "error";
    }
  }

  function flushProgress(sourceData: PlaybackData = data) {
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
    playback: PlaybackDecision = data.playback,
    options: { includeCastOwned?: boolean } = {},
  ) {
    if (
      !shouldCancelPlaybackSessionForCleanup({
        castOwned: playbackIsCastOwned(playback),
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

  function cancelPlaybackSessionById(sessionId: string) {
    if (cancelledPlaybackSessions.has(sessionId)) return;
    cancelledPlaybackSessions.add(sessionId);
    postWithBeaconFallback({
      url: `/api/playback-sessions/${encodeURIComponent(sessionId)}/cancel`,
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
          current: data.playback,
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
    void fetch(
      `/api/playback-sessions/${encodeURIComponent(sessionId)}/heartbeat`,
      {
        method: "POST",
      },
    )
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
          onReload();
        }
      })
      .catch(() => undefined);
  }

  function updateTimelineFromVideo(sourceData: PlaybackData = data) {
    if (!video) return;
    currentPlaybackSeconds = clampPlaybackSeconds({
      seconds: mediaTimelineSeconds({
        relativeSeconds: Number.isFinite(video.currentTime)
          ? video.currentTime
          : 0,
        streamStartSeconds: sourceData.playback.streamStartSeconds,
      }),
      durationSeconds: playbackDurationSeconds(sourceData),
    });
    durationSeconds = playbackDurationSeconds(sourceData);
  }

  function applyVideoVolume() {
    if (!video) return;
    video.volume = Math.min(Math.max(volume, 0), 1);
    video.muted = muted || volume === 0;
  }

  function toggleMute() {
    const next = volumeStateForMuteToggle({ volume, muted });
    volume = next.volume;
    muted = next.muted;
    applyVideoVolume();
    showControls();
  }

  function setVolume(value: number) {
    const next = volumeStateForSliderValue(value);
    volume = next.volume;
    muted = next.muted;
    applyVideoVolume();
    showControls();
  }

  async function applySubtitleTrack(trackId: string, focusToggle = false) {
    selectedSubtitleId = trackId;
    subtitleMenuOpen = false;
    if (video) {
      const trackElements = Array.from(video.querySelectorAll("track"));
      for (const trackElement of trackElements) {
        const candidate = data.playback.tracks.find(
          (track) => track.id === trackElement.dataset.trackId,
        );
        const textTrack = trackElement.track;
        if (!textTrack) continue;
        textTrack.mode = subtitleTextTrackMode({
          selectedTrackId: trackId,
          track: candidate,
        });
      }
    }
    showControls();
    if (!focusToggle) return;
    await tick();
    subtitleToggleButton?.focus();
  }

  async function openSubtitleMenu() {
    if (data.playback.tracks.length === 0) return;
    subtitleMenuOpen = true;
    showControls();
    await tick();
    const selectedOption =
      subtitleMenuElement?.querySelector<HTMLButtonElement>(
        '[role="menuitemradio"][aria-checked="true"]',
      ) ??
      subtitleMenuElement?.querySelector<HTMLButtonElement>(
        '[role="menuitemradio"]',
      );
    selectedOption?.focus();
  }

  async function closeSubtitleMenu(focusToggle = false) {
    subtitleMenuOpen = false;
    showControls();
    if (!focusToggle) return;
    await tick();
    subtitleToggleButton?.focus();
  }

  function toggleSubtitleMenu() {
    if (subtitleMenuOpen) {
      void closeSubtitleMenu(true);
    } else {
      void openSubtitleMenu();
    }
  }

  function syncDefaultSubtitleTrack() {
    void applySubtitleTrack(defaultSubtitleTrackId(data.playback.tracks));
  }

  async function toggleLocalPlayback() {
    if (!video) return;
    showControls();
    if (isCasting()) {
      const command = castPlaybackCommandForUiState(playerUiState);
      playerUiState = castUiStateAfterCommand({
        command,
        commandSent: castCommand(command),
        fallbackUiState: playerUiState,
      });
      return;
    }
    if (video.paused || video.ended) {
      await playFromOverlay();
    } else {
      video.pause();
      playerUiState = "paused";
    }
  }

  function repositionPlaybackTo(targetSeconds: number) {
    const href = hlsRepositionHref({
      currentUrl: new URL(window.location.href),
      mediaFileId: data.playback.file.id,
      startSeconds: targetSeconds,
    });
    const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (href === currentHref) return;
    flushProgress(data);
    cancelPlaybackSession(data.playback);
    onReposition(href);
  }

  function seekToPlaybackSeconds(targetSeconds: number) {
    const action = playbackSeekAction({
      casting: isCasting(),
      mode: data.playback.mode,
      targetSeconds,
      durationSeconds,
      streamStartSeconds: data.playback.streamStartSeconds,
    });
    seekPreviewSeconds = null;
    showControls();

    if (action.kind === "cast") {
      currentPlaybackSeconds = castPlaybackSecondsAfterSeek({
        commandSent: castSeek(action.targetSeconds),
        currentPlaybackSeconds,
        targetSeconds: action.targetSeconds,
      });
      return;
    }

    if (!video) return;
    currentPlaybackSeconds = action.targetSeconds;
    hasPlaybackActivity = true;
    if (action.kind === "hls-reposition") {
      repositionPlaybackTo(action.targetSeconds);
      return;
    }

    playerUiState = "seeking";
    video.currentTime = action.elementSeconds;
  }

  function skipPlayback(deltaSeconds: number) {
    seekToPlaybackSeconds(displayedPlaybackSeconds() + deltaSeconds);
  }

  async function toggleFullscreen() {
    if (!browser || !playerShell) return;
    const safariVideo = video as SafariVideoElement | undefined;
    const enterVideoFullscreen =
      safariVideo?.webkitEnterFullscreen ?? safariVideo?.webkitEnterFullScreen;
    const videoFullscreen = Boolean(
      safariVideo?.webkitDisplayingFullscreen ||
        (isFullscreen && document.fullscreenElement === null),
    );
    const action = fullscreenAction({
      documentFullscreen: document.fullscreenElement !== null,
      canExitDocumentFullscreen: typeof document.exitFullscreen === "function",
      canRequestDocumentFullscreen:
        typeof playerShell.requestFullscreen === "function",
      canEnterVideoFullscreen: typeof enterVideoFullscreen === "function",
      videoFullscreen,
      canExitVideoFullscreen:
        typeof safariVideo?.webkitExitFullscreen === "function",
    });

    try {
      if (action === "exit-document") {
        await document.exitFullscreen();
        isFullscreen = false;
      } else if (action === "exit-video") {
        safariVideo?.webkitExitFullscreen?.();
        isFullscreen = false;
      } else if (action === "enter-document") {
        await playerShell.requestFullscreen();
        isFullscreen = true;
      } else if (action === "enter-video" && enterVideoFullscreen) {
        enterVideoFullscreen.call(safariVideo);
        isFullscreen = true;
      }
    } catch {
      isFullscreen = false;
    }
    showControls();
  }

  function handlePlayerKeydown(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (
      shouldCloseSubtitleMenuOnPlayerKeydown({
        key,
        subtitleMenuOpen,
      })
    ) {
      event.preventDefault();
      event.stopPropagation();
      void closeSubtitleMenu(true);
      return;
    }
    if (!shouldHandlePlayerShortcut(event.target)) return;
    if (key === " " || key === "k") {
      event.preventDefault();
      void toggleLocalPlayback();
    } else if (key === "arrowleft") {
      event.preventDefault();
      skipPlayback(-10);
    } else if (key === "arrowright") {
      event.preventDefault();
      skipPlayback(30);
    } else if (key === "f") {
      event.preventDefault();
      void toggleFullscreen();
    } else if (key === "m") {
      event.preventDefault();
      toggleMute();
    } else if (key === "c" && data.playback.tracks.length > 0) {
      event.preventDefault();
      toggleSubtitleMenu();
    }
  }

  function focusSubtitleMenuOption(current: EventTarget | null, delta: number) {
    const options = Array.from(
      subtitleMenuElement?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]',
      ) ?? [],
    );
    if (options.length === 0) return;
    const currentIndex =
      current instanceof HTMLButtonElement ? options.indexOf(current) : -1;
    const nextIndex = nextSubtitleMenuOptionIndex({
      optionCount: options.length,
      currentIndex,
      delta,
    });
    options[nextIndex]?.focus();
  }

  function handleSubtitleMenuKeydown(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (key === "escape") {
      event.preventDefault();
      event.stopPropagation();
      void closeSubtitleMenu(true);
    } else if (key === "arrowdown" || key === "arrowright") {
      event.preventDefault();
      focusSubtitleMenuOption(event.target, 1);
    } else if (key === "arrowup" || key === "arrowleft") {
      event.preventDefault();
      focusSubtitleMenuOption(event.target, -1);
    } else if (key === "home") {
      event.preventDefault();
      focusSubtitleMenuOption(null, 0);
    } else if (key === "end") {
      event.preventDefault();
      focusSubtitleMenuOption(null, -1);
    }
  }

  function currentCastPositionSeconds() {
    const payload = progressPayload(data, false);
    if (payload) return payload.positionSeconds;
    return Number.isFinite(data.startSeconds) ? data.startSeconds : 0;
  }

  function remotePlaybackRequestBody() {
    const playback = data.playback;
    return {
      mediaItemId: data.item.id,
      mediaFileId: playback.file.id,
      playbackSessionId: playback.playbackSessionId,
      mode: playback.mode,
      subtitleTrackIds: playback.tracks.map((track) => track.id),
    };
  }

  async function prepareCastPlayback() {
    const response = await fetch("/api/playback/cast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(remotePlaybackRequestBody()),
    });
    if (!response.ok) {
      throw new Error(
        await remotePlaybackErrorMessage(
          response,
          "Could not prepare Cast playback.",
        ),
      );
    }
    return (await response.json()) as RemotePlaybackResponse;
  }

  async function castPlayback() {
    if (castLaunchState === "connecting") return;
    castLaunchState = "connecting";
    let preparedPlaybackSessionId: string | null = null;
    try {
      const api = await ensureCastFramework();
      const context = configureCastFramework(api);
      const currentSession = context.getCurrentSession?.();
      let castPlayback = currentSession ? await prepareCastPlayback() : null;
      preparedPlaybackSessionId = castPlayback?.playbackSessionId ?? null;
      const session = currentSession ?? (await context.requestSession());
      if (!castPlayback) {
        castPlayback = await prepareCastPlayback();
        preparedPlaybackSessionId = castPlayback.playbackSessionId;
      }
      const mediaInfo = new api.chrome.cast.media.MediaInfo(
        castPlayback.streamUrl,
        castPlayback.contentType,
      );
      const metadata = new api.chrome.cast.media.MovieMediaMetadata();
      metadata.title = castPlayback.title ?? data.item.title;
      mediaInfo.metadata = metadata;
      mediaInfo.duration =
        Number.isFinite(castPlayback.durationSeconds) &&
        Number(castPlayback.durationSeconds) > 0
          ? castReceiverTimelineSeconds({
              absoluteSeconds: Number(castPlayback.durationSeconds),
              mode: data.playback.mode,
              streamStartSeconds: data.playback.streamStartSeconds,
            })
          : undefined;
      mediaInfo.tracks = castPlayback.tracks.map((track, index) => {
        const castTrack = new api.chrome.cast.media.Track(
          index + 1,
          api.chrome.cast.media.TrackType.TEXT,
        );
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
      const defaultTrackIds = castPlayback.tracks
        .map((track, index) => (track.default ? index + 1 : null))
        .filter((id): id is number => id !== null);
      if (defaultTrackIds.length > 0) {
        loadRequest.activeTrackIds = defaultTrackIds;
      }

      castSession = session;
      attachCastMediaUpdateListener(await session.loadMedia(loadRequest));
      markCastOwnedSession(castPlayback.playbackSessionId);
      preparedPlaybackSessionId = null;
      clearRemotePlaybackNotice();
      castLaunchState = "connected";
      playerUiState = "playing";
      video?.pause();
    } catch (error) {
      if (preparedPlaybackSessionId) {
        cancelPlaybackSessionById(preparedPlaybackSessionId);
      }
      castLaunchState = "error";
      showRemotePlaybackNotice(
        error instanceof Error && error.message
          ? error.message
          : "Could not prepare Cast playback.",
      );
    }
  }

  $effect(() => {
    if (!browser) return;

    const sourceData = data;
    const playback = sourceData.playback;
    const startSeconds = sourceData.startSeconds;
    const player = video;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      await tick();
      if (disposed) return;

      if (playback.status === "preparing") {
        const interval = window.setInterval(onReload, 3000);

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
        hasPlaybackActivity = false;
        hasStartedPlayback = false;
        airPlayPreparedKey = null;
        airPlayPreparedPlayback = null;
        playerUiState = "starting";
        saveState = "idle";
        playerControlsVisible = true;
        playerControlsFocused = false;
        playerControlsHovered = false;
        currentPlaybackSeconds = Math.max(0, sourceData.startSeconds);
        durationSeconds = playbackDurationSeconds(sourceData);
        seekPreviewSeconds = null;
        selectedSubtitleId = defaultSubtitleTrackId(playback.tracks);
        subtitleMenuOpen = false;
      }
      const relativeStartSeconds = () =>
        streamRelativePlaybackSeconds({
          absoluteSeconds: startSeconds,
          streamStartSeconds: playback.streamStartSeconds,
        });
      let repositioning = false;
      const streamUrl = playback.streamUrl;
      const currentPageHref = () =>
        `${window.location.pathname}${window.location.search}${window.location.hash}`;
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
            hls.on(Hls.Events.ERROR, (_event, eventData) => {
              if (!disposed && eventData.fatal)
                restartHlsNearCurrentTime("hls");
            });
            hls.loadSource(streamUrl);
            hls.attachMedia(player);
            return;
          }
        }
        player.src = streamUrl;
      };

      void setupPlayer();

      const seekToStart = () => {
        if (startSeconds <= 0 || !Number.isFinite(startSeconds)) return;
        player.currentTime = relativeStartSeconds();
        hlsSeekController.timeUpdate({
          relativeSeconds: player.currentTime,
          seeking: false,
        });
        hasPlaybackActivity = true;
      };

      let autoplayAttempted = false;
      let autoplayRetriedAfterReady = false;
      const attemptAutoplay = async (
        options: { retryAfterReady?: boolean } = {},
      ) => {
        const retryAfterReady = options.retryAfterReady === true;
        if (retryAfterReady && autoplayRetriedAfterReady) return;
        if (
          !shouldAttemptLocalAutoplay({
            autoplayAttempted,
            retryAfterReady,
            disposed,
            paused: player.paused,
            casting: isCasting(),
          })
        )
          return;
        if (retryAfterReady) {
          autoplayRetriedAfterReady = true;
        } else {
          autoplayAttempted = true;
        }
        playerUiState = "starting";
        try {
          await player.play();
          if (disposed) return;
          hasPlaybackActivity = true;
          hasStartedPlayback = true;
          playerUiState = "playing";
        } catch {
          if (!disposed && !hasStartedPlayback)
            playerUiState = "autoplayBlocked";
        }
      };

      const prepareInitialPlayback = () => {
        updateTimelineFromVideo(sourceData);
        syncDefaultSubtitleTrack();
        applyVideoVolume();
        seekToStart();
        void attemptAutoplay();
      };

      const currentPlayerTime = () =>
        absolutePlaybackSeconds({
          relativeSeconds: Number.isFinite(player.currentTime)
            ? player.currentTime
            : 0,
          streamStartSeconds: playback.streamStartSeconds,
        });
      const clearTransientOverlayIfPlaying = () => {
        if (
          (playerUiState !== "buffering" && playerUiState !== "seeking") ||
          player.paused ||
          player.seeking ||
          player.ended ||
          player.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        )
          return;
        hasPlaybackActivity = true;
        hasStartedPlayback = true;
        playerUiState = "playing";
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
        flushProgress(sourceData);
        cancelPlaybackSession(playback);
        onReposition(href);
        return true;
      };

      const hlsSeekController = createHlsSeekEventController({
        startSeconds,
        streamStartSeconds: playback.streamStartSeconds,
      });

      const restartHlsNearCurrentTime = (
        source: "hls" | "native" = "native",
      ) => {
        if (disposed) return;
        if (source === "native" && hls) return;
        const currentTime = currentPlayerTime();
        if (
          repositioning ||
          !shouldRecoverHlsPlaybackError({
            mode: playback.mode,
            status: playback.status,
            currentSeconds: currentTime,
            hasPlaybackActivity,
          })
        ) {
          if (
            shouldReloadHlsPlaybackDataOnError({
              mode: playback.mode,
              status: playback.status,
              currentSeconds: currentTime,
              hasPlaybackActivity,
              hasLoadedMetadata:
                player.readyState >= HTMLMediaElement.HAVE_METADATA,
            })
          ) {
            repositioning = true;
            stopHlsTransport();
            cancelPlaybackSession(playback);
            onReload();
          }
          return;
        }

        repositionHlsPlayback(currentTime);
      };

      const onTimeUpdate = () => {
        hlsSeekController.timeUpdate({
          relativeSeconds: Number.isFinite(player.currentTime)
            ? player.currentTime
            : 0,
          seeking: player.seeking,
        });
        updateTimelineFromVideo(sourceData);
        clearTransientOverlayIfPlaying();
      };
      const onDurationChange = () => {
        updateTimelineFromVideo(sourceData);
      };
      const onLoadStart = () => {
        if (!hasStartedPlayback) playerUiState = "starting";
      };
      const onCanPlay = () => {
        clearTransientOverlayIfPlaying();
        if (
          !hasStartedPlayback &&
          player.paused &&
          playerUiState !== "autoplayBlocked"
        ) {
          void attemptAutoplay({ retryAfterReady: true });
          return;
        }
        if (
          !hasStartedPlayback &&
          !autoplayAttempted &&
          playerUiState !== "autoplayBlocked"
        ) {
          playerUiState = "paused";
        }
      };
      const onPlaying = () => {
        hasPlaybackActivity = true;
        hasStartedPlayback = true;
        playerUiState = "playing";
        showControls();
      };
      const onPause = () => {
        if (
          disposed ||
          isCasting() ||
          player.ended ||
          repositioning ||
          playerUiState === "autoplayBlocked"
        )
          return;
        playerUiState = "paused";
      };
      const onWaiting = () => {
        if (playerUiState === "autoplayBlocked") return;
        playerUiState = player.seeking ? "seeking" : "buffering";
      };
      const onSeeking = () => {
        const decision = hlsSeekController.seeking();
        playerUiState = decision.uiState;
        updateTimelineFromVideo(sourceData);
        showControls();
      };
      const onSeeked = () => {
        const decision = hlsSeekController.seeked({
          relativeSeconds: Number.isFinite(player.currentTime)
            ? player.currentTime
            : 0,
          paused: player.paused,
        });
        playerUiState = decision.uiState;
        seekPreviewSeconds = null;
        updateTimelineFromVideo(sourceData);
      };
      const onPlayerError = () => {
        playerUiState = "error";
        restartHlsNearCurrentTime("native");
      };
      const onEnded = () => {
        hasPlaybackActivity = true;
        hasStartedPlayback = true;
        playerUiState = "paused";
        showControls();
        updateTimelineFromVideo(sourceData);
        void save(true, sourceData);
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

      const interval = window.setInterval(
        () => void save(false, sourceData),
        10000,
      );
      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") flushProgress(sourceData);
      };
      const flushCapturedProgress = () => flushProgress(sourceData);
      window.addEventListener("pagehide", flushCapturedProgress);
      document.addEventListener("visibilitychange", onVisibilityChange);

      cleanup = () => {
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
          if (
            event.sessionState === api.cast.framework.SessionState.SESSION_ENDED
          ) {
            clearCastPlaybackState();
            castSession = null;
          } else if (
            event.sessionState ===
              api.cast.framework.SessionState.SESSION_STARTED ||
            event.sessionState ===
              api.cast.framework.SessionState.SESSION_RESUMED
          ) {
            adoptCastSession(context.getCurrentSession?.());
          } else if (
            event.sessionState ===
            api.cast.framework.SessionState.SESSION_START_FAILED
          ) {
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

  $effect(() => {
    if (!browser || !airPlayAvailable || !video || airPlayActive) return;
    const key = airPlayPreparationKey();
    if (airPlayPreparedKey === key) return;
    void prepareAirPlayPlayback().catch(() => {
      airPlayPreparedKey = null;
      airPlayPreparedPlayback = null;
    });
  });

  $effect(() => {
    if (!browser) return;
    const controlsActivityTick = playerControlsActivityTick;
    void controlsActivityTick;
    if (shouldAutoHideControls({
      uiState: playerUiState,
      controlsVisible: playerControlsVisible,
      casting: isCasting(),
      subtitleMenuOpen,
      controlsFocused: playerControlsFocused,
      controlsHovered: playerControlsHovered,
    })) {
      const timeout = window.setTimeout(() => {
        playerControlsVisible = false;
      }, 3200);
      return () => window.clearTimeout(timeout);
    }
  });

  $effect(() => {
    if (!browser) return;
    const onFullscreenChange = () => {
      isFullscreen = document.fullscreenElement === playerShell;
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  });

  $effect(() => {
    if (!browser || !video) return;
    const safariVideo = video as SafariVideoElement;
    const onBeginFullscreen = () => {
      isFullscreen = true;
    };
    const onEndFullscreen = () => {
      isFullscreen = false;
      showControls();
    };
    safariVideo.addEventListener("webkitbeginfullscreen", onBeginFullscreen);
    safariVideo.addEventListener("webkitendfullscreen", onEndFullscreen);
    return () => {
      safariVideo.removeEventListener(
        "webkitbeginfullscreen",
        onBeginFullscreen,
      );
      safariVideo.removeEventListener("webkitendfullscreen", onEndFullscreen);
    };
  });

  $effect(() => {
    if (!browser || !video) return;
    const safariVideo = video as SafariVideoElement;
    safariVideo.setAttribute("x-webkit-airplay", "allow");
    const canShowPicker = hasAirPlayPicker({
      showPlaybackTargetPicker: safariVideo.webkitShowPlaybackTargetPicker,
    });
    if (!canShowPicker) {
      airPlayAvailable = false;
      airPlayActive = false;
      return;
    }

    syncAirPlayActiveState();
    const onAvailabilityChanged = (event: Event) => {
      airPlayAvailable = airPlayAvailableFromEvent({
        canShowPicker,
        availability: (event as Event & { availability?: string }).availability,
      });
      syncAirPlayActiveState();
    };
    const onWirelessChanged = () => {
      syncAirPlayActiveState();
      showControls();
    };

    safariVideo.addEventListener(
      "webkitplaybacktargetavailabilitychanged",
      onAvailabilityChanged,
    );
    safariVideo.addEventListener(
      "webkitcurrentplaybacktargetiswirelesschanged",
      onWirelessChanged,
    );
    return () => {
      safariVideo.removeEventListener(
        "webkitplaybacktargetavailabilitychanged",
        onAvailabilityChanged,
      );
      safariVideo.removeEventListener(
        "webkitcurrentplaybacktargetiswirelesschanged",
        onWirelessChanged,
      );
    };
  });

  $effect(() => {
    if (!browser) return;
    applyVideoVolume();
  });

  $effect(() => {
    if (!browser) return;
    const player = video;
    const uiState = playerUiState;
    const castState = castLaunchState;
    void player;
    void uiState;
    void castState;
    syncScreenWakeLock();
  });

  $effect(() => {
    if (!browser) return;
    const onVisibilityChange = () => syncScreenWakeLock();
    const onPageHide = () => releaseScreenWakeLock();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      releaseScreenWakeLock();
    };
  });

  $effect(() => {
    if (!browser) return;
    const playback = data.playback;
    if (
      (playback.mode !== "transcode" && playback.mode !== "remux") ||
      !playback.playbackSessionId ||
      (playback.status !== "preparing" && playback.status !== "ready")
    )
      return;

    heartbeatPlaybackSession(playback);
    const interval = window.setInterval(
      () => heartbeatPlaybackSession(playback),
      10000,
    );
    const cancelCapturedPlaybackSession = () => cancelPlaybackSession(playback);
    window.addEventListener("pagehide", cancelCapturedPlaybackSession);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", cancelCapturedPlaybackSession);
    };
  });

  $effect(() => {
    if (!browser) return;
    const sourceData = data;
    const playback = sourceData.playback;
    return () => {
      flushProgress(sourceData);
      cancelPlaybackSessionWhenReplaced(playback);
    };
  });

  onDestroy(() => {
    if (surfaceFeedbackTimeout !== null) {
      window.clearTimeout(surfaceFeedbackTimeout);
      surfaceFeedbackTimeout = null;
    }
    clearRemotePlaybackNotice();
    releaseScreenWakeLock();
    flushProgress(data);
    detachCastMediaUpdateListener();
    cancelPlaybackSession(data.playback);
  });
</script>

{#if data.playback.status === "ready" && data.playback.streamUrl}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={playerShell}
    class:controls-hidden={!controlsAreVisible()}
    class="video-shell custom-player"
    role="region"
    aria-roledescription="video player"
    aria-label={`Video player for ${data.item.title}`}
    aria-keyshortcuts={playerKeyboardShortcuts({
      hasSubtitleTracks: data.playback.tracks.length > 0,
    })}
    tabindex="0"
    onkeydown={handlePlayerKeydown}
    onpointermove={handlePlayerPointerMove}
  >
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={video}
      playsinline
      preload={data.playback.mode === "direct" ? "metadata" : "auto"}
      onplay={() => (hasPlaybackActivity = true)}
      ontimeupdate={() => {
        if (video && video.currentTime > 0) hasPlaybackActivity = true;
      }}
      onpause={() => save(false)}
    >
      {#each data.playback.tracks as track}
        <track
          data-track-id={track.id}
          kind="subtitles"
          src={track.src}
          srclang={track.language}
          label={track.label}
          default={track.default}
        />
      {/each}
    </video>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="video-tap-target"
      aria-hidden="true"
      onpointerdown={focusPlayerShell}
      onclick={handleSurfaceClick}
    ></div>

    {#if surfaceFeedback}
      <div
        class:seek-backward={surfaceFeedback === "seek-backward"}
        class:seek-forward={surfaceFeedback === "seek-forward"}
        class="surface-feedback"
        aria-hidden="true"
      >
        {#if surfaceFeedback === "seek-backward"}
          <Rewind size={34} aria-hidden="true" />
          <span>10</span>
        {:else if surfaceFeedback === "seek-forward"}
          <FastForward size={34} aria-hidden="true" />
          <span>30</span>
        {:else if surfaceFeedback === "pause"}
          <Pause size={38} fill="currentColor" aria-hidden="true" />
        {:else}
          <Play size={38} fill="currentColor" aria-hidden="true" />
        {/if}
      </div>
    {/if}

    {#if remotePlaybackNotice}
      <div class="remote-playback-notice" aria-live="polite">
        <span class="overlay-error" aria-hidden="true">!</span>
        <p>{remotePlaybackNotice}</p>
      </div>
    {/if}

    {#if statusOverlayState() !== "hidden"}
      <div class="player-status-overlay" aria-live="polite">
        {#if statusOverlayState() === "casting"}
          <p>Chromecast connected</p>
        {:else if statusOverlayState() === "error"}
          <span class="overlay-error" aria-hidden="true">!</span>
          <p>{playerOverlayMessage()}</p>
        {:else if statusOverlayState() === "busy"}
          <span class="overlay-spinner" aria-hidden="true"></span>
          <p>{playerOverlayMessage()}</p>
        {:else}
          <p>{playerOverlayMessage()}</p>
        {/if}
      </div>
    {/if}

    {#if controlsAreVisible()}
      <div
        class="player-controls"
        role="group"
        aria-label="Playback controls"
        onfocusin={handleControlsFocusIn}
        onfocusout={handleControlsFocusOut}
        onpointerenter={() => {
          playerControlsHovered = true;
          showControls();
        }}
        onpointerleave={() => {
          playerControlsHovered = false;
        }}
      >
        <div class="top-controls">
          {#if onClose}
            <button
              class="control-button"
              type="button"
              aria-label="Close player"
              onclick={onClose}
            >
              <X size={20} aria-hidden="true" />
            </button>
          {:else}
            <a class="control-button" href={data.item.backHref} aria-label="Back to title">
              <span aria-hidden="true">‹</span>
            </a>
          {/if}
          <div class="player-title">
            <p>Now playing</p>
            <h2>{data.item.title}</h2>
          </div>
          {#if castAvailable}
            <button
              class:active={castLaunchState === "connected"}
              class:error={castLaunchState === "error"}
              class="control-button"
              type="button"
              aria-label={castControlLabel(castLaunchState)}
              title={castControlLabel(castLaunchState)}
              onclick={castLaunchState === "connected" ? stopCastPlayback : castPlayback}
              disabled={castLaunchState === "connecting"}
            >
              <Cast size={20} aria-hidden="true" />
            </button>
          {/if}
          {#if airPlayButtonState().visible}
            <button
              class:active={airPlayButtonState().active}
              class="control-button"
              type="button"
              aria-label={airPlayButtonState().label}
              title={airPlayButtonState().label}
              onclick={showAirPlayTargetPicker}
              disabled={airPlayButtonState().disabled}
            >
              <Airplay size={20} aria-hidden="true" />
            </button>
          {/if}
        </div>

        <div class="bottom-controls">
          <input
            class="seek-slider"
            type="range"
            min="0"
            max={seekSliderMax()}
            step="0.1"
            value={displayedPlaybackSeconds()}
            aria-label="Playback position"
            aria-valuemin={seekSliderAriaValue().valueMin}
            aria-valuemax={seekSliderAriaValue().valueMax}
            aria-valuenow={seekSliderAriaValue().valueNow}
            aria-valuetext={seekSliderAriaValue().valueText}
            oninput={(event) => {
              seekPreviewSeconds = Number(event.currentTarget.value);
              showControls();
            }}
            onchange={(event) =>
              seekToPlaybackSeconds(Number(event.currentTarget.value))}
          />
          <div class="control-row">
            <div class="primary-controls">
              <button
                class="control-button primary-play"
                type="button"
                aria-label={playbackButtonState().label}
                onclick={() => void toggleLocalPlayback()}
              >
                {#if playbackButtonState().action === "pause"}
                  <Pause size={24} fill="currentColor" aria-hidden="true" />
                {:else}
                  <Play size={24} fill="currentColor" aria-hidden="true" />
                {/if}
              </button>
              <button
                class="control-button skip-button"
                type="button"
                aria-label="Skip backward 10 seconds"
                onclick={() => skipPlayback(-10)}
              >
                <Rewind size={20} aria-hidden="true" />
                <span>10</span>
              </button>
              <button
                class="control-button skip-button"
                type="button"
                aria-label="Skip forward 30 seconds"
                onclick={() => skipPlayback(30)}
              >
                <FastForward size={20} aria-hidden="true" />
                <span>30</span>
              </button>
              <span class="time-readout">
                {playbackTimeRangeText({
                  seconds: displayedPlaybackSeconds(),
                  durationSeconds,
                })}
              </span>
            </div>
            <div class="right-controls">
              <button
                class="control-button"
                type="button"
                aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
                onclick={toggleMute}
              >
                {#if muted || volume === 0}
                  <VolumeX size={20} aria-hidden="true" />
                {:else}
                  <Volume2 size={20} aria-hidden="true" />
                {/if}
              </button>
              <input
                class="volume-slider"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                style={`--volume-fill: ${(muted ? 0 : volume) * 100}%`}
                aria-label="Volume"
                aria-valuemin={volumeAriaValue().valueMin}
                aria-valuemax={volumeAriaValue().valueMax}
                aria-valuenow={volumeAriaValue().valueNow}
                aria-valuetext={volumeAriaValue().valueText}
                oninput={(event) => setVolume(Number(event.currentTarget.value))}
              />
              {#if data.playback.tracks.length > 0}
                <div class="subtitle-control">
                  <button
                    bind:this={subtitleToggleButton}
                    class:active={selectedSubtitleId !== "off"}
                    class="control-button"
                    type="button"
                    aria-label="Subtitles"
                    aria-expanded={subtitleMenuOpen}
                    aria-haspopup="menu"
                    aria-controls="player-subtitle-menu"
                    onclick={toggleSubtitleMenu}
                  >
                    <Captions size={20} aria-hidden="true" />
                  </button>
                  {#if subtitleMenuOpen}
                    <div
                      class="subtitle-menu"
                      bind:this={subtitleMenuElement}
                      id="player-subtitle-menu"
                      role="menu"
                      aria-label="Subtitle tracks"
                      tabindex="-1"
                      onkeydown={handleSubtitleMenuKeydown}
                    >
                      <button
                        class:active={selectedSubtitleId === "off"}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selectedSubtitleId === "off"}
                        onclick={() => void applySubtitleTrack("off", true)}
                      >
                        Off
                      </button>
                      {#each data.playback.tracks as track}
                        <button
                          class:active={selectedSubtitleId === track.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selectedSubtitleId === track.id}
                          onclick={() => void applySubtitleTrack(track.id, true)}
                        >
                          {track.label}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
              <button
                class="control-button"
                type="button"
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                onclick={() => void toggleFullscreen()}
              >
                {#if isFullscreen}
                  <Minimize size={20} aria-hidden="true" />
                {:else}
                  <Maximize size={20} aria-hidden="true" />
                {/if}
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <p class="sr-only" aria-live="polite">
    {#if saveState === "saving"}
      Saving progress
    {:else if saveState === "saved"}
      Progress saved
    {:else if saveState === "error"}
      Progress could not be saved
    {/if}
  </p>
{:else if data.playback.status === "preparing"}
  <PlayerShell
    title={data.item.title}
    busyLabel="Preparing playback"
    {onClose}
    backHref={onClose ? undefined : data.item.backHref}
  />
{:else}
  <section class="playback-message" aria-live="polite">
    <h2>Playback unavailable</h2>
    <p>{data.playback.message}</p>
  </section>
{/if}

<style>
  .video-shell {
    position: relative;
    overflow: hidden;
    border-radius: 8px;
    background: #000;
  }

  .custom-player {
    --player-accent: #00ccff;
    --player-accent-strong: #00ccff;
    --player-accent-hover: rgba(0, 204, 255, 0.14);
    --player-accent-hover-text: #00ccff;
    --player-accent-active: rgba(0, 204, 255, 0.2);
    --player-accent-active-text: #00ccff;
    outline: none;
    color: #f8fafc;
  }

  .custom-player:focus-visible {
    box-shadow: 0 0 0 2px rgba(0, 204, 255, 0.78);
  }

  video {
    width: 100%;
    max-height: min(72vh, calc(100dvh - 9rem));
    background: #000;
    display: block;
  }

  .video-tap-target {
    position: absolute;
    inset: 0;
    z-index: 1;
    border: 0;
    background: transparent;
    cursor: default;
    touch-action: manipulation;
  }

  .surface-feedback {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 4;
    width: 5rem;
    height: 5rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.48);
    color: #f8fafc;
    pointer-events: none;
    transform: translate(-50%, -50%);
    animation: surface-feedback 0.62s ease-out both;
  }

  .surface-feedback.seek-backward {
    left: 24%;
  }

  .surface-feedback.seek-forward {
    left: 76%;
  }

  .surface-feedback span {
    position: absolute;
    bottom: 0.85rem;
    font-size: 0.68rem;
    font-weight: 850;
    line-height: 1;
  }

  .player-status-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 0.75rem;
    padding: 1rem;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.12);
    color: #f8fafc;
    text-align: center;
  }

  .player-status-overlay p {
    margin: 0;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.58);
    padding: 0.45rem 0.75rem;
    font-size: 0.85rem;
    font-weight: 750;
  }

  .remote-playback-notice {
    position: absolute;
    left: 50%;
    top: 22%;
    z-index: 4;
    display: flex;
    max-width: min(30rem, calc(100% - 2rem));
    transform: translateX(-50%);
    align-items: center;
    gap: 0.55rem;
    border-radius: 999px;
    background: rgba(7, 10, 14, 0.78);
    padding: 0.55rem 0.75rem;
    color: #f8fafc;
    pointer-events: none;
    text-align: center;
    box-shadow: 0 0.5rem 1.8rem rgba(0, 0, 0, 0.28);
  }

  .remote-playback-notice p {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 0.82rem;
    font-weight: 750;
    line-height: 1.25;
  }

  .remote-playback-notice .overlay-error {
    width: 1.35rem;
    height: 1.35rem;
    flex: 0 0 auto;
    font-size: 0.9rem;
  }

  .player-controls {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    grid-template-rows: auto 1fr auto;
    pointer-events: none;
    background:
      linear-gradient(rgba(0, 0, 0, 0.56), rgba(0, 0, 0, 0) 34%),
      linear-gradient(0deg, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0) 42%);
  }

  .top-controls,
  .bottom-controls {
    pointer-events: auto;
  }

  .top-controls {
    grid-row: 1;
    min-height: 4.25rem;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .player-title {
    min-width: 0;
  }

  .player-title p,
  .player-title h2 {
    margin: 0;
  }

  .player-title p {
    color: rgba(248, 250, 252, 0.7);
    font-size: 0.72rem;
    font-weight: 750;
    text-transform: uppercase;
  }

  .player-title h2 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: clamp(0.98rem, 2.2vw, 1.2rem);
  }

  .bottom-controls {
    grid-row: 3;
    align-self: end;
    display: grid;
    gap: 0.5rem;
    padding: 0 0.9rem 0.8rem;
  }

  .control-row {
    min-height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .primary-controls {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .right-controls {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 0.45rem;
  }

  .control-button {
    width: 2.5rem;
    height: 2.5rem;
    display: inline-grid;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #f8fafc;
    cursor: pointer;
    padding: 0;
    text-decoration: none;
    touch-action: manipulation;
  }

  .control-button:hover:not(:disabled) {
    background: var(--player-accent-hover);
    color: var(--player-accent-hover-text);
  }

  .control-button.active {
    background: var(--player-accent-active);
    color: var(--player-accent-active-text);
  }

  .control-button:focus-visible,
  .seek-slider:focus-visible,
  .volume-slider:focus-visible,
  .subtitle-menu button:focus-visible {
    outline: 2px solid var(--player-accent-strong);
    outline-offset: 2px;
  }

  .control-button.error {
    background: rgba(127, 29, 29, 0.7);
  }

  .control-button:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .primary-play {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 999px;
    background: rgba(8, 12, 16, 0.58);
  }

  .skip-button {
    position: relative;
    width: 2.75rem;
    height: 2.75rem;
    align-content: center;
    gap: 0.02rem;
    border-radius: 999px;
    background: rgba(8, 12, 16, 0.38);
    padding-top: 0.25rem;
  }

  .skip-button span {
    display: block;
    font-size: 0.62rem;
    font-weight: 850;
    line-height: 1;
  }

  .seek-slider,
  .volume-slider {
    width: 100%;
    min-height: 0;
    border: 0;
    border-radius: 0;
    padding: 0;
  }

  .seek-slider {
    height: 1.5rem;
    accent-color: var(--player-accent);
    cursor: pointer;
    touch-action: none;
  }

  .volume-slider {
    width: 6rem;
    height: 1.25rem;
    appearance: none;
    background: transparent;
    cursor: pointer;
    touch-action: none;
  }

  .volume-slider::-webkit-slider-runnable-track {
    height: 0.25rem;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--player-accent-strong) 0 var(--volume-fill, 100%),
      rgba(248, 250, 252, 0.34) var(--volume-fill, 100%) 100%
    );
  }

  .volume-slider::-webkit-slider-thumb {
    width: 0.8rem;
    height: 0.8rem;
    margin-top: -0.275rem;
    appearance: none;
    border-radius: 999px;
    background: var(--player-accent-strong);
    box-shadow: 0 0 0 1px rgba(8, 12, 16, 0.5);
  }

  .volume-slider::-moz-range-track {
    height: 0.25rem;
    border-radius: 999px;
    background: rgba(248, 250, 252, 0.34);
  }

  .volume-slider::-moz-range-progress {
    height: 0.25rem;
    border-radius: 999px;
    background: var(--player-accent-strong);
  }

  .volume-slider::-moz-range-thumb {
    width: 0.8rem;
    height: 0.8rem;
    border: 0;
    border-radius: 999px;
    background: var(--player-accent-strong);
    box-shadow: 0 0 0 1px rgba(8, 12, 16, 0.5);
  }

  .time-readout {
    min-width: 7.5rem;
    color: rgba(248, 250, 252, 0.82);
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .subtitle-control {
    position: relative;
  }

  .subtitle-menu {
    position: absolute;
    right: 0;
    bottom: calc(100% + 0.55rem);
    min-width: 11rem;
    max-width: min(18rem, calc(100vw - 2rem));
    display: grid;
    gap: 0.25rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    background: rgba(8, 12, 16, 0.94);
    padding: 0.35rem;
    box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.36);
  }

  .subtitle-menu button {
    min-height: 2.15rem;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #f8fafc;
    cursor: pointer;
    padding: 0.4rem 0.55rem;
    text-align: left;
  }

  .subtitle-menu button:hover {
    background: var(--player-accent-hover);
    color: var(--player-accent-hover-text);
  }

  .subtitle-menu button.active {
    background: var(--player-accent-active);
    color: var(--player-accent-active-text);
  }

  .custom-player.controls-hidden {
    cursor: none;
  }

  .overlay-spinner {
    width: 3rem;
    height: 3rem;
    border: 3px solid rgba(255, 255, 255, 0.28);
    border-top-color: #fff;
    border-radius: 999px;
    animation: spin 0.85s linear infinite;
  }

  .overlay-error {
    width: 3rem;
    height: 3rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: rgba(185, 28, 28, 0.88);
    color: #fff;
    font-size: 1.6rem;
    font-weight: 900;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes surface-feedback {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.82);
    }
    18% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(1.18);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay-spinner,
    .surface-feedback {
      animation: none;
    }
  }

  .playback-message {
    display: grid;
    gap: 0.35rem;
    border: 1px solid rgba(255, 217, 154, 0.16);
    border-radius: 8px;
    background: rgba(255, 217, 154, 0.06);
    padding: 1rem;
  }

  .playback-message h2,
  .playback-message p {
    margin: 0;
  }

  .playback-message h2 {
    font-size: 1.05rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    clip-path: inset(50%);
  }

  @media (max-width: 640px) {
    .top-controls {
      min-height: 3.5rem;
      padding: 0.55rem;
    }

    .player-title p {
      display: none;
    }

    .player-title h2 {
      font-size: 0.95rem;
    }

    .control-button {
      width: 2.75rem;
      height: 2.75rem;
    }

    .bottom-controls {
      gap: 0.35rem;
      padding: 0 0.65rem 0.65rem;
    }

    .control-row {
      min-height: auto;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.45rem;
    }

    .primary-controls {
      flex: 1 1 auto;
      gap: 0.25rem;
    }

    .right-controls {
      margin-left: auto;
      gap: 0.25rem;
    }

    .volume-slider {
      display: none;
    }

    .time-readout {
      min-width: 6.6rem;
      font-size: 0.76rem;
    }
  }

  @media (max-width: 420px) {
    .player-title {
      display: none;
    }

    .primary-play {
      width: 2.6rem;
      height: 2.6rem;
    }

    .skip-button {
      width: 2.6rem;
      height: 2.6rem;
    }
  }
</style>
