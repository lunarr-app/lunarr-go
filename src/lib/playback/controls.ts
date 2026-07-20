import { absolutePlaybackSeconds, streamRelativePlaybackSeconds } from "./seek";

export type PlayerControlUiState =
  "starting" | "playing" | "paused" | "buffering" | "seeking" | "autoplayBlocked" | "error";

export function formatPlaybackTime(seconds: number | null | undefined) {
  const totalSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(Number(seconds))) : 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function clampPlaybackSeconds(input: { seconds: number; durationSeconds: number | null }) {
  const seconds = Number.isFinite(input.seconds) ? Number(input.seconds) : 0;
  const durationSeconds =
    Number.isFinite(input.durationSeconds) && Number(input.durationSeconds) > 0 ? Number(input.durationSeconds) : null;
  if (durationSeconds === null) return Math.max(0, seconds);
  return Math.min(Math.max(0, seconds), durationSeconds);
}

function normalizedDurationSeconds(durationSeconds: number | null | undefined) {
  return Number.isFinite(durationSeconds) && Number(durationSeconds) > 0 ? Number(durationSeconds) : null;
}

export function playbackTimeRangeText(input: { seconds: number; durationSeconds: number | null }) {
  const durationSeconds = normalizedDurationSeconds(input.durationSeconds);
  const seconds = clampPlaybackSeconds({
    seconds: input.seconds,
    durationSeconds,
  });
  if (durationSeconds === null) return `${formatPlaybackTime(seconds)} / --:--`;
  return `${formatPlaybackTime(seconds)} / ${formatPlaybackTime(durationSeconds)}`;
}

export function playbackSliderAriaValue(input: { seconds: number; durationSeconds: number | null }) {
  const durationSeconds = normalizedDurationSeconds(input.durationSeconds);
  const seconds = clampPlaybackSeconds({
    seconds: input.seconds,
    durationSeconds,
  });
  return {
    valueMin: 0,
    valueMax: Math.max(1, Math.ceil(durationSeconds ?? seconds ?? 1)),
    valueNow: Math.round(seconds),
    valueText:
      durationSeconds === null
        ? `${formatPlaybackTime(seconds)} elapsed`
        : `${formatPlaybackTime(seconds)} of ${formatPlaybackTime(durationSeconds)}`,
  };
}

export type PlaybackVolumeState = {
  volume: number;
  muted: boolean;
};

function clampVolumeLevel(value: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 1;
}

export function volumeStateForSliderValue(value: number): PlaybackVolumeState {
  const volume = clampVolumeLevel(value);
  return {
    volume,
    muted: volume === 0,
  };
}

export function volumeStateForMuteToggle(current: PlaybackVolumeState): PlaybackVolumeState {
  const volume = clampVolumeLevel(current.volume);
  if (current.muted || volume === 0) {
    return {
      volume: volume > 0 ? volume : 1,
      muted: false,
    };
  }
  return {
    volume,
    muted: true,
  };
}

export function volumeSliderAriaValue(current: PlaybackVolumeState) {
  const effectiveVolume = current.muted ? 0 : clampVolumeLevel(current.volume);
  const percent = Math.round(effectiveVolume * 100);
  return {
    valueMin: 0,
    valueMax: 100,
    valueNow: percent,
    valueText: percent === 0 ? "Muted" : `${percent}% volume`,
  };
}

export function playerKeyboardShortcuts(input: { hasSubtitleTracks: boolean }) {
  const shortcuts = ["Space", "K", "ArrowLeft", "ArrowRight", "F", "M", "Z"];
  if (input.hasSubtitleTracks) shortcuts.push("C");
  return shortcuts.join(" ");
}

export function mediaTimelineSeconds(input: { relativeSeconds: number; streamStartSeconds?: number | null }) {
  return absolutePlaybackSeconds({
    relativeSeconds: input.relativeSeconds,
    streamStartSeconds: input.streamStartSeconds,
  });
}

