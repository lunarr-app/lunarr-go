import { describe, expect, test } from "bun:test";
import {
  airPlayActiveFromVideo,
  airPlayAvailableFromEvent,
  airPlayControlLabel,
  airPlayControlState,
  airPlayTargetPickerAction,
  castControlLabel,
  castMediaTimelineSeconds,
  castPlaybackSecondsAfterSeek,
  castPlayerUiState,
  castReceiverTimelineSeconds,
  castUiStateAfterCommand,
  clampPlaybackSeconds,
  defaultSubtitleTrackId,
  elementTimelineSeconds,
  formatPlaybackTime,
  fullscreenAction,
  hasAirPlayPicker,
  isCastOwnedPlaybackSession,
  markCastOwnedPlaybackSession,
  mediaTimelineSeconds,
  nextControlsActivityTick,
  nextSubtitleMenuOptionIndex,
  playerKeyboardShortcuts,
  primaryPlaybackButtonState,
  playbackProgressSnapshot,
  playbackSliderAriaValue,
  playbackSeekAction,
  playbackTimeRangeText,
  playerSurfaceClickAction,
  playerSurfaceClickState,
  playerStatusOverlayState,
  releaseCastOwnedPlaybackSession,
  shouldAutoHideControls,
  shouldApplyLocalWaitingState,
  shouldCancelPlaybackSessionForCleanup,
  shouldAttemptLocalAutoplay,
  shouldClosePlaybackModalOnKeydown,
  shouldCloseSubtitleMenuOnPlayerKeydown,
  shouldHandlePlayerShortcut,
  shouldShowCustomControls,
  shouldUseHlsRepositionForSeek,
  subtitleTextTrackMode,
  volumeSliderAriaValue,
  volumeStateForMuteToggle,
  volumeStateForSliderValue,
} from "./controls";

