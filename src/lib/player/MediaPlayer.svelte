<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, tick } from "svelte";
  import PlayerShell from "$lib/player/PlayerShell.svelte";
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
    SkipForward,
    Volume2,
    VolumeX,
    X,
  } from "@lucide/svelte";
  import { createMediaPlayerCast } from "$lib/player/media-player-cast.svelte";
  import { createMediaPlayerHls } from "$lib/player/media-player-hls.svelte";
  import { createMediaPlayerSegments } from "$lib/player/media-player-segments.svelte";
  import { createMediaPlayerSession } from "$lib/player/media-player-session.svelte";
  import {
    airPlayActiveFromVideo,
    airPlayAvailableFromEvent,
    airPlayControlState,
    airPlayTargetPickerAction,
    castControlLabel,
    clampPlaybackSeconds,
    defaultSubtitleTrackId,
    fullscreenAction,
    hasAirPlayPicker,
    mediaTimelineSeconds,
    nextControlsActivityTick,
    nextSubtitleMenuOptionIndex,
    playerKeyboardShortcuts,
    playbackSliderAriaValue,
    playbackSeekAction,
    playbackTimeRangeText,
    playerSurfaceClickAction,
    playerSurfaceDoubleClickIntent,
    playerSurfaceSingleClickIntent,
    playerStatusOverlayState,
    primaryPlaybackButtonState,
    shouldAutoHideControls,
    shouldCloseSubtitleMenuOnPlayerKeydown,
    shouldHandlePlayerShortcut,
    shouldShowCustomControls,
    shouldSyncTimelineUiNow,
    subtitleTextTrackMode,
    volumeSliderAriaValue,
    volumeStateForMuteToggle,
    volumeStateForSliderValue,
  } from "$lib/playback/controls";
  import type { PlaybackData } from "$lib/server/playback";

  type PlayerUiState = "starting" | "playing" | "paused" | "buffering" | "seeking" | "autoplayBlocked" | "error";

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
  const SURFACE_SINGLE_CLICK_DELAY_MS = 300;
  const CONTROLS_AUTO_HIDE_MS = 3500;

  let {
    data,
    onClose,
    onProgressSaved,
    onReload,
    onReposition,
    persistProgress = true,
  }: {
    data: PlaybackData;
    onClose?: () => void;
    onProgressSaved: () => void;
    onReload: () => void;
    onReposition: (href: string) => void;
    persistProgress?: boolean;
  } = $props();

  function playbackDurationSeconds(sourceData: PlaybackData = data) {
    const fileDurationSeconds = Number(sourceData.playback.file.duration_seconds);
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
  let playerUiState = $state<PlayerUiState>("starting");
  let hasStartedPlayback = $state(false);
  let playerControlsVisible = $state(true);
  let playerControlsFocused = $state(false);
  let playerControlsHovered = $state(false);
  let surfaceFeedback = $state<SurfaceFeedback | null>(null);
  let surfaceFeedbackTimeout: number | null = null;
  let surfaceSingleClickTimeout: number | null = null;
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
  let airPlayAvailable = $state(false);
  let airPlayActive = $state(false);
  let signedPlaybackNotice = $state<string | null>(null);
  let playbackErrorDetail = $state<string | null>(null);
  let signedPlaybackNoticeTimeout: number | null = null;
  let screenWakeLock: ScreenWakeLockSentinel | null = null;
  let screenWakeLockRequest: Promise<void> | null = null;
  let hasPlaybackActivity = false;
  let timelinePlaybackSeconds = 0;
  let timelineDurationSeconds: number | null = null;
  let lastTimelineUiSyncAt = 0;
  let lastPointerControlsRefreshAt = -Infinity;
  const castHolder: { api?: ReturnType<typeof createMediaPlayerCast> } = {};

  function setPlaybackErrorDetail(message: string | null) {
    const trimmed = message?.trim() ?? "";
    playbackErrorDetail = trimmed.length > 0 ? trimmed : null;
  }

  function clearSignedPlaybackNotice() {
    signedPlaybackNotice = null;
    if (signedPlaybackNoticeTimeout !== null) {
      window.clearTimeout(signedPlaybackNoticeTimeout);
      signedPlaybackNoticeTimeout = null;
    }
  }

  function showSignedPlaybackNotice(message: string) {
    signedPlaybackNotice = message;
    if (signedPlaybackNoticeTimeout !== null) {
      window.clearTimeout(signedPlaybackNoticeTimeout);
    }
    signedPlaybackNoticeTimeout = window.setTimeout(() => {
      signedPlaybackNotice = null;
      signedPlaybackNoticeTimeout = null;
    }, 5000);
    showControls();
  }

  function shouldHoldScreenWakeLock() {
    return (
      browser &&
      document.visibilityState === "visible" &&
      Boolean(video) &&
      !castHolder.api?.isCasting() &&
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
    if (!shouldHoldScreenWakeLock() || screenWakeLock || screenWakeLockRequest) return;
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
        // Wake Lock is best-effort. Unsupported or denied requests keep normal playback.
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

  function syncAirPlayActiveState() {
    const safariVideo = video as SafariVideoElement | undefined;
    airPlayActive = airPlayActiveFromVideo({
      currentPlaybackTargetIsWireless: safariVideo?.webkitCurrentPlaybackTargetIsWireless,
    });
  }

  function ensureAirPlayPlaybackSource() {
    const player = video;
    const streamUrl = data.playback.streamUrl;
    if (!player || data.playback.status !== "ready" || !streamUrl) return false;

    clearSignedPlaybackNotice();
    if (player.currentSrc !== streamUrl && player.src !== streamUrl) {
      player.src = streamUrl;
    }
    void applySubtitleTrack(selectedSubtitleId);
    return true;
  }

  function showAirPlayTargetPicker() {
    if (castHolder.api?.switchPlaybackTarget("airplay")) return;

    const player = video as SafariVideoElement | undefined;
    const picker = player?.webkitShowPlaybackTargetPicker;
    if (
      airPlayTargetPickerAction({
        available: airPlayAvailable,
        showPlaybackTargetPicker: picker,
      }) !== "show-picker"
    )
      return;

    if (!ensureAirPlayPlaybackSource()) {
      showSignedPlaybackNotice("AirPlay playback is not ready yet.");
      return;
    }
    picker?.call(player);
    showControls();
  }

  function displayedPlaybackSeconds() {
    return seekPreviewSeconds ?? currentPlaybackSeconds;
  }

  function seekSliderMax() {
    return Math.max(1, Math.ceil(durationSeconds ?? currentPlaybackSeconds ?? 1));
  }

  function showControls() {
    playerControlsVisible = true;
    currentPlaybackSeconds = timelinePlaybackSeconds;
    durationSeconds = timelineDurationSeconds;
    lastTimelineUiSyncAt = browser ? window.performance.now() : 0;
    playerControlsActivityTick = nextControlsActivityTick(playerControlsActivityTick);
  }

  function handlePlayerPointerMove() {
    if (customControlsVisible) {
      const now = window.performance.now();
      if (playerControlsVisible && now - lastPointerControlsRefreshAt < POINTER_CONTROLS_REFRESH_INTERVAL_MS) {
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
      nextTarget instanceof Node && currentTarget instanceof HTMLElement && currentTarget.contains(nextTarget),
    );
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

  function clearSurfaceSingleClickTimeout() {
    if (surfaceSingleClickTimeout !== null) {
      window.clearTimeout(surfaceSingleClickTimeout);
      surfaceSingleClickTimeout = null;
    }
  }

  function applySurfaceControl(event: MouseEvent) {
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
      showSurfaceFeedback(playbackButtonState.action);
      void toggleLocalPlayback();
    }
  }

  function handleSurfaceClick(event: MouseEvent) {
    const intent = playerSurfaceSingleClickIntent({
      controlsVisible: customControlsVisible,
      subtitleMenuOpen,
    });
    if (intent === "close-subtitle-menu") {
      void closeSubtitleMenu();
      return;
    }
    if (intent === "surface-control") {
      applySurfaceControl(event);
      return;
    }
    clearSurfaceSingleClickTimeout();
    surfaceSingleClickTimeout = window.setTimeout(() => {
      surfaceSingleClickTimeout = null;
      showControls();
    }, SURFACE_SINGLE_CLICK_DELAY_MS);
  }

  function handleSurfaceDoubleClick(event: MouseEvent) {
    clearSurfaceSingleClickTimeout();
    const intent = playerSurfaceDoubleClickIntent({
      controlsVisible: customControlsVisible,
      subtitleMenuOpen,
    });
    if (intent === "surface-control") {
      applySurfaceControl(event);
    }
  }

  function focusPlayerShell() {
    playerShell?.focus({ preventScroll: true });
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
      default:
        return "Starting playback";
    }
  }

  async function playFromOverlay() {
    if (!video) return;
    showControls();
    if (switchToWebPlaybackTarget()) return;
    playerUiState = "starting";
    setPlaybackErrorDetail(null);
    try {
      await video.play();
      hasPlaybackActivity = true;
      hasStartedPlayback = true;
      playerUiState = "playing";
    } catch {
      playerUiState = "autoplayBlocked";
    }
  }

  function updateTimelineFromVideo(sourceData: PlaybackData = data) {
    if (!video) return;
    const duration = playbackDurationSeconds(sourceData);
    timelinePlaybackSeconds = clampPlaybackSeconds({
      seconds: mediaTimelineSeconds({
        relativeSeconds: Number.isFinite(video.currentTime) ? video.currentTime : 0,
        streamStartSeconds: sourceData.playback.streamStartSeconds,
      }),
      durationSeconds: duration,
    });
    timelineDurationSeconds = duration;
    // Keep playhead reactive for overlays (e.g. skip intro) even when controls auto-hide.
    currentPlaybackSeconds = timelinePlaybackSeconds;
    if (
      shouldSyncTimelineUiNow({
        controlsBarVisible: customControlsVisible,
        seeking: playerUiState === "seeking",
        scrubbing: seekPreviewSeconds !== null,
        lastSyncAtMs: lastTimelineUiSyncAt,
        nowMs: browser ? window.performance.now() : 0,
      })
    ) {
      durationSeconds = timelineDurationSeconds;
      lastTimelineUiSyncAt = browser ? window.performance.now() : 0;
    }
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
        const candidate = data.playback.tracks.find((track) => track.id === trackElement.dataset.trackId);
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
      subtitleMenuElement?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]') ??
      subtitleMenuElement?.querySelector<HTMLButtonElement>('[role="menuitemradio"]');
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

  const session = createMediaPlayerSession({
    getData: () => data,
    getVideo: () => video,
    isCasting: () => castHolder.api?.isCasting() ?? false,
    getCurrentPlaybackSeconds: () => seekPreviewSeconds ?? timelinePlaybackSeconds,
    getDurationSeconds: () => timelineDurationSeconds ?? durationSeconds,
    getHasPlaybackActivity: () => hasPlaybackActivity,
    setHasPlaybackActivity: (value) => {
      hasPlaybackActivity = value;
    },
    playbackIsCastOwned: (playback) => castHolder.api?.playbackIsCastOwned(playback) ?? false,
    onProgressSaved: () => onProgressSaved(),
    onReload: () => onReload(),
    persistProgress: () => persistProgress,
  });

  function currentPlaybackTargetSeconds() {
    const payload = session.progressPayload(data, false);
    if (payload) return payload.positionSeconds;
    const displayedSeconds = seekPreviewSeconds ?? timelinePlaybackSeconds;
    if (Number.isFinite(displayedSeconds)) return displayedSeconds;
    return Number.isFinite(data.startSeconds) ? data.startSeconds : 0;
  }

  const cast = createMediaPlayerCast({
    getData: () => data,
    getVideo: () => video,
    getPlayerUiState: () => playerUiState,
    setPlayerUiState: (state) => {
      playerUiState = state;
      if (state === "playing") setPlaybackErrorDetail(null);
    },
    getCurrentPlaybackSeconds: () => seekPreviewSeconds ?? timelinePlaybackSeconds,
    setCurrentPlaybackSeconds: (seconds) => {
      timelinePlaybackSeconds = seconds;
      currentPlaybackSeconds = seconds;
    },
    getDurationSeconds: () => timelineDurationSeconds ?? durationSeconds,
    setDurationSeconds: (seconds) => {
      timelineDurationSeconds = seconds;
      durationSeconds = seconds;
    },
    setHasPlaybackActivity: (value) => {
      hasPlaybackActivity = value;
    },
    getPlaybackTargetStartSeconds: () => currentPlaybackTargetSeconds(),
    showControls,
    showSignedPlaybackNotice,
    clearSignedPlaybackNotice,
    progressPayload: session.progressPayload,
    flushProgress: session.flushProgress,
    cancelPlaybackSession: session.cancelPlaybackSession,
    onReposition: (href) => onReposition(href),
    getPlaybackButtonAction: () => primaryPlaybackButtonState({ uiState: playerUiState }).action,
  });
  castHolder.api = cast;
  const customControlsVisible = $derived(
    shouldShowCustomControls({
      controlsVisible: playerControlsVisible,
      uiState: playerUiState,
      casting: cast.isCasting(),
      subtitleMenuOpen,
      controlsFocused: playerControlsFocused,
      controlsHovered: playerControlsHovered,
    }),
  );

  const hls = createMediaPlayerHls({
    getData: () => data,
    getVideo: () => video,
    getPlayerUiState: () => playerUiState,
    setPlayerUiState: (state) => {
      playerUiState = state;
      if (state === "playing") setPlaybackErrorDetail(null);
    },
    getCurrentPlaybackSeconds: () => seekPreviewSeconds ?? timelinePlaybackSeconds,
    setCurrentPlaybackSeconds: (seconds) => {
      timelinePlaybackSeconds = seconds;
      currentPlaybackSeconds = seconds;
    },
    getDurationSeconds: () => timelineDurationSeconds ?? durationSeconds,
    setDurationSeconds: (seconds) => {
      timelineDurationSeconds = seconds;
      durationSeconds = seconds;
    },
    getSeekPreviewSeconds: () => seekPreviewSeconds,
    setSeekPreviewSeconds: (seconds) => {
      seekPreviewSeconds = seconds;
    },
    getHasPlaybackActivity: () => hasPlaybackActivity,
    setHasPlaybackActivity: (value) => {
      hasPlaybackActivity = value;
    },
    getHasStartedPlayback: () => hasStartedPlayback,
    setHasStartedPlayback: (value) => {
      hasStartedPlayback = value;
    },
    getSaveState: () => session.saveState,
    setSaveState: session.setSaveState,
    getPlayerControlsVisible: () => playerControlsVisible,
    setPlayerControlsVisible: (visible) => {
      playerControlsVisible = visible;
    },
    setPlayerControlsFocused: (focused) => {
      playerControlsFocused = focused;
    },
    setPlayerControlsHovered: (hovered) => {
      playerControlsHovered = hovered;
    },
    getSelectedSubtitleId: () => selectedSubtitleId,
    setSelectedSubtitleId: (id) => {
      selectedSubtitleId = id;
    },
    getSubtitleMenuOpen: () => subtitleMenuOpen,
    setSubtitleMenuOpen: (open) => {
      subtitleMenuOpen = open;
    },
    getVolume: () => volume,
    getMuted: () => muted,
    castControlsPlayback: () => cast.castControlsPlayback(),
    playbackDurationSeconds,
    updateTimelineFromVideo,
    applyVideoVolume,
    syncDefaultSubtitleTrack,
    showControls,
    flushProgress: session.flushProgress,
    cancelPlaybackSession: session.cancelPlaybackSession,
    save: session.save,
    onReload: () => onReload(),
    onReposition: (href) => onReposition(href),
    setPlaybackErrorDetail,
  });

  const saveState = $derived(session.saveState);
  const castAvailable = $derived(cast.castAvailable);
  const castLaunchState = $derived(cast.castLaunchState);
  const playerStatusState = $derived(
    playerStatusOverlayState({
      uiState: playerUiState,
      casting: cast.isCasting(),
    }),
  );
  const volumeAria = $derived(volumeSliderAriaValue({ volume, muted }));
  const airPlayButton = $derived(
    airPlayControlState({
      available: airPlayAvailable,
      active: airPlayActive,
      casting: cast.isCasting(),
    }),
  );
  const playbackButtonState = $derived(primaryPlaybackButtonState({ uiState: playerUiState }));

  async function toggleLocalPlayback() {
    if (!video) return;
    showControls();
    if (castLaunchState === "connecting") return;
    session.heartbeatPlaybackSession(data.playback);
    if (cast.isCasting()) {
      playerUiState = cast.castUiStateAfterPlaybackCommand();
      return;
    }
    if (video.paused || video.ended) {
      await playFromOverlay();
    } else {
      video.pause();
      playerUiState = "paused";
    }
  }

  function switchToWebPlaybackTarget() {
    if (cast.isCasting() || airPlayActive) return false;
    return cast.switchPlaybackTarget("web");
  }

  function seekToPlaybackSeconds(targetSeconds: number) {
    seekPreviewSeconds = null;
    if (castLaunchState === "connecting") return;
    session.heartbeatPlaybackSession(data.playback);
    const action = playbackSeekAction({
      casting: cast.isCasting(),
      mode: data.playback.mode,
      targetSeconds,
      durationSeconds,
      streamStartSeconds: data.playback.streamStartSeconds,
    });
    showControls();

    if (action.kind === "cast") {
      const seconds = cast.castPlaybackSecondsAfterSeekAction(action.targetSeconds);
      timelinePlaybackSeconds = seconds;
      currentPlaybackSeconds = seconds;
      return;
    }

    if (!video) return;
    timelinePlaybackSeconds = action.targetSeconds;
    currentPlaybackSeconds = action.targetSeconds;
    hasPlaybackActivity = true;
    if (action.kind === "hls-reposition") {
      hls.repositionPlaybackTo(action.targetSeconds);
      return;
    }

    playerUiState = "seeking";
    video.currentTime = action.elementSeconds;
  }

  function skipPlayback(deltaSeconds: number) {
    seekToPlaybackSeconds(displayedPlaybackSeconds() + deltaSeconds);
  }

  const segments = createMediaPlayerSegments({
    getData: () => data,
    getDisplayedPlaybackSeconds: displayedPlaybackSeconds,
    getDurationSeconds: () => durationSeconds,
    getVideo: () => video,
    isCasting: () => cast.isCasting(),
    getCastLaunchState: () => castLaunchState,
    seekToPlaybackSeconds,
  });

  async function toggleFullscreen() {
    if (!browser || !playerShell) return;
    const safariVideo = video as SafariVideoElement | undefined;
    const enterVideoFullscreen = safariVideo?.webkitEnterFullscreen ?? safariVideo?.webkitEnterFullScreen;
    const videoFullscreen = Boolean(
      safariVideo?.webkitDisplayingFullscreen || (isFullscreen && document.fullscreenElement === null),
    );
    const action = fullscreenAction({
      documentFullscreen: document.fullscreenElement !== null,
      canExitDocumentFullscreen: typeof document.exitFullscreen === "function",
      canRequestDocumentFullscreen: typeof playerShell.requestFullscreen === "function",
      canEnterVideoFullscreen: typeof enterVideoFullscreen === "function",
      videoFullscreen,
      canExitVideoFullscreen: typeof safariVideo?.webkitExitFullscreen === "function",
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
      subtitleMenuElement?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [],
    );
    if (options.length === 0) return;
    const currentIndex = current instanceof HTMLButtonElement ? options.indexOf(current) : -1;
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

  hls.runPlaybackEffect();
  cast.runCastFrameworkEffect();
  session.runHeartbeatEffect();
  session.runCleanupEffect();
  segments.runSegmentEffects();

  $effect(() => {
    if (!browser) return;
    const controlsActivityTick = playerControlsActivityTick;
    void controlsActivityTick;
    if (
      shouldAutoHideControls({
        uiState: playerUiState,
        controlsVisible: playerControlsVisible,
        casting: cast.isCasting(),
        subtitleMenuOpen,
        controlsFocused: playerControlsFocused,
        controlsHovered: playerControlsHovered,
      })
    ) {
      const timeout = window.setTimeout(() => {
        playerControlsVisible = false;
      }, CONTROLS_AUTO_HIDE_MS);
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
      safariVideo.removeEventListener("webkitbeginfullscreen", onBeginFullscreen);
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

    safariVideo.addEventListener("webkitplaybacktargetavailabilitychanged", onAvailabilityChanged);
    safariVideo.addEventListener("webkitcurrentplaybacktargetiswirelesschanged", onWirelessChanged);
    return () => {
      safariVideo.removeEventListener("webkitplaybacktargetavailabilitychanged", onAvailabilityChanged);
      safariVideo.removeEventListener("webkitcurrentplaybacktargetiswirelesschanged", onWirelessChanged);
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

  onDestroy(() => {
    if (surfaceFeedbackTimeout !== null) {
      window.clearTimeout(surfaceFeedbackTimeout);
      surfaceFeedbackTimeout = null;
    }
    clearSurfaceSingleClickTimeout();
    clearSignedPlaybackNotice();
    segments.destroy();
    releaseScreenWakeLock();
    session.flushProgress(data);
    cast.destroy();
    session.cancelPlaybackSession(data.playback);
  });
</script>

{#if data.playback.status === "ready" && data.playback.streamUrl}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={playerShell}
    class:controls-hidden={!customControlsVisible}
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
    <video
      bind:this={video}
      playsinline
      preload={data.playback.mode === "direct" ? "metadata" : "auto"}
      onplay={() => (hasPlaybackActivity = true)}
      onpause={() => session.save(false)}
    >
      {#each data.playback.tracks as track (track.id)}
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

    <div
      class="video-tap-target"
      aria-hidden="true"
      onpointerdown={focusPlayerShell}
      onclick={handleSurfaceClick}
      ondblclick={handleSurfaceDoubleClick}
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

    {#if signedPlaybackNotice}
      <div class="signed-playback-notice" aria-live="polite">
        <span class="overlay-error" aria-hidden="true">!</span>
        <p>{signedPlaybackNotice}</p>
      </div>
    {/if}

    {#if segments.activeSegment && !data.segmentSkip.automatic}
      <div class="skip-segment-prompt">
        <button
          class="skip-segment-button"
          type="button"
          aria-label={segments.activeSegment.label}
          onclick={segments.skipActiveSegment}
        >
          <SkipForward size={16} strokeWidth={2.25} aria-hidden="true" />
          <span>{segments.activeSegment.label}</span>
        </button>
      </div>
    {:else if segments.autoSkipNotice}
      <div class="skip-segment-prompt" aria-live="polite">
        <div class="skip-segment-notice">
          <SkipForward size={16} strokeWidth={2.25} aria-hidden="true" />
          <span>{segments.autoSkipNotice}</span>
        </div>
      </div>
    {/if}

    {#if playerStatusState !== "hidden"}
      <div class="player-status-overlay" aria-live="polite">
        {#if playerStatusState === "casting"}
          <p>Chromecast connected</p>
        {:else if playerStatusState === "error"}
          <span class="overlay-error" aria-hidden="true">!</span>
          <p>Playback error</p>
          {#if playbackErrorDetail}
            <p class="overlay-detail">{playbackErrorDetail}</p>
          {/if}
        {:else if playerStatusState === "busy"}
          <span class="overlay-spinner" aria-hidden="true"></span>
          <p>{playerOverlayMessage()}</p>
          {#if playbackErrorDetail}
            <p class="overlay-detail">{playbackErrorDetail}</p>
          {/if}
        {:else}
          <p>{playerOverlayMessage()}</p>
        {/if}
      </div>
    {/if}

    {#if customControlsVisible}
      {@const seekSliderAria = playbackSliderAriaValue({
        seconds: displayedPlaybackSeconds(),
        durationSeconds,
      })}
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
            <button class="control-button" type="button" aria-label="Close player" onclick={onClose}>
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
              onclick={castLaunchState === "connected" ? cast.stopCastPlayback : cast.castPlayback}
              disabled={castLaunchState === "connecting"}
            >
              <Cast size={20} aria-hidden="true" />
            </button>
          {/if}
          {#if airPlayButton.visible}
            <button
              class:active={airPlayButton.active}
              class="control-button"
              type="button"
              aria-label={airPlayButton.label}
              title={airPlayButton.label}
              onclick={showAirPlayTargetPicker}
              disabled={airPlayButton.disabled}
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
            aria-valuemin={seekSliderAria.valueMin}
            aria-valuemax={seekSliderAria.valueMax}
            aria-valuenow={seekSliderAria.valueNow}
            aria-valuetext={seekSliderAria.valueText}
            oninput={(event) => {
              seekPreviewSeconds = Number(event.currentTarget.value);
              showControls();
            }}
            onchange={(event) => seekToPlaybackSeconds(Number(event.currentTarget.value))}
          />
          <div class="control-row">
            <div class="primary-controls">
              <button
                class="control-button primary-play"
                type="button"
                aria-label={playbackButtonState.label}
                onclick={() => void toggleLocalPlayback()}
              >
                {#if playbackButtonState.action === "pause"}
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
                aria-valuemin={volumeAria.valueMin}
                aria-valuemax={volumeAria.valueMax}
                aria-valuenow={volumeAria.valueNow}
                aria-valuetext={volumeAria.valueText}
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
                      {#each data.playback.tracks as track (track.id)}
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
    aspect-ratio: 16 / 9;
    max-height: min(72vh, calc(100dvh - 9rem));
    overflow: hidden;
    border-radius: 8px;
    background: #000;
  }

  .custom-player {
    --color-text: #f8fafc;
    --color-text-soft: rgba(248, 250, 252, 0.82);
    --color-border-strong: rgba(255, 255, 255, 0.18);
    --player-border-subtle: rgba(255, 255, 255, 0.28);
    --player-focus-ring: rgba(255, 255, 255, 0.75);
    --player-accent: #f8fafc;
    --player-accent-strong: #f8fafc;
    --player-accent-hover: rgba(255, 255, 255, 0.12);
    --player-accent-hover-text: #f8fafc;
    --player-accent-active: rgba(255, 255, 255, 0.18);
    --player-accent-active-text: #f8fafc;
    outline: none;
    color: var(--color-text);
  }

  .custom-player:focus-visible {
    box-shadow: 0 0 0 2px var(--player-focus-ring);
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
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
    user-select: none;
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
    color: var(--color-text);
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
    color: var(--color-text);
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

  .player-status-overlay .overlay-detail {
    max-width: 28rem;
    border-radius: 0.75rem;
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.35;
    color: rgba(248, 250, 252, 0.88);
    white-space: normal;
  }

  .signed-playback-notice {
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
    color: var(--color-text);
    pointer-events: none;
    text-align: center;
    box-shadow: 0 0.5rem 1.8rem rgba(0, 0, 0, 0.28);
  }

  .signed-playback-notice p {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 0.82rem;
    font-weight: 750;
    line-height: 1.25;
  }

  .signed-playback-notice .overlay-error {
    width: 1.35rem;
    height: 1.35rem;
    flex: 0 0 auto;
    font-size: 0.9rem;
  }

  .skip-segment-prompt {
    position: absolute;
    right: 1.25rem;
    /* Fixed above the bottom control chrome (seek + transport), whether controls are visible or not. */
    bottom: calc(7.75rem + env(safe-area-inset-bottom, 0px));
    z-index: 4;
    pointer-events: auto;
  }

  .skip-segment-button {
    min-height: 2.65rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.55rem 1.35rem;
    border: 2px solid rgba(255, 255, 255, 0.92);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.58);
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.08),
      0 0 14px rgba(255, 255, 255, 0.12),
      0 0.35rem 1rem rgba(0, 0, 0, 0.35);
    touch-action: manipulation;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .skip-segment-button:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.72);
    border-color: #fff;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.16),
      0 0 18px rgba(255, 255, 255, 0.2),
      0 0.35rem 1rem rgba(0, 0, 0, 0.4);
  }

  .skip-segment-button:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 3px;
  }

  .skip-segment-button span {
    line-height: 1;
  }

  .skip-segment-notice {
    min-height: 2.65rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.55rem 1.35rem;
    border: 2px solid rgba(255, 255, 255, 0.72);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.62);
    color: #fff;
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.08),
      0 0 14px rgba(255, 255, 255, 0.12),
      0 0.35rem 1rem rgba(0, 0, 0, 0.35);
    animation: skip-segment-notice-in 180ms ease;
    pointer-events: none;
  }

  @keyframes skip-segment-notice-in {
    from {
      opacity: 0;
      transform: translateY(0.35rem);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .player-controls {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    grid-template-rows: auto 1fr auto;
    pointer-events: none;
    background:
      linear-gradient(rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0) 42%),
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
    color: var(--color-text);
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
    border: 1px solid var(--color-border-strong);
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
    color: var(--color-text);
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
    border: 3px solid var(--player-border-subtle);
    border-top-color: var(--color-text);
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
    color: var(--color-text);
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
    border: 1px solid var(--color-warning-border);
    border-radius: 8px;
    background: var(--color-warning-soft);
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

    .skip-segment-prompt {
      right: 1rem;
      bottom: calc(9rem + env(safe-area-inset-bottom, 0px));
    }

    .skip-segment-button {
      min-height: 2.75rem;
      padding: 0.55rem 1.15rem;
      font-size: 0.84rem;
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