export function elementTimelineSeconds(input: { absoluteSeconds: number; streamStartSeconds?: number | null }) {
  return streamRelativePlaybackSeconds({
    absoluteSeconds: input.absoluteSeconds,
    streamStartSeconds: input.streamStartSeconds,
  });
}

export function castReceiverTimelineSeconds(input: {
  absoluteSeconds: number;
  mode: string;
  streamStartSeconds?: number | null;
}) {
  if (input.mode !== "transcode" && input.mode !== "remux") {
    return clampPlaybackSeconds({
      seconds: input.absoluteSeconds,
      durationSeconds: null,
    });
  }
  return elementTimelineSeconds({
    absoluteSeconds: input.absoluteSeconds,
    streamStartSeconds: input.streamStartSeconds,
  });
}

export function castMediaTimelineSeconds(input: {
  receiverSeconds: number;
  mode: string;
  streamStartSeconds?: number | null;
}) {
  if (input.mode !== "transcode" && input.mode !== "remux") {
    return clampPlaybackSeconds({
      seconds: input.receiverSeconds,
      durationSeconds: null,
    });
  }
  return mediaTimelineSeconds({
    relativeSeconds: input.receiverSeconds,
    streamStartSeconds: input.streamStartSeconds,
  });
}

export function shouldUseHlsRepositionForSeek(input: {
  mode: string;
  targetSeconds: number;
  streamStartSeconds?: number | null;
}) {
  if (input.mode !== "transcode" && input.mode !== "remux") return false;
  const streamStartSeconds =
    Number.isFinite(input.streamStartSeconds) && Number(input.streamStartSeconds) > 0
      ? Number(input.streamStartSeconds)
      : 0;
  return input.targetSeconds < streamStartSeconds;
}

export type PlaybackSeekAction =
  | {
      kind: "cast";
      targetSeconds: number;
    }
  | {
      kind: "hls-reposition";
      targetSeconds: number;
    }
  | {
      kind: "local";
      targetSeconds: number;
      elementSeconds: number;
    };

export function playbackSeekAction(input: {
  casting: boolean;
  mode: string;
  targetSeconds: number;
  durationSeconds: number | null;
  streamStartSeconds?: number | null;
}): PlaybackSeekAction {
  const targetSeconds = clampPlaybackSeconds({
    seconds: input.targetSeconds,
    durationSeconds: input.durationSeconds,
  });
  if (input.casting) {
    return { kind: "cast", targetSeconds };
  }
  if (
    shouldUseHlsRepositionForSeek({
      mode: input.mode,
      targetSeconds,
      streamStartSeconds: input.streamStartSeconds,
    })
  ) {
    return { kind: "hls-reposition", targetSeconds };
  }
  return {
    kind: "local",
    targetSeconds,
    elementSeconds: elementTimelineSeconds({
      absoluteSeconds: targetSeconds,
      streamStartSeconds: input.streamStartSeconds,
    }),
  };
}

export function castPlaybackSecondsAfterSeek(input: {
  commandSent: boolean;
  currentPlaybackSeconds: number;
  targetSeconds: number;
}) {
  return input.commandSent ? input.targetSeconds : input.currentPlaybackSeconds;
}

