import { access, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { chromium } from "playwright-core";

const root = process.cwd();

const browserCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
].filter(Boolean);

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function resolveBrowserExecutable() {
  for (const candidate of browserCandidates) {
    if (await fileExists(candidate)) return candidate;
  }
  throw new Error(
    "No Chromium-compatible browser found. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to run the custom player browser smoke.",
  );
}

function transpileModule(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      sourceMap: false,
    },
    fileName,
  }).outputText;
}

function moduleDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function compiledControlModuleDataUrl() {
  const seekSource = await readFile(
    path.join(root, "src/lib/playback/seek.ts"),
    "utf8",
  );
  const seekModuleUrl = moduleDataUrl(transpileModule(seekSource, "seek.ts"));
  const controlsSource = await readFile(
    path.join(root, "src/lib/playback/controls.ts"),
    "utf8",
  );
  const controlsModule = transpileModule(controlsSource, "controls.ts").replace(
    /from\s+["']\.\/seek["'];/g,
    `from "${seekModuleUrl}";`,
  );
  return moduleDataUrl(controlsModule);
}

async function mediaPlayerStyle() {
  const source = await mediaPlayerSource();
  const match = source.match(/<style>([\s\S]*?)<\/style>/);
  if (!match) throw new Error("MediaPlayer.svelte style block was not found.");
  return match[1];
}

async function mediaPlayerSource() {
  return readFile(
    path.join(root, "src/lib/components/MediaPlayer.svelte"),
    "utf8",
  );
}

function assertMediaPlayerSourceContract(source) {
  const videoTag = source.match(/<video\b([\s\S]*?)>/);
  if (!videoTag) {
    throw new Error("MediaPlayer.svelte video element was not found.");
  }
  if (/\bcontrols\b/.test(videoTag[1])) {
    throw new Error(
      "MediaPlayer.svelte ready video element must not expose native controls.",
    );
  }

  for (const requiredSnippet of [
    'class="video-tap-target"',
    'class="player-controls"',
    'class="primary-controls"',
    'class="control-button primary-play"',
    'role="region"',
    'aria-roledescription="video player"',
    "aria-label={`Video player for ${data.item.title}`}",
    "aria-keyshortcuts={playerKeyboardShortcuts({",
    'aria-label="Playback controls"',
    'safariVideo.setAttribute("x-webkit-airplay", "allow")',
    '"webkitplaybacktargetavailabilitychanged"',
    '"webkitcurrentplaybacktargetiswirelesschanged"',
    "airPlayTargetPickerAction({",
    "{#if airPlayButtonState().visible}",
    "<Airplay size={20} aria-hidden=\"true\" />",
  ]) {
    if (!source.includes(requiredSnippet)) {
      throw new Error(
        `MediaPlayer.svelte is missing required custom player markup: ${requiredSnippet}`,
      );
    }
  }
}

function assertResult(result) {
  if (!result?.ok) {
    throw new Error(result?.message ?? "Custom player browser smoke failed.");
  }
}

const executablePath = await resolveBrowserExecutable();
assertMediaPlayerSourceContract(await mediaPlayerSource());
const controlsModuleUrl = await compiledControlModuleDataUrl();
const playerStyle = await mediaPlayerStyle();
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.setContent(`<!doctype html>
    <meta charset="utf-8">
    <style>
      ${playerStyle}
      .custom-player {
        width: min(100vw, 60rem);
        aspect-ratio: 16 / 9;
      }
      video {
        height: 100%;
        object-fit: contain;
      }
    </style>
    <main
      class="video-shell custom-player"
      role="region"
      aria-roledescription="video player"
      aria-label="Video player for Smoke Test Playback Title"
      aria-keyshortcuts="Space K ArrowLeft ArrowRight F M C"
      tabindex="0"
    >
      <video playsinline></video>
      <div class="video-tap-target" aria-hidden="true"></div>
      <div class="player-controls">
        <div class="top-controls">
          <button class="control-button" type="button" aria-label="Close player">Close</button>
          <div class="player-title">
            <p>Now playing</p>
            <h2>Smoke Test Playback Title With Long Text</h2>
          </div>
          <button class="control-button" type="button" aria-label="Cast">Cast</button>
        </div>
        <div class="bottom-controls">
          <input class="seek-slider" type="range" aria-label="Playback position" />
          <div class="control-row">
            <div class="primary-controls">
              <button class="control-button primary-play" type="button" aria-label="Play">Play</button>
              <button class="control-button skip-button" type="button" aria-label="Skip backward 10 seconds">
                <span>10</span>
              </button>
              <button class="control-button skip-button" type="button" aria-label="Skip forward 30 seconds">
                <span>30</span>
              </button>
              <span class="time-readout">1:05 / 1:00:00</span>
            </div>
            <div class="right-controls">
              <button class="control-button" type="button" aria-label="Mute">Mute</button>
              <input class="volume-slider" type="range" aria-label="Volume" />
              <div class="subtitle-control">
                <button class="control-button subtitle-toggle" type="button" aria-haspopup="menu" aria-expanded="true" aria-controls="player-subtitle-menu">Subtitles</button>
                <div class="subtitle-menu" id="player-subtitle-menu" role="menu" aria-label="Subtitle tracks" tabindex="-1">
                  <button type="button" role="menuitemradio" aria-checked="true">Off</button>
                </div>
              </div>
              <button class="control-button" type="button" aria-label="Fullscreen">Fullscreen</button>
            </div>
          </div>
        </div>
      </div>
      <input id="outside-input" />
      <div id="editable-region" contenteditable="true">
        <span id="editable-child">editable text</span>
      </div>
    </main>`);
  await page.hover(".primary-play");

  const result = await page.evaluate(async (moduleUrl) => {
    const controls = await import(moduleUrl);
    const player = document.querySelector(".custom-player");
    const video = document.querySelector("video");
    const tapTarget = document.querySelector(".video-tap-target");
    const playButton = document.querySelector(".primary-play");
    const primaryControls = document.querySelector(".primary-controls");
    const bottomControls = document.querySelector(".bottom-controls");
    const controlRow = document.querySelector(".control-row");
    const seekSlider = document.querySelector(".seek-slider");
    const volumeSlider = document.querySelector(".volume-slider");
    const playerTitle = document.querySelector(".player-title");
    const skipButton = document.querySelector(".skip-button");
    const subtitleToggle = document.querySelector(".subtitle-toggle");
    const subtitleMenu = document.querySelector(".subtitle-menu");
    const subtitleOffButton = document.querySelector(".subtitle-menu button");
    const outsideInput = document.querySelector("#outside-input");
    const editableChild = document.querySelector("#editable-child");
    if (
      !player ||
      !video ||
      !tapTarget ||
      !playButton ||
      !primaryControls ||
      !bottomControls ||
      !controlRow ||
      !seekSlider ||
      !volumeSlider ||
      !playerTitle ||
      !skipButton ||
      !subtitleToggle ||
      !subtitleMenu ||
      !subtitleOffButton ||
      !outsideInput ||
      !editableChild
    ) {
      return {
        ok: false,
        message: "Custom player smoke DOM was not created.",
      };
    }

    video.controls = false;
    if (video.controls) {
      return {
        ok: false,
        message: "Native video controls remained visible.",
      };
    }

    if (!controls.shouldHandlePlayerShortcut(player)) {
      return {
        ok: false,
        message: "Expected player shell focus to accept keyboard shortcuts.",
      };
    }
    if (
      player.getAttribute("aria-keyshortcuts") !==
      "Space K ArrowLeft ArrowRight F M C"
    ) {
      return {
        ok: false,
        message: `Expected player shell to expose keyboard shortcuts, got ${player.getAttribute("aria-keyshortcuts")}.`,
      };
    }
    if (
      player.getAttribute("role") !== "region" ||
      player.getAttribute("aria-roledescription") !== "video player" ||
      player.getAttribute("aria-label") !==
        "Video player for Smoke Test Playback Title"
    ) {
      return {
        ok: false,
        message: `Expected player shell to expose video region semantics, got ${JSON.stringify({
          role: player.getAttribute("role"),
          roleDescription: player.getAttribute("aria-roledescription"),
          label: player.getAttribute("aria-label"),
        })}.`,
      };
    }
    if (
      tapTarget.tagName !== "DIV" ||
      tapTarget.getAttribute("tabindex") !== null ||
      tapTarget.getAttribute("aria-hidden") !== "true"
    ) {
      return {
        ok: false,
        message:
          "Expected video tap target to be a presentational, non-tabbable layer.",
      };
    }
    player.blur();
    tapTarget.addEventListener("pointerdown", () => {
      player.focus({ preventScroll: true });
    });
    tapTarget.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    if (document.activeElement !== player) {
      return {
        ok: false,
        message:
          "Expected tapping the video surface to focus the player shell for keyboard shortcuts.",
      };
    }
    if (controls.shouldHandlePlayerShortcut(playButton)) {
      return {
        ok: false,
        message: "Expected player button focus to keep native button keyboard behavior.",
      };
    }
    const skipButtonLabel = skipButton.querySelector("span");
    if (!skipButtonLabel || controls.shouldHandlePlayerShortcut(skipButtonLabel)) {
      return {
        ok: false,
        message: "Expected descendants inside player buttons to ignore player shortcuts.",
      };
    }
    if (controls.shouldHandlePlayerShortcut(seekSlider)) {
      return {
        ok: false,
        message: "Expected range slider focus to ignore player shortcuts.",
      };
    }
    if (controls.shouldHandlePlayerShortcut(outsideInput)) {
      return {
        ok: false,
        message: "Expected editable input focus to ignore player shortcuts.",
      };
    }
    if (controls.shouldHandlePlayerShortcut(editableChild)) {
      return {
        ok: false,
        message: "Expected contenteditable descendants to ignore player shortcuts.",
      };
    }

    const subtitleMenuWiring =
      subtitleToggle.getAttribute("aria-controls") === "player-subtitle-menu" &&
      subtitleToggle.getAttribute("aria-haspopup") === "menu" &&
      subtitleMenu.getAttribute("role") === "menu" &&
      subtitleMenu.getAttribute("tabindex") === "-1" &&
      subtitleOffButton.getAttribute("role") === "menuitemradio" &&
      subtitleOffButton.getAttribute("aria-checked") === "true";
    if (!subtitleMenuWiring) {
      return {
        ok: false,
        message: "Expected subtitle menu to expose menuitemradio semantics.",
      };
    }

    const playerRect = player.getBoundingClientRect();
    const bottomControlsRect = bottomControls.getBoundingClientRect();
    const controlRowRect = controlRow.getBoundingClientRect();
    const seekSliderRect = seekSlider.getBoundingClientRect();
    const desktopLayout = {
      volumeDisplay: getComputedStyle(volumeSlider).display,
      titleDisplay: getComputedStyle(playerTitle).display,
      playCursor: getComputedStyle(playButton).cursor,
      seekCursor: getComputedStyle(seekSlider).cursor,
      subtitleCursor: getComputedStyle(subtitleOffButton).cursor,
      playWidth: playButton.getBoundingClientRect().width,
      skipWidth: skipButton.getBoundingClientRect().width,
      playInBottomCluster: primaryControls.contains(playButton),
      oldCenterControlsPresent: document.querySelector(".center-controls") !== null,
      bottomControlsOffset:
        playerRect.bottom - bottomControlsRect.bottom,
      seekAboveControls: seekSliderRect.bottom <= controlRowRect.top,
    };
    if (
      desktopLayout.volumeDisplay === "none" ||
      desktopLayout.titleDisplay === "none" ||
      desktopLayout.playCursor !== "pointer" ||
      desktopLayout.seekCursor !== "pointer" ||
      desktopLayout.subtitleCursor !== "pointer" ||
      desktopLayout.playWidth < 42 ||
      desktopLayout.skipWidth < 42 ||
      !desktopLayout.playInBottomCluster ||
      desktopLayout.oldCenterControlsPresent ||
      desktopLayout.bottomControlsOffset > 4 ||
      !desktopLayout.seekAboveControls
    ) {
      return {
        ok: false,
        message: `Expected desktop player controls to use the bottom primary cluster with title, volume, and pointer affordance visible, got ${JSON.stringify(desktopLayout)}.`,
      };
    }

    if (
      !controls.shouldClosePlaybackModalOnKeydown({
        key: "Escape",
        defaultPrevented: false,
      }) ||
      controls.shouldClosePlaybackModalOnKeydown({
        key: "Escape",
        defaultPrevented: true,
      })
    ) {
      return {
        ok: false,
        message: "Expected handled Escape events to stay inside custom player controls.",
      };
    }
    if (
      !controls.shouldCloseSubtitleMenuOnPlayerKeydown({
        key: "Escape",
        subtitleMenuOpen: true,
      }) ||
      controls.shouldCloseSubtitleMenuOnPlayerKeydown({
        key: "Escape",
        subtitleMenuOpen: false,
      }) ||
      !controls.shouldHandlePlayerShortcut(player) ||
      controls.shouldHandlePlayerShortcut(subtitleToggle)
    ) {
      return {
        ok: false,
        message:
          "Expected player Escape to close an open subtitle menu before focused controls suppress shortcuts.",
      };
    }

    const hoveredPlayButtonStyle = getComputedStyle(playButton);
    if (
      hoveredPlayButtonStyle.backgroundColor !== "rgba(0, 204, 255, 0.14)" ||
      hoveredPlayButtonStyle.color !== "rgb(0, 204, 255)"
    ) {
      return {
        ok: false,
        message: `Expected primary play hover to use the app primary color, got ${JSON.stringify({ backgroundColor: hoveredPlayButtonStyle.backgroundColor, color: hoveredPlayButtonStyle.color })}.`,
      };
    }

    const sliderAriaValue = controls.playbackSliderAriaValue({
      seconds: 65.8,
      durationSeconds: 3600,
    });
    if (
      sliderAriaValue.valueMin !== 0 ||
      sliderAriaValue.valueMax !== 3600 ||
      sliderAriaValue.valueNow !== 66 ||
      sliderAriaValue.valueText !== "1:05 of 1:00:00"
    ) {
      return {
        ok: false,
        message: `Expected slider aria values to expose current time and duration, got ${JSON.stringify(sliderAriaValue)}.`,
      };
    }
    const volumeAriaValue = controls.volumeSliderAriaValue({
      volume: 0.42,
      muted: false,
    });
    const mutedVolumeAriaValue = controls.volumeSliderAriaValue({
      volume: 0.42,
      muted: true,
    });
    if (
      volumeAriaValue.valueText !== "42% volume" ||
      mutedVolumeAriaValue.valueText !== "Muted" ||
      mutedVolumeAriaValue.valueNow !== 0
    ) {
      return {
        ok: false,
        message: `Expected volume aria values to expose percent and muted state, got ${JSON.stringify({ volumeAriaValue, mutedVolumeAriaValue })}.`,
      };
    }
    const unknownDurationSliderAriaValue = controls.playbackSliderAriaValue({
      seconds: 65.8,
      durationSeconds: null,
    });
    const knownTimeRange = controls.playbackTimeRangeText({
      seconds: 65.8,
      durationSeconds: 3600,
    });
    const unknownTimeRange = controls.playbackTimeRangeText({
      seconds: 65.8,
      durationSeconds: null,
    });
    if (
      unknownDurationSliderAriaValue.valueText !== "1:05 elapsed" ||
      knownTimeRange !== "1:05 / 1:00:00" ||
      unknownTimeRange !== "1:05 / --:--"
    ) {
      return {
        ok: false,
        message: `Expected unknown duration text to avoid fake 0:00 totals, got ${JSON.stringify({ unknownDurationSliderAriaValue, knownTimeRange, unknownTimeRange })}.`,
      };
    }

    const focusedControlsVisible = controls.shouldShowCustomControls({
      controlsVisible: false,
      uiState: "playing",
      casting: false,
      subtitleMenuOpen: false,
      controlsFocused: true,
      controlsHovered: false,
    });
    const focusedAutoHide = controls.shouldAutoHideControls({
      uiState: "playing",
      controlsVisible: true,
      casting: false,
      subtitleMenuOpen: false,
      controlsFocused: true,
      controlsHovered: false,
    });
    const hoveredControlsVisible = controls.shouldShowCustomControls({
      controlsVisible: false,
      uiState: "playing",
      casting: false,
      subtitleMenuOpen: false,
      controlsFocused: false,
      controlsHovered: true,
    });
    const hoveredAutoHide = controls.shouldAutoHideControls({
      uiState: "playing",
      controlsVisible: true,
      casting: false,
      subtitleMenuOpen: false,
      controlsFocused: false,
      controlsHovered: true,
    });
    if (
      !focusedControlsVisible ||
      focusedAutoHide ||
      !hoveredControlsVisible ||
      hoveredAutoHide
    ) {
      return {
        ok: false,
        message: `Expected focused and hovered controls to stay visible, got ${JSON.stringify({ focusedControlsVisible, focusedAutoHide, hoveredControlsVisible, hoveredAutoHide })}.`,
      };
    }
    if (
      controls.nextControlsActivityTick(0) !== 1 ||
      controls.nextControlsActivityTick(Number.NaN) !== 1
    ) {
      return {
        ok: false,
        message: "Expected controls activity ticks to advance safely.",
      };
    }
    const hiddenPlayingPointerMove =
      controls.shouldRefreshControlsOnPointerMove({
        controlsVisible: false,
        uiState: "playing",
        casting: false,
        subtitleMenuOpen: false,
        controlsFocused: false,
        controlsHovered: false,
      });
    const visiblePlayingPointerMove =
      controls.shouldRefreshControlsOnPointerMove({
        controlsVisible: true,
        uiState: "playing",
        casting: false,
        subtitleMenuOpen: false,
        controlsFocused: false,
        controlsHovered: false,
      });
    if (hiddenPlayingPointerMove || !visiblePlayingPointerMove) {
      return {
        ok: false,
        message: `Expected pointer movement to refresh visible controls without revealing hidden playing controls, got ${JSON.stringify({ hiddenPlayingPointerMove, visiblePlayingPointerMove })}.`,
      };
    }
    const surfaceClickWithSubtitleMenu = controls.playerSurfaceClickState({
      uiState: "playing",
      controlsVisible: true,
      subtitleMenuOpen: true,
    });
    if (
      !surfaceClickWithSubtitleMenu.controlsVisible ||
      surfaceClickWithSubtitleMenu.subtitleMenuOpen
    ) {
      return {
        ok: false,
        message: `Expected surface click to close subtitle menu before hiding controls, got ${JSON.stringify(surfaceClickWithSubtitleMenu)}.`,
      };
    }

    const castSeek = controls.playbackSeekAction({
      casting: true,
      mode: "transcode",
      targetSeconds: 780,
      durationSeconds: 700,
      streamStartSeconds: 600,
    });
    if (castSeek.kind !== "cast" || castSeek.targetSeconds !== 700) {
      return {
        ok: false,
        message: `Expected Cast seek to clamp and route to Cast, got ${JSON.stringify(castSeek)}.`,
      };
    }
    const sentCastSeekSeconds = controls.castPlaybackSecondsAfterSeek({
      commandSent: true,
      currentPlaybackSeconds: 120,
      targetSeconds: castSeek.targetSeconds,
    });
    const missingCastMediaSeekSeconds = controls.castPlaybackSecondsAfterSeek({
      commandSent: false,
      currentPlaybackSeconds: 120,
      targetSeconds: castSeek.targetSeconds,
    });
    if (sentCastSeekSeconds !== 700 || missingCastMediaSeekSeconds !== 120) {
      return {
        ok: false,
        message: `Expected Cast seek UI time to update only after a sent command, got ${JSON.stringify({ sentCastSeekSeconds, missingCastMediaSeekSeconds })}.`,
      };
    }
    if (
      !controls.shouldAttemptLocalAutoplay({
        autoplayAttempted: false,
        disposed: false,
        paused: true,
        casting: false,
      }) ||
      controls.shouldAttemptLocalAutoplay({
        autoplayAttempted: false,
        disposed: false,
        paused: true,
        casting: true,
      })
    ) {
      return {
        ok: false,
        message: "Expected active Cast sessions to suppress local autoplay.",
      };
    }
    const castNoopUiState = controls.castUiStateAfterCommand({
      command: "play",
      commandSent: false,
      fallbackUiState: "buffering",
    });
    const castSentUiState = controls.castUiStateAfterCommand({
      command: "pause",
      commandSent: true,
      fallbackUiState: "playing",
    });
    if (castNoopUiState !== "buffering" || castSentUiState !== "paused") {
      return {
        ok: false,
        message: `Expected Cast UI state to change only after sent commands, got ${JSON.stringify({ castNoopUiState, castSentUiState })}.`,
      };
    }
    const castLabels = {
      idle: controls.castControlLabel("idle"),
      connecting: controls.castControlLabel("connecting"),
      connected: controls.castControlLabel("connected"),
      error: controls.castControlLabel("error"),
    };
    if (
      castLabels.idle !== "Cast" ||
      castLabels.connecting !== "Connecting to Chromecast" ||
      castLabels.connected !== "Stop casting" ||
      castLabels.error !== "Retry Cast"
    ) {
      return {
        ok: false,
        message: `Expected Cast control states to have accessible labels, got ${JSON.stringify(castLabels)}.`,
      };
    }

    const castBufferingState = controls.castPlayerUiState({
      alive: true,
      playerState: "BUFFERING",
      fallbackUiState: "playing",
    });
    const castEndedState = controls.castPlayerUiState({
      alive: false,
      playerState: "PLAYING",
      fallbackUiState: "playing",
    });
    if (castBufferingState !== "buffering" || castEndedState !== "paused") {
      return {
        ok: false,
        message: `Expected Cast receiver states to map into player UI states, got ${JSON.stringify({ castBufferingState, castEndedState })}.`,
      };
    }
    const overlayStates = {
      playing: controls.playerStatusOverlayState({
        uiState: "playing",
        casting: false,
      }),
      autoplayBlocked: controls.playerStatusOverlayState({
        uiState: "autoplayBlocked",
        casting: false,
      }),
      buffering: controls.playerStatusOverlayState({
        uiState: "buffering",
        casting: false,
      }),
      casting: controls.playerStatusOverlayState({
        uiState: "paused",
        casting: true,
      }),
    };
    if (
      overlayStates.playing !== "hidden" ||
      overlayStates.autoplayBlocked !== "action" ||
      overlayStates.buffering !== "busy" ||
      overlayStates.casting !== "casting"
    ) {
      return {
        ok: false,
        message: `Expected player status overlay states to include autoplay action state, got ${JSON.stringify(overlayStates)}.`,
      };
    }

    const hlsSeek = controls.playbackSeekAction({
      casting: false,
      mode: "remux",
      targetSeconds: 500,
      durationSeconds: 2000,
      streamStartSeconds: 600,
    });
    if (hlsSeek.kind !== "hls-reposition" || hlsSeek.targetSeconds !== 500) {
      return {
        ok: false,
        message: `Expected backward HLS seek to reposition, got ${JSON.stringify(hlsSeek)}.`,
      };
    }

    const standardFullscreenAction = controls.fullscreenAction({
      documentFullscreen: false,
      canExitDocumentFullscreen: typeof document.exitFullscreen === "function",
      canRequestDocumentFullscreen:
        typeof player.requestFullscreen === "function",
      canEnterVideoFullscreen:
        typeof video.webkitEnterFullscreen === "function" ||
        typeof video.webkitEnterFullScreen === "function",
    });
    if (standardFullscreenAction !== "enter-document") {
      return {
        ok: false,
        message: `Expected Chromium to use document fullscreen, got ${standardFullscreenAction}.`,
      };
    }

    const safariFallbackAction = controls.fullscreenAction({
      documentFullscreen: false,
      canExitDocumentFullscreen: false,
      canRequestDocumentFullscreen: false,
      canEnterVideoFullscreen: true,
    });
    if (safariFallbackAction !== "enter-video") {
      return {
        ok: false,
        message: `Expected Safari video fullscreen fallback, got ${safariFallbackAction}.`,
      };
    }
    const safariExitAction = controls.fullscreenAction({
      documentFullscreen: false,
      canExitDocumentFullscreen: false,
      canRequestDocumentFullscreen: false,
      canEnterVideoFullscreen: true,
      videoFullscreen: true,
      canExitVideoFullscreen: true,
    });
    if (safariExitAction !== "exit-video") {
      return {
        ok: false,
        message: `Expected Safari video fullscreen exit, got ${safariExitAction}.`,
      };
    }

    playButton.focus();
    if (document.activeElement !== playButton) {
      return {
        ok: false,
        message: "Play button could not receive focus.",
      };
    }

    return { ok: true };
  }, controlsModuleUrl);

  assertResult(result);

  for (const selector of [".skip-button", ".subtitle-menu button"]) {
    await page.hover(selector);
    const hoverStyle = await page.evaluate((currentSelector) => {
      const element = document.querySelector(currentSelector);
      if (!element) {
        return { found: false };
      }
      const style = getComputedStyle(element);
      return {
        found: true,
        backgroundColor: style.backgroundColor,
        color: style.color,
      };
    }, selector);
    if (
      !hoverStyle.found ||
      hoverStyle.backgroundColor !== "rgba(0, 204, 255, 0.14)" ||
      hoverStyle.color !== "rgb(0, 204, 255)"
    ) {
      throw new Error(
        `Expected ${selector} hover to use the app primary color, got ${JSON.stringify(hoverStyle)}.`,
      );
    }
  }

  const motionPage = await browser.newPage();
  try {
    await motionPage.emulateMedia({ reducedMotion: "reduce" });
    await motionPage.setContent(`<!doctype html>
      <meta charset="utf-8">
      <style>${playerStyle}</style>
      <span class="overlay-spinner" aria-hidden="true"></span>`);
    const reducedMotionSpinner = await motionPage.evaluate(() => {
      const spinner = document.querySelector(".overlay-spinner");
      if (!spinner) return { found: false };
      const style = getComputedStyle(spinner);
      return {
        found: true,
        animationName: style.animationName,
        animationDuration: style.animationDuration,
      };
    });
    if (
      !reducedMotionSpinner.found ||
      reducedMotionSpinner.animationName !== "none"
    ) {
      throw new Error(
        `Expected player spinner animation to stop for reduced motion, got ${JSON.stringify(reducedMotionSpinner)}.`,
      );
    }
  } finally {
    await motionPage.close();
  }

  await page.setViewportSize({ width: 390, height: 700 });
  const mobileResult = await page.evaluate(() => {
    const player = document.querySelector(".custom-player");
    const volumeSlider = document.querySelector(".volume-slider");
    const playerTitle = document.querySelector(".player-title");
    const playButton = document.querySelector(".primary-play");
    const primaryControls = document.querySelector(".primary-controls");
    const skipButton = document.querySelector(".skip-button");
    const seekSlider = document.querySelector(".seek-slider");
    if (
      !player ||
      !volumeSlider ||
      !playerTitle ||
      !playButton ||
      !primaryControls ||
      !skipButton ||
      !seekSlider
    ) {
      return {
        ok: false,
        message: "Custom player mobile smoke DOM was not created.",
      };
    }

    const playerRect = player.getBoundingClientRect();
    const seekRect = seekSlider.getBoundingClientRect();
    const mobileLayout = {
      volumeDisplay: getComputedStyle(volumeSlider).display,
      titleDisplay: getComputedStyle(playerTitle).display,
      playWidth: playButton.getBoundingClientRect().width,
      playHeight: playButton.getBoundingClientRect().height,
      skipWidth: skipButton.getBoundingClientRect().width,
      skipHeight: skipButton.getBoundingClientRect().height,
      seekWidth: seekRect.width,
      playerWidth: playerRect.width,
      playInBottomCluster: primaryControls.contains(playButton),
    };
    if (
      mobileLayout.volumeDisplay !== "none" ||
      mobileLayout.titleDisplay !== "none" ||
      mobileLayout.playWidth < 41 ||
      mobileLayout.playHeight < 41 ||
      mobileLayout.skipWidth < 41 ||
      mobileLayout.skipHeight < 41 ||
      mobileLayout.seekWidth < mobileLayout.playerWidth * 0.88 ||
      !mobileLayout.playInBottomCluster
    ) {
      return {
        ok: false,
        message: `Expected mobile player controls to hide volume/title and keep touch targets usable, got ${JSON.stringify(mobileLayout)}.`,
      };
    }
    return { ok: true };
  });

  assertResult(mobileResult);
  console.log(
    `Browser custom player smoke passed with ${path.basename(executablePath)}.`,
  );
} finally {
  await browser.close();
}