describe("custom player controls", () => {
  test("formats playback time with optional hours", () => {
    expect(formatPlaybackTime(0)).toBe("0:00");
    expect(formatPlaybackTime(65)).toBe("1:05");
    expect(formatPlaybackTime(3661)).toBe("1:01:01");
    expect(formatPlaybackTime(Number.NaN)).toBe("0:00");
  });

  test("formats playback readout without inventing an unknown duration", () => {
    expect(
      playbackTimeRangeText({
        seconds: 65.8,
        durationSeconds: 3600,
      }),
    ).toBe("1:05 / 1:00:00");
    expect(
      playbackTimeRangeText({
        seconds: 65.8,
        durationSeconds: null,
      }),
    ).toBe("1:05 / --:--");
  });

  test("converts direct and HLS timeline values", () => {
    expect(mediaTimelineSeconds({ relativeSeconds: 42 })).toBe(42);
    expect(
      mediaTimelineSeconds({
        relativeSeconds: 180,
        streamStartSeconds: 600,
      }),
    ).toBe(780);
    expect(
      elementTimelineSeconds({
        absoluteSeconds: 780,
        streamStartSeconds: 600,
      }),
    ).toBe(180);
  });

  test("clamps seek targets to known duration", () => {
    expect(clampPlaybackSeconds({ seconds: -10, durationSeconds: 120 })).toBe(0);
    expect(clampPlaybackSeconds({ seconds: 140, durationSeconds: 120 })).toBe(120);
    expect(clampPlaybackSeconds({ seconds: 140, durationSeconds: null })).toBe(140);
  });

  test("exposes a meaningful slider aria value", () => {
    expect(
      playbackSliderAriaValue({
        seconds: 65.8,
        durationSeconds: 3600,
      }),
    ).toEqual({
      valueMin: 0,
      valueMax: 3600,
      valueNow: 66,
      valueText: "1:05 of 1:00:00",
    });
    expect(
      playbackSliderAriaValue({
        seconds: 140,
        durationSeconds: 120,
      }),
    ).toEqual({
      valueMin: 0,
      valueMax: 120,
      valueNow: 120,
      valueText: "2:00 of 2:00",
    });
    expect(
      playbackSliderAriaValue({
        seconds: 65.8,
        durationSeconds: null,
      }),
    ).toEqual({
      valueMin: 0,
      valueMax: 66,
      valueNow: 66,
      valueText: "1:05 elapsed",
    });
  });

  test("maps volume slider and mute toggle to usable volume state", () => {
    expect(volumeStateForSliderValue(0.5)).toEqual({
      volume: 0.5,
      muted: false,
    });
    expect(volumeStateForSliderValue(0)).toEqual({
      volume: 0,
      muted: true,
    });
    expect(volumeStateForSliderValue(5)).toEqual({
      volume: 1,
      muted: false,
    });
    expect(volumeStateForMuteToggle({ volume: 0.5, muted: false })).toEqual({
      volume: 0.5,
      muted: true,
    });
    expect(volumeStateForMuteToggle({ volume: 0.5, muted: true })).toEqual({
      volume: 0.5,
      muted: false,
    });
    expect(volumeStateForMuteToggle({ volume: 0, muted: true })).toEqual({
      volume: 1,
      muted: false,
    });
    expect(volumeSliderAriaValue({ volume: 0.42, muted: false })).toEqual({
      valueMin: 0,
      valueMax: 100,
      valueNow: 42,
      valueText: "42% volume",
    });
    expect(volumeSliderAriaValue({ volume: 0.42, muted: true })).toEqual({
      valueMin: 0,
      valueMax: 100,
      valueNow: 0,
      valueText: "Muted",
    });
  });

  test("exposes player keyboard shortcuts based on available controls", () => {
    expect(playerKeyboardShortcuts({ hasSubtitleTracks: false })).toBe("Space K ArrowLeft ArrowRight F M");
    expect(playerKeyboardShortcuts({ hasSubtitleTracks: true })).toBe("Space K ArrowLeft ArrowRight F M C");
  });

  test("repositions HLS only when seeking before the current stream start", () => {
    expect(
      shouldUseHlsRepositionForSeek({
        mode: "direct",
        targetSeconds: 10,
        streamStartSeconds: 600,
      }),
    ).toBe(false);
    expect(
      shouldUseHlsRepositionForSeek({
        mode: "remux",
        targetSeconds: 500,
        streamStartSeconds: 600,
      }),
    ).toBe(true);
    expect(
      shouldUseHlsRepositionForSeek({
        mode: "transcode",
        targetSeconds: 700,
        streamStartSeconds: 600,
      }),
    ).toBe(false);
  });

  test("routes seek commits to local video, HLS reposition, or Cast", () => {
    expect(
      playbackSeekAction({
        casting: false,
        mode: "direct",
        targetSeconds: 90,
        durationSeconds: 120,
      }),
    ).toEqual({
      kind: "local",
      targetSeconds: 90,
      elementSeconds: 90,
    });
    expect(
      playbackSeekAction({
        casting: false,
        mode: "remux",
        targetSeconds: 500,
        durationSeconds: 2000,
        streamStartSeconds: 600,
      }),
    ).toEqual({
      kind: "hls-reposition",
      targetSeconds: 500,
    });
    expect(
      playbackSeekAction({
        casting: false,
        mode: "transcode",
        targetSeconds: 780,
        durationSeconds: 2000,
        streamStartSeconds: 600,
      }),
    ).toEqual({
      kind: "local",
      targetSeconds: 780,
      elementSeconds: 180,
    });
    expect(
      playbackSeekAction({
        casting: true,
        mode: "transcode",
        targetSeconds: 780,
        durationSeconds: 700,
        streamStartSeconds: 600,
      }),
    ).toEqual({
      kind: "cast",
      targetSeconds: 700,
    });
    expect(
      castPlaybackSecondsAfterSeek({
        commandSent: true,
        currentPlaybackSeconds: 120,
        targetSeconds: 700,
      }),
    ).toBe(700);
    expect(
      castPlaybackSecondsAfterSeek({
        commandSent: false,
        currentPlaybackSeconds: 120,
        targetSeconds: 700,
      }),
    ).toBe(120);
  });

  test("uses receiver timeline for Cast progress snapshots", () => {
    expect(
      playbackProgressSnapshot({
        casting: true,
        videoRelativeSeconds: 15,
        videoDurationSeconds: 200,
        currentPlaybackSeconds: 120,
        uiDurationSeconds: 180,
        fileDurationSeconds: null,
        streamStartSeconds: 60,
      }),
    ).toEqual({
      positionSeconds: 120,
      durationSeconds: 180,
    });

    expect(
      playbackProgressSnapshot({
        casting: false,
        videoRelativeSeconds: 15,
        videoDurationSeconds: 200,
        currentPlaybackSeconds: 120,
        uiDurationSeconds: 180,
        fileDurationSeconds: null,
        streamStartSeconds: 60,
      }),
    ).toEqual({
      positionSeconds: 75,
      durationSeconds: 180,
    });

    expect(
      playbackProgressSnapshot({
        casting: true,
        videoRelativeSeconds: 15,
        videoDurationSeconds: 200,
        currentPlaybackSeconds: 240,
        uiDurationSeconds: 180,
        fileDurationSeconds: null,
        streamStartSeconds: 60,
      }).positionSeconds,
    ).toBe(180);
  });

  test("converts Cast HLS receiver times against the stream start offset", () => {
    expect(
      castReceiverTimelineSeconds({
        mode: "transcode",
        absoluteSeconds: 780,
        streamStartSeconds: 600,
      }),
    ).toBe(180);
    expect(
      castReceiverTimelineSeconds({
        mode: "transcode",
        absoluteSeconds: 1800,
        streamStartSeconds: 600,
      }),
    ).toBe(1200);
    expect(
      castMediaTimelineSeconds({
        mode: "transcode",
        receiverSeconds: 180,
        streamStartSeconds: 600,
      }),
    ).toBe(780);
    expect(
      castReceiverTimelineSeconds({
        mode: "direct",
        absoluteSeconds: 780,
        streamStartSeconds: 600,
      }),
    ).toBe(780);
    expect(
      castMediaTimelineSeconds({
        mode: "direct",
        receiverSeconds: 180,
        streamStartSeconds: 600,
      }),
    ).toBe(180);
  });

  test("updates Cast UI state after command attempts", () => {
    expect(
      castUiStateAfterCommand({
        command: "pause",
        commandSent: true,
        fallbackUiState: "playing",
      }),
    ).toBe("paused");
    expect(
      castUiStateAfterCommand({
        command: "play",
        commandSent: true,
        fallbackUiState: "paused",
      }),
    ).toBe("playing");
    expect(
      castUiStateAfterCommand({
        command: "play",
        commandSent: false,
        fallbackUiState: "buffering",
      }),
    ).toBe("buffering");
  });

  test("shows the primary playback button from playback intent", () => {
    expect(primaryPlaybackButtonState({ uiState: "playing" })).toEqual({
      action: "pause",
      label: "Pause",
    });
    expect(primaryPlaybackButtonState({ uiState: "buffering" })).toEqual({
      action: "pause",
      label: "Pause",
    });
    expect(primaryPlaybackButtonState({ uiState: "seeking" })).toEqual({
      action: "pause",
      label: "Pause",
    });
    expect(primaryPlaybackButtonState({ uiState: "paused" })).toEqual({
      action: "play",
      label: "Play",
    });
    expect(primaryPlaybackButtonState({ uiState: "autoplayBlocked" })).toEqual({
      action: "play",
      label: "Play",
    });
  });

  test("suppresses local autoplay while casting", () => {
    expect(
      shouldAttemptLocalAutoplay({
        autoplayAttempted: false,
        disposed: false,
        paused: true,
        casting: false,
      }),
    ).toBe(true);
    expect(
      shouldAttemptLocalAutoplay({
        autoplayAttempted: false,
        disposed: false,
        paused: true,
        casting: true,
      }),
    ).toBe(false);
    expect(
      shouldAttemptLocalAutoplay({
        autoplayAttempted: true,
        retryAfterReady: true,
        disposed: false,
        paused: true,
        casting: false,
      }),
    ).toBe(true);
    expect(
      shouldAttemptLocalAutoplay({
        autoplayAttempted: true,
        disposed: false,
        paused: true,
        casting: false,
      }),
    ).toBe(false);
    expect(
      shouldAttemptLocalAutoplay({
        autoplayAttempted: false,
        disposed: true,
        paused: true,
        casting: false,
      }),
    ).toBe(false);
    expect(
      shouldAttemptLocalAutoplay({
        autoplayAttempted: false,
        disposed: false,
        paused: false,
        casting: false,
      }),
    ).toBe(false);
  });

  test("applies local waiting state only for active local playback", () => {
    expect(
      shouldApplyLocalWaitingState({
        uiState: "playing",
        paused: false,
        ended: false,
        casting: false,
      }),
    ).toBe(true);

    expect(
      shouldApplyLocalWaitingState({
        uiState: "paused",
        paused: true,
        ended: false,
        casting: false,
      }),
    ).toBe(false);
    expect(
      shouldApplyLocalWaitingState({
        uiState: "playing",
        paused: false,
        ended: false,
        casting: true,
      }),
    ).toBe(false);
    expect(
      shouldApplyLocalWaitingState({
        uiState: "autoplayBlocked",
        paused: false,
        ended: false,
        casting: false,
      }),
    ).toBe(false);
  });

  test("labels Cast control states for assistive technology", () => {
    expect(castControlLabel("idle")).toBe("Cast");
    expect(castControlLabel("connecting")).toBe("Connecting to Chromecast");
    expect(castControlLabel("connected")).toBe("Stop casting");
    expect(castControlLabel("error")).toBe("Retry Cast");
  });

  test("guards AirPlay controls behind WebKit picker availability", () => {
    const picker = () => undefined;
    expect(hasAirPlayPicker({ showPlaybackTargetPicker: picker })).toBe(true);
    expect(hasAirPlayPicker({ showPlaybackTargetPicker: undefined })).toBe(false);
    expect(
      airPlayAvailableFromEvent({
        canShowPicker: true,
        availability: "available",
      }),
    ).toBe(true);
    expect(
      airPlayAvailableFromEvent({
        canShowPicker: true,
        availability: "not-available",
      }),
    ).toBe(false);
    expect(
      airPlayAvailableFromEvent({
        canShowPicker: false,
        availability: "available",
      }),
    ).toBe(false);
  });

  test("maps AirPlay wireless target state and labels", () => {
    expect(airPlayActiveFromVideo({ currentPlaybackTargetIsWireless: true })).toBe(true);
    expect(airPlayActiveFromVideo({ currentPlaybackTargetIsWireless: false })).toBe(false);
    expect(airPlayActiveFromVideo({ currentPlaybackTargetIsWireless: undefined })).toBe(false);
    expect(airPlayControlLabel({ active: false })).toBe("AirPlay");
    expect(airPlayControlLabel({ active: true })).toBe("AirPlay connected");
  });

  test("maps AirPlay button visibility and active state", () => {
    expect(
      airPlayControlState({
        available: false,
        active: true,
        casting: false,
      }),
    ).toEqual({
      visible: false,
      active: false,
      disabled: false,
      label: "AirPlay",
    });
    expect(
      airPlayControlState({
        available: true,
        active: false,
        casting: false,
      }),
    ).toEqual({
      visible: true,
      active: false,
      disabled: false,
      label: "AirPlay",
    });
    expect(
      airPlayControlState({
        available: true,
        active: true,
        casting: false,
      }),
    ).toEqual({
      visible: true,
      active: true,
      disabled: false,
      label: "AirPlay connected",
    });
    expect(
      airPlayControlState({
        available: true,
        active: false,
        casting: true,
      }),
    ).toEqual({
      visible: true,
      active: false,
      disabled: true,
      label: "AirPlay",
    });
  });

  test("routes AirPlay picker actions only when supported and available", () => {
    const picker = () => undefined;
    expect(
      airPlayTargetPickerAction({
        available: true,
        showPlaybackTargetPicker: picker,
      }),
    ).toBe("show-picker");
    expect(
      airPlayTargetPickerAction({
        available: false,
        showPlaybackTargetPicker: picker,
      }),
    ).toBe("unavailable");
    expect(
      airPlayTargetPickerAction({
        available: true,
        showPlaybackTargetPicker: undefined,
      }),
    ).toBe("unavailable");
  });

  test("maps Cast receiver state back to player UI state", () => {
    expect(
      castPlayerUiState({
        alive: true,
        playerState: "PLAYING",
        fallbackUiState: "paused",
      }),
    ).toBe("playing");
    expect(
      castPlayerUiState({
        alive: true,
        playerState: "PAUSED",
        fallbackUiState: "playing",
      }),
    ).toBe("paused");
    expect(
      castPlayerUiState({
        alive: true,
        playerState: "BUFFERING",
        fallbackUiState: "playing",
      }),
    ).toBe("buffering");
    expect(
      castPlayerUiState({
        alive: true,
        playerState: "LOADING",
        fallbackUiState: "playing",
      }),
    ).toBe("buffering");
    expect(
      castPlayerUiState({
        alive: false,
        playerState: "PLAYING",
        fallbackUiState: "playing",
      }),
    ).toBe("paused");
    expect(
      castPlayerUiState({
        alive: true,
        playerState: "UNKNOWN",
        fallbackUiState: "seeking",
      }),
    ).toBe("seeking");
  });

  test("tracks Cast-owned playback sessions for handoff and cleanup", () => {
    const castOwnedPlaybackSessions = new Set<string>();

    expect(
      isCastOwnedPlaybackSession({
        sessionId: null,
        castOwnedPlaybackSessions,
      }),
    ).toBe(false);
    expect(
      markCastOwnedPlaybackSession({
        sessionId: null,
        castOwnedPlaybackSessions,
      }),
    ).toBeNull();

    const activeSessionId = markCastOwnedPlaybackSession({
      sessionId: "session-1",
      castOwnedPlaybackSessions,
    });
    expect(activeSessionId).toBe("session-1");
    expect(
      isCastOwnedPlaybackSession({
        sessionId: "session-1",
        castOwnedPlaybackSessions,
      }),
    ).toBe(true);
    expect(
      isCastOwnedPlaybackSession({
        sessionId: "session-2",
        castOwnedPlaybackSessions,
      }),
    ).toBe(false);

    const secondActiveSessionId = markCastOwnedPlaybackSession({
      sessionId: "session-2",
      castOwnedPlaybackSessions,
    });
    expect(secondActiveSessionId).toBe("session-2");
    expect(
      releaseCastOwnedPlaybackSession({
        sessionId: "session-1",
        activeSessionId: secondActiveSessionId,
        castOwnedPlaybackSessions,
      }),
    ).toEqual({
      released: true,
      activeSessionId: "session-2",
    });
    expect(
      isCastOwnedPlaybackSession({
        sessionId: "session-1",
        castOwnedPlaybackSessions,
      }),
    ).toBe(false);
    expect(
      isCastOwnedPlaybackSession({
        sessionId: "session-2",
        castOwnedPlaybackSessions,
      }),
    ).toBe(true);

    expect(
      releaseCastOwnedPlaybackSession({
        sessionId: "session-2",
        activeSessionId: secondActiveSessionId,
        castOwnedPlaybackSessions,
      }),
    ).toEqual({
      released: true,
      activeSessionId: null,
    });
    expect(
      isCastOwnedPlaybackSession({
        sessionId: "session-2",
        castOwnedPlaybackSessions,
      }),
    ).toBe(false);

    expect(
      shouldCancelPlaybackSessionForCleanup({
        castOwned: false,
        includeCastOwned: false,
      }),
    ).toBe(true);
    expect(
      shouldCancelPlaybackSessionForCleanup({
        castOwned: true,
        includeCastOwned: false,
      }),
    ).toBe(false);
    expect(
      shouldCancelPlaybackSessionForCleanup({
        castOwned: true,
        includeCastOwned: true,
      }),
    ).toBe(true);
  });

  test("maps player UI states to status overlay variants", () => {
    expect(
      playerStatusOverlayState({
        uiState: "playing",
        casting: false,
      }),
    ).toBe("hidden");
    expect(
      playerStatusOverlayState({
        uiState: "starting",
        casting: false,
      }),
    ).toBe("busy");
    expect(
      playerStatusOverlayState({
        uiState: "buffering",
        casting: false,
      }),
    ).toBe("busy");
    expect(
      playerStatusOverlayState({
        uiState: "seeking",
        casting: false,
      }),
    ).toBe("busy");
    expect(
      playerStatusOverlayState({
        uiState: "autoplayBlocked",
        casting: false,
      }),
    ).toBe("action");
    expect(
      playerStatusOverlayState({
        uiState: "error",
        casting: false,
      }),
    ).toBe("error");
    expect(
      playerStatusOverlayState({
        uiState: "paused",
        casting: true,
      }),
    ).toBe("casting");
  });

  test("chooses a fullscreen action for desktop and mobile browser support", () => {
    expect(
      fullscreenAction({
        documentFullscreen: true,
        canExitDocumentFullscreen: true,
        canRequestDocumentFullscreen: true,
        canEnterVideoFullscreen: true,
      }),
    ).toBe("exit-document");
    expect(
      fullscreenAction({
        documentFullscreen: false,
        canExitDocumentFullscreen: true,
        canRequestDocumentFullscreen: true,
        canEnterVideoFullscreen: false,
      }),
    ).toBe("enter-document");
    expect(
      fullscreenAction({
        documentFullscreen: false,
        canExitDocumentFullscreen: false,
        canRequestDocumentFullscreen: false,
        canEnterVideoFullscreen: true,
        videoFullscreen: true,
        canExitVideoFullscreen: true,
      }),
    ).toBe("exit-video");
    expect(
      fullscreenAction({
        documentFullscreen: false,
        canExitDocumentFullscreen: false,
        canRequestDocumentFullscreen: false,
        canEnterVideoFullscreen: true,
      }),
    ).toBe("enter-video");
    expect(
      fullscreenAction({
        documentFullscreen: false,
        canExitDocumentFullscreen: false,
        canRequestDocumentFullscreen: false,
        canEnterVideoFullscreen: false,
      }),
    ).toBe("unavailable");
  });

  test("keeps controls visible for non-playing states and casting", () => {
    expect(
      shouldShowCustomControls({
        controlsVisible: false,
        uiState: "paused",
        casting: false,
        subtitleMenuOpen: false,
        controlsFocused: false,
        controlsHovered: false,
      }),
    ).toBe(true);
    expect(
      shouldShowCustomControls({
        controlsVisible: false,
        uiState: "playing",
        casting: true,
        subtitleMenuOpen: false,
        controlsFocused: false,
        controlsHovered: false,
      }),
    ).toBe(true);
    expect(
      shouldShowCustomControls({
        controlsVisible: false,
        uiState: "playing",
        casting: false,
        subtitleMenuOpen: false,
        controlsFocused: false,
        controlsHovered: false,
      }),
    ).toBe(false);
    expect(
      shouldShowCustomControls({
        controlsVisible: true,
        uiState: "playing",
        casting: false,
        subtitleMenuOpen: false,
        controlsFocused: false,
        controlsHovered: false,
      }),
    ).toBe(true);
    expect(
      shouldShowCustomControls({
        controlsVisible: false,
        uiState: "playing",
        casting: false,
        subtitleMenuOpen: false,
        controlsFocused: true,
        controlsHovered: false,
      }),
    ).toBe(true);
    expect(
      shouldShowCustomControls({
        controlsVisible: false,
        uiState: "playing",
        casting: false,
        subtitleMenuOpen: false,
        controlsFocused: false,
        controlsHovered: true,
      }),
    ).toBe(true);
  });

  test("auto-hides only during ordinary unfocused local playback", () => {
    expect(
      shouldAutoHideControls({
        uiState: "playing",
        controlsVisible: true,
        casting: false,
        subtitleMenuOpen: false,
        controlsFocused: false,
        controlsHovered: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoHideControls({
        uiState: "playing",
        controlsVisible: true,
        casting: true,
        subtitleMenuOpen: false,
        controlsFocused: false,
        controlsHovered: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoHideControls({
        uiState: "paused",
        controlsVisible: true,
        casting: false,
        subtitleMenuOpen: false,
        controlsFocused: false,
        controlsHovered: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoHideControls({
        uiState: "playing",
        controlsVisible: true,
        casting: false,
        subtitleMenuOpen: false,
        controlsFocused: true,
        controlsHovered: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoHideControls({
        uiState: "playing",
        controlsVisible: true,
        casting: false,
        subtitleMenuOpen: false,
        controlsFocused: false,
        controlsHovered: true,
      }),
    ).toBe(false);
    expect(nextControlsActivityTick(0)).toBe(1);
    expect(nextControlsActivityTick(12)).toBe(13);
    expect(nextControlsActivityTick(Number.NaN)).toBe(1);
  });

  test("maps video surface clicks to controls and subtitle menu state", () => {
    expect(
      playerSurfaceClickState({
        uiState: "playing",
        controlsVisible: true,
        subtitleMenuOpen: false,
      }),
    ).toEqual({
      controlsVisible: false,
      subtitleMenuOpen: false,
    });
    expect(
      playerSurfaceClickState({
        uiState: "playing",
        controlsVisible: false,
        subtitleMenuOpen: false,
      }),
    ).toEqual({
      controlsVisible: true,
      subtitleMenuOpen: false,
    });
    expect(
      playerSurfaceClickState({
        uiState: "paused",
        controlsVisible: false,
        subtitleMenuOpen: false,
      }),
    ).toEqual({
      controlsVisible: true,
      subtitleMenuOpen: false,
    });
    expect(
      playerSurfaceClickState({
        uiState: "playing",
        controlsVisible: true,
        subtitleMenuOpen: true,
      }),
    ).toEqual({
      controlsVisible: true,
      subtitleMenuOpen: false,
    });
    expect(
      playerSurfaceClickAction({
        clientX: 10,
        left: 0,
        width: 300,
      }),
    ).toBe("seek-backward");
    expect(
      playerSurfaceClickAction({
        clientX: 150,
        left: 0,
        width: 300,
      }),
    ).toBe("toggle-playback");
    expect(
      playerSurfaceClickAction({
        clientX: 290,
        left: 0,
        width: 300,
      }),
    ).toBe("seek-forward");
    expect(
      playerSurfaceClickAction({
        clientX: Number.NaN,
        left: 0,
        width: 0,
      }),
    ).toBe("toggle-playback");
  });

  test("selects the default subtitle track id or off", () => {
    expect(defaultSubtitleTrackId([])).toBe("off");
    expect(
      defaultSubtitleTrackId([
        { id: "subtitle-1", default: false },
        { id: "subtitle-2", default: true },
      ]),
    ).toBe("subtitle-2");
  });

  test("maps subtitle selection to browser text track modes", () => {
    expect(
      subtitleTextTrackMode({
        selectedTrackId: "off",
        track: { id: "subtitle-1" },
      }),
    ).toBe("disabled");
    expect(
      subtitleTextTrackMode({
        selectedTrackId: "subtitle-1",
        track: { id: "subtitle-1" },
      }),
    ).toBe("showing");
    expect(
      subtitleTextTrackMode({
        selectedTrackId: "subtitle-2",
        track: { id: "subtitle-1" },
      }),
    ).toBe("disabled");
    expect(
      subtitleTextTrackMode({
        selectedTrackId: "subtitle-1",
        track: null,
      }),
    ).toBe("disabled");
  });

  test("moves subtitle menu focus with wraparound and jump keys", () => {
    expect(
      nextSubtitleMenuOptionIndex({
        optionCount: 0,
        currentIndex: -1,
        delta: 1,
      }),
    ).toBe(-1);
    expect(
      nextSubtitleMenuOptionIndex({
        optionCount: 3,
        currentIndex: -1,
        delta: 1,
      }),
    ).toBe(0);
    expect(
      nextSubtitleMenuOptionIndex({
        optionCount: 3,
        currentIndex: -1,
        delta: -1,
      }),
    ).toBe(2);
    expect(
      nextSubtitleMenuOptionIndex({
        optionCount: 3,
        currentIndex: 2,
        delta: 1,
      }),
    ).toBe(0);
    expect(
      nextSubtitleMenuOptionIndex({
        optionCount: 3,
        currentIndex: 0,
        delta: -1,
      }),
    ).toBe(2);
    expect(
      nextSubtitleMenuOptionIndex({
        optionCount: 3,
        currentIndex: -1,
        delta: 0,
      }),
    ).toBe(0);
  });

  test("ignores shortcuts from interactive controls", () => {
    expect(shouldHandlePlayerShortcut(null)).toBe(true);
    if (typeof document === "undefined") return;

    expect(shouldHandlePlayerShortcut(document.createElement("div"))).toBe(true);
    expect(shouldHandlePlayerShortcut(document.createElement("button"))).toBe(false);
    expect(shouldHandlePlayerShortcut(document.createElement("a"))).toBe(false);
    expect(shouldHandlePlayerShortcut(document.createElement("input"))).toBe(false);
    expect(shouldHandlePlayerShortcut(document.createElement("select"))).toBe(false);
    const nestedButton = document.createElement("button");
    const nestedIcon = document.createElement("span");
    nestedButton.append(nestedIcon);
    expect(shouldHandlePlayerShortcut(nestedIcon)).toBe(false);

    const nestedLink = document.createElement("a");
    const nestedLinkText = document.createElement("span");
    nestedLink.append(nestedLinkText);
    expect(shouldHandlePlayerShortcut(nestedLinkText)).toBe(false);

    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(shouldHandlePlayerShortcut(editable)).toBe(false);

    const editableChild = document.createElement("span");
    editable.append(editableChild);
    expect(shouldHandlePlayerShortcut(editableChild)).toBe(false);

    const plaintextEditable = document.createElement("div");
    plaintextEditable.setAttribute("contenteditable", "plaintext-only");
    expect(shouldHandlePlayerShortcut(plaintextEditable)).toBe(false);

    const emptyEditable = document.createElement("div");
    emptyEditable.setAttribute("contenteditable", "");
    expect(shouldHandlePlayerShortcut(emptyEditable)).toBe(false);

    const disabledEditableChild = document.createElement("span");
    const disabledEditable = document.createElement("div");
    disabledEditable.setAttribute("contenteditable", "false");
    disabledEditable.append(disabledEditableChild);
    editable.append(disabledEditable);
    expect(shouldHandlePlayerShortcut(disabledEditableChild)).toBe(true);
  });

  test("closes playback modal only for unhandled Escape events", () => {
    expect(
      shouldClosePlaybackModalOnKeydown({
        key: "Escape",
        defaultPrevented: false,
      }),
    ).toBe(true);
    expect(
      shouldClosePlaybackModalOnKeydown({
        key: "Escape",
        defaultPrevented: true,
      }),
    ).toBe(false);
    expect(
      shouldClosePlaybackModalOnKeydown({
        key: "Enter",
        defaultPrevented: false,
      }),
    ).toBe(false);
  });

  test("closes subtitle menu from player Escape before target shortcut suppression", () => {
    expect(
      shouldCloseSubtitleMenuOnPlayerKeydown({
        key: "Escape",
        subtitleMenuOpen: true,
      }),
    ).toBe(true);
    expect(
      shouldCloseSubtitleMenuOnPlayerKeydown({
        key: "escape",
        subtitleMenuOpen: true,
      }),
    ).toBe(true);
    expect(
      shouldCloseSubtitleMenuOnPlayerKeydown({
        key: "Escape",
        subtitleMenuOpen: false,
      }),
    ).toBe(false);
    expect(
      shouldCloseSubtitleMenuOnPlayerKeydown({
        key: "Enter",
        subtitleMenuOpen: true,
      }),
    ).toBe(false);
  });
});