export function playbackProgressSnapshot(input: {
  casting: boolean;
  videoRelativeSeconds: number;
  videoDurationSeconds: number | null;
  currentPlaybackSeconds: number;
  uiDurationSeconds: number | null;
  fileDurationSeconds: number | null;
  streamStartSeconds?: number | null;
}) {
  const fileDurationSeconds =
    Number.isFinite(input.fileDurationSeconds) && Number(input.fileDurationSeconds) > 0
      ? Number(input.fileDurationSeconds)
      : null;
  const uiDurationSeconds =
    Number.isFinite(input.uiDurationSeconds) && Number(input.uiDurationSeconds) > 0
      ? Number(input.uiDurationSeconds)
      : null;
  const videoDurationSeconds =
    Number.isFinite(input.videoDurationSeconds) && Number(input.videoDurationSeconds) > 0
      ? mediaTimelineSeconds({
          relativeSeconds: Number(input.videoDurationSeconds),
          streamStartSeconds: input.streamStartSeconds,
        })
      : null;
  const durationSeconds = fileDurationSeconds ?? uiDurationSeconds ?? videoDurationSeconds;
  const positionSeconds = input.casting
    ? input.currentPlaybackSeconds
    : mediaTimelineSeconds({
        relativeSeconds: input.videoRelativeSeconds,
        streamStartSeconds: input.streamStartSeconds,
      });
  return {
    positionSeconds: clampPlaybackSeconds({
      seconds: positionSeconds,
      durationSeconds,
    }),
    durationSeconds,
  };
}

export function primaryPlaybackButtonState(input: { uiState: PlayerControlUiState }) {
  const action: "play" | "pause" =
    input.uiState === "playing" || input.uiState === "buffering" || input.uiState === "seeking" ? "pause" : "play";
  return {
    action,
    label: action === "pause" ? "Pause" : "Play",
  };
}

export function castUiStateAfterCommand(input: {
  command: "play" | "pause";
  commandSent: boolean;
  fallbackUiState: PlayerControlUiState;
}): PlayerControlUiState {
  if (!input.commandSent) return input.fallbackUiState;
  return input.command === "pause" ? "paused" : "playing";
}

export function shouldAttemptLocalAutoplay(input: {
  autoplayAttempted: boolean;
  retryAfterReady?: boolean;
  disposed: boolean;
  paused: boolean;
  casting: boolean;
}) {
  return (
    (!input.autoplayAttempted || input.retryAfterReady === true) && !input.disposed && input.paused && !input.casting
  );
}

export function shouldApplyLocalWaitingState(input: {
  uiState: PlayerControlUiState;
  paused: boolean;
  ended: boolean;
  casting: boolean;
}) {
  return input.uiState !== "autoplayBlocked" && !input.paused && !input.ended && !input.casting;
}

export function castPlayerUiState(input: {
  alive: boolean;
  playerState: string | null | undefined;
  fallbackUiState: PlayerControlUiState;
}): PlayerControlUiState {
  if (!input.alive) return "paused";
  switch (input.playerState) {
    case "PLAYING":
      return "playing";
    case "PAUSED":
    case "IDLE":
      return "paused";
    case "BUFFERING":
    case "LOADING":
      return "buffering";
    default:
      return input.fallbackUiState;
  }
}

export type CastControlState = "idle" | "connecting" | "connected" | "error";

export function castControlLabel(state: CastControlState) {
  switch (state) {
    case "connecting":
      return "Connecting to Chromecast";
    case "connected":
      return "Stop casting";
    case "error":
      return "Retry Cast";
    default:
      return "Cast";
  }
}

export function hasAirPlayPicker(input: { showPlaybackTargetPicker: unknown }) {
  return typeof input.showPlaybackTargetPicker === "function";
}

export function airPlayAvailableFromEvent(input: { canShowPicker: boolean; availability: string | null | undefined }) {
  return input.canShowPicker && input.availability === "available";
}

export function airPlayActiveFromVideo(input: { currentPlaybackTargetIsWireless: unknown }) {
  return input.currentPlaybackTargetIsWireless === true;
}

export function airPlayControlLabel(input: { active: boolean }) {
  return input.active ? "AirPlay connected" : "AirPlay";
}

export function airPlayControlState(input: { available: boolean; active: boolean; casting: boolean }) {
  const active = input.available && input.active;
  const label = airPlayControlLabel({ active });
  return {
    visible: input.available,
    active,
    disabled: input.available && input.casting,
    label,
  };
}

export type AirPlayTargetPickerAction = "show-picker" | "unavailable";

export function airPlayTargetPickerAction(input: {
  available: boolean;
  showPlaybackTargetPicker: unknown;
}): AirPlayTargetPickerAction {
  if (
    input.available &&
    hasAirPlayPicker({
      showPlaybackTargetPicker: input.showPlaybackTargetPicker,
    })
  ) {
    return "show-picker";
  }
  return "unavailable";
}

export function isCastOwnedPlaybackSession(input: {
  sessionId: string | null;
  castOwnedPlaybackSessions: ReadonlySet<string>;
}) {
  return Boolean(input.sessionId && input.castOwnedPlaybackSessions.has(input.sessionId));
}

export function markCastOwnedPlaybackSession(input: {
  sessionId: string | null;
  castOwnedPlaybackSessions: Set<string>;
}) {
  if (!input.sessionId) return null;
  input.castOwnedPlaybackSessions.add(input.sessionId);
  return input.sessionId;
}

export function releaseCastOwnedPlaybackSession(input: {
  sessionId: string | null;
  activeSessionId: string | null;
  castOwnedPlaybackSessions: Set<string>;
}) {
  if (!input.sessionId) {
    return {
      released: false,
      activeSessionId: input.activeSessionId,
    };
  }
  input.castOwnedPlaybackSessions.delete(input.sessionId);
  return {
    released: true,
    activeSessionId: input.activeSessionId === input.sessionId ? null : input.activeSessionId,
  };
}

export function shouldCancelPlaybackSessionForCleanup(input: { castOwned: boolean; includeCastOwned: boolean }) {
  return input.includeCastOwned || !input.castOwned;
}

export type PlayerStatusOverlayState = "hidden" | "casting" | "error" | "busy" | "action";

export function playerStatusOverlayState(input: {
  uiState: PlayerControlUiState;
  casting: boolean;
}): PlayerStatusOverlayState {
  if (input.casting) return "casting";
  if (input.uiState === "error") return "error";
  if (input.uiState === "autoplayBlocked") return "action";
  if (input.uiState === "starting" || input.uiState === "buffering" || input.uiState === "seeking") {
    return "busy";
  }
  return "hidden";
}

export type FullscreenAction = "exit-document" | "exit-video" | "enter-document" | "enter-video" | "unavailable";

export function fullscreenAction(input: {
  documentFullscreen: boolean;
  canExitDocumentFullscreen: boolean;
  canRequestDocumentFullscreen: boolean;
  canEnterVideoFullscreen: boolean;
  videoFullscreen?: boolean;
  canExitVideoFullscreen?: boolean;
}): FullscreenAction {
  if (input.documentFullscreen && input.canExitDocumentFullscreen) {
    return "exit-document";
  }
  if (input.videoFullscreen && input.canExitVideoFullscreen) {
    return "exit-video";
  }
  if (input.canRequestDocumentFullscreen) {
    return "enter-document";
  }
  if (input.canEnterVideoFullscreen) {
    return "enter-video";
  }
  return "unavailable";
}

export function shouldShowCustomControls(input: {
  controlsVisible: boolean;
  uiState: PlayerControlUiState;
  casting: boolean;
  subtitleMenuOpen: boolean;
  controlsFocused: boolean;
  controlsHovered: boolean;
}) {
  if (input.controlsFocused || input.controlsHovered) return true;
  if (input.casting || input.subtitleMenuOpen) return true;
  if (input.uiState !== "playing") return true;
  return input.controlsVisible;
}

export const PLAYER_OVERLAY_DISMISS_MS = 3500;

/** Minimum pointer travel before mouse movement reveals or refreshes the control bar. */
export const POINTER_CONTROLS_MOVEMENT_THRESHOLD_PX = 12;

/** Throttle control-bar activity refreshes from pointer movement while the bar is visible. */
export const POINTER_CONTROLS_REFRESH_INTERVAL_MS = 250;

export function pointerMovementExceedsControlsThreshold(input: {
  clientX: number;
  clientY: number;
  anchorX: number;
  anchorY: number;
  thresholdPx?: number;
}) {
  const threshold = input.thresholdPx ?? POINTER_CONTROLS_MOVEMENT_THRESHOLD_PX;
  const dx = input.clientX - input.anchorX;
  const dy = input.clientY - input.anchorY;
  return Math.hypot(dx, dy) >= threshold;
}

export function shouldRefreshControlsFromPointerMove(input: {
  clientX: number;
  clientY: number;
  anchorX: number;
  anchorY: number;
  controlsVisible: boolean;
  lastRefreshAtMs: number;
  nowMs: number;
  thresholdPx?: number;
  refreshIntervalMs?: number;
}) {
  if (
    !pointerMovementExceedsControlsThreshold({
      clientX: input.clientX,
      clientY: input.clientY,
      anchorX: input.anchorX,
      anchorY: input.anchorY,
      thresholdPx: input.thresholdPx,
    })
  ) {
    return false;
  }
  const refreshInterval = input.refreshIntervalMs ?? POINTER_CONTROLS_REFRESH_INTERVAL_MS;
  if (input.controlsVisible && input.nowMs - input.lastRefreshAtMs < refreshInterval) {
    return false;
  }
  return true;
}

export const TIMELINE_UI_UPDATE_INTERVAL_MS = 1000;

export function shouldSyncTimelineUiNow(input: {
  controlsBarVisible: boolean;
  seeking: boolean;
  scrubbing: boolean;
  lastSyncAtMs: number;
  nowMs: number;
}) {
  if (!input.scrubbing && !input.seeking && !input.controlsBarVisible) {
    return false;
  }
  if (input.seeking || input.scrubbing) return true;
  return input.nowMs - input.lastSyncAtMs >= TIMELINE_UI_UPDATE_INTERVAL_MS;
}

export function shouldAutoHideControls(input: {
  uiState: PlayerControlUiState;
  controlsVisible: boolean;
  casting: boolean;
  subtitleMenuOpen: boolean;
  controlsFocused: boolean;
  controlsHovered: boolean;
}) {
  return (
    input.uiState === "playing" &&
    input.controlsVisible &&
    !input.casting &&
    !input.subtitleMenuOpen &&
    !input.controlsFocused &&
    !input.controlsHovered
  );
}

export function nextControlsActivityTick(currentTick: number) {
  return Number.isFinite(currentTick) ? currentTick + 1 : 1;
}

export type PlayerSurfaceClickAction = "seek-backward" | "toggle-playback" | "seek-forward";

export function playerSurfaceClickAction(input: {
  clientX: number;
  left: number;
  width: number;
}): PlayerSurfaceClickAction {
  const width = Number.isFinite(input.width) && input.width > 0 ? input.width : 0;
  if (width === 0) return "toggle-playback";
  const relativeX = Number.isFinite(input.clientX) ? input.clientX - input.left : width / 2;
  const zone = Math.min(Math.max(relativeX / width, 0), 1);
  if (zone < 1 / 3) return "seek-backward";
  if (zone > 2 / 3) return "seek-forward";
  return "toggle-playback";
}

export type SeekSliderHoverPreview = {
  seconds: number;
  ratio: number;
};

export function seekSliderHoverPreview(input: {
  clientX: number;
  left: number;
  width: number;
  durationSeconds: number | null;
}): SeekSliderHoverPreview | null {
  const width = Number.isFinite(input.width) && input.width > 0 ? input.width : 0;
  const durationSeconds = normalizedDurationSeconds(input.durationSeconds);
  if (width === 0 || durationSeconds === null) return null;
  const relativeX = Number.isFinite(input.clientX) ? input.clientX - input.left : width / 2;
  const ratio = Math.min(Math.max(relativeX / width, 0), 1);
  return {
    ratio,
    seconds: clampPlaybackSeconds({ seconds: ratio * durationSeconds, durationSeconds }),
  };
}

export function shouldRefreshSeekSliderHoverPreview(
  previous: SeekSliderHoverPreview | null,
  next: SeekSliderHoverPreview,
) {
  if (!previous) return true;
  if (Math.floor(previous.seconds) !== Math.floor(next.seconds)) return true;
  return Math.abs(previous.ratio - next.ratio) >= 0.003;
}

export type PlayerSurfaceInteractionIntent =
  "close-subtitle-menu" | "show-controls" | "hide-controls" | "surface-control" | "none";

export function playerSurfaceSingleClickIntent(input: {
  /** Whether the control bar is rendered on screen (`shouldShowCustomControls`), not just `playerControlsVisible`. */
  controlsVisible: boolean;
  subtitleMenuOpen: boolean;
  /** True for touch pointers on phones/tablets; desktop mouse clicks stay on play/seek behavior. */
  touchPointer?: boolean;
}): PlayerSurfaceInteractionIntent {
  if (input.subtitleMenuOpen) return "close-subtitle-menu";
  if (input.controlsVisible) {
    return input.touchPointer ? "hide-controls" : "surface-control";
  }
  return "show-controls";
}

export function playerSurfaceDoubleClickIntent(input: {
  /** Whether the control bar is rendered on screen (`shouldShowCustomControls`), not just `playerControlsVisible`. */
  controlsVisible: boolean;
  subtitleMenuOpen: boolean;
}): PlayerSurfaceInteractionIntent {
  if (input.subtitleMenuOpen) return "none";
  if (input.controlsVisible) return "none";
  return "surface-control";
}

export type PlaybackSubtitleTrack = {
  id: string;
  default?: boolean | null;
};

export function defaultSubtitleTrackId(tracks: PlaybackSubtitleTrack[]) {
  return tracks.find((track) => track.default)?.id ?? "off";
}

export function subtitleTextTrackMode(input: {
  selectedTrackId: string;
  track: PlaybackSubtitleTrack | null | undefined;
}): TextTrackMode {
  if (input.selectedTrackId !== "off" && input.track?.id === input.selectedTrackId) {
    return "showing";
  }
  return "disabled";
}

export function nextSubtitleMenuOptionIndex(input: { optionCount: number; currentIndex: number; delta: number }) {
  const optionCount = Number.isFinite(input.optionCount) && input.optionCount > 0 ? Math.floor(input.optionCount) : 0;
  if (optionCount === 0) return -1;

  const delta = Number.isFinite(input.delta) ? Math.trunc(input.delta) : 0;
  const currentIndex =
    Number.isFinite(input.currentIndex) && input.currentIndex >= 0 && input.currentIndex < optionCount
      ? Math.trunc(input.currentIndex)
      : -1;

  if (currentIndex >= 0) {
    return (currentIndex + delta + optionCount) % optionCount;
  }
  return delta < 0 ? optionCount - 1 : 0;
}

export function shouldHandlePlayerShortcut(target: EventTarget | null) {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return true;
  }
  for (let element: Element | null = target; element; element = element.parentElement) {
    const editableValue = element.getAttribute("contenteditable")?.toLowerCase();
    if (editableValue === undefined) continue;
    if (editableValue === "false") break;
    if (editableValue === "" || editableValue === "true" || editableValue === "plaintext-only") {
      return false;
    }
  }
  for (let element: Element | null = target; element; element = element.parentElement) {
    const tagName = element.tagName.toLowerCase();
    if (
      tagName === "a" ||
      tagName === "button" ||
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select"
    ) {
      return false;
    }
  }
  return true;
}

export function shouldCloseSubtitleMenuOnPlayerKeydown(input: { key: string; subtitleMenuOpen: boolean }) {
  return input.subtitleMenuOpen && input.key.toLowerCase() === "escape";
}

export function shouldClosePlaybackModalOnKeydown(input: { key: string; defaultPrevented: boolean }) {
  return input.key === "Escape" && !input.defaultPrevented;
}
