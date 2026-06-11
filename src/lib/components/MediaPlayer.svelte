<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, tick } from "svelte";
  import { Play } from "@lucide/svelte";
  import {
    createLatestHlsRepositionScheduler,
    hlsRepositionHref,
    initialPlayerTimelineSeconds,
    shouldReloadHlsPlaybackDataOnError,
    shouldRecoverHlsPlaybackError,
    shouldRepositionHlsSeek
  } from "$lib/playback/seek";
  import {
    activePlaybackSessionId,
    cancelPlaybackSessionOnce,
    postWithBeaconFallback,
    shouldCancelCapturedPlaybackSession,
    shouldInvalidateAfterHeartbeat
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

  let {
    data,
    onProgressSaved,
    onReload,
    onReposition
  }: {
    data: PlaybackData;
    onProgressSaved: () => void;
    onReload: () => void;
    onReposition: (href: string) => void;
  } = $props();

  let video: HTMLVideoElement | undefined = $state();
  let saveState = $state<"idle" | "saving" | "saved" | "error">("idle");
  let playerUiState = $state<PlayerUiState>("starting");
  let hasStartedPlayback = $state(false);
  let hasPlaybackActivity = false;
  let playbackActivityKey: string | null = null;
  const cancelledPlaybackSessions = new Set<string>();

  function isPlayOverlayVisible() {
    return (
      playerUiState === "autoplayBlocked" ||
      (!hasStartedPlayback && playerUiState === "paused")
    );
  }

  function isStatusOverlayVisible() {
    return (
      playerUiState === "starting" ||
      playerUiState === "buffering" ||
      playerUiState === "seeking" ||
      playerUiState === "error"
    );
  }

  function isPlayerOverlayVisible() {
    return isPlayOverlayVisible() || isStatusOverlayVisible();
  }

  function playerOverlayMessage() {
    switch (playerUiState) {
      case "autoplayBlocked":
      case "paused":
        return "Tap to play";
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
    const positionSeconds = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const ended = completed || video.ended;
    if (!ended && !hasPlaybackActivity && video.currentTime <= 0) return null;

    return {
      mediaFileId: sourceData.playback.file.id,
      positionSeconds,
      durationSeconds: Number.isFinite(video.duration) ? video.duration : null,
      completed: ended
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
        body: JSON.stringify(payload)
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
      fetchFn: fetch
    });
  }

  function cancelPlaybackSession(playback: PlaybackDecision = data.playback) {
    cancelPlaybackSessionOnce({
      playback,
      cancelledPlaybackSessions,
      navigatorRef: navigator,
      fetchFn: fetch
    });
  }

  function cancelPlaybackSessionWhenReplaced(playback: PlaybackDecision) {
    const capturedSessionId = activePlaybackSessionId(playback);
    if (!capturedSessionId) return;

    queueMicrotask(() => {
      if (
        shouldCancelCapturedPlaybackSession({
          captured: playback,
          current: data.playback
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
      method: "POST"
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
            currentSearch: window.location.search
          })
        ) {
          onReload();
        }
      })
      .catch(() => undefined);
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
        playback.streamStartSeconds ?? 0
      ].join(":");
      if (playbackActivityKey !== currentPlaybackActivityKey) {
        playbackActivityKey = currentPlaybackActivityKey;
        hasPlaybackActivity = false;
        hasStartedPlayback = false;
        playerUiState = "starting";
        saveState = "idle";
      }
      let lastPlaybackTime = initialPlayerTimelineSeconds({
        startSeconds,
        streamStartSeconds: playback.streamStartSeconds
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
              startPosition: Math.max(0, startSeconds),
            });
            hls.on(Hls.Events.ERROR, (_event, eventData) => {
              if (!disposed && eventData.fatal) restartHlsNearCurrentTime("hls");
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
        player.currentTime = startSeconds;
        lastPlaybackTime = startSeconds;
        hasPlaybackActivity = true;
      };

      let autoplayAttempted = false;
      const attemptAutoplay = async () => {
        if (autoplayAttempted || disposed || !player.paused) return;
        autoplayAttempted = true;
        playerUiState = "starting";
        try {
          await player.play();
          if (disposed) return;
          hasPlaybackActivity = true;
          hasStartedPlayback = true;
          playerUiState = "playing";
        } catch {
          if (!disposed && !hasStartedPlayback) playerUiState = "autoplayBlocked";
        }
      };

      const prepareInitialPlayback = () => {
        seekToStart();
        void attemptAutoplay();
      };

      const currentPlayerTime = () =>
        Number.isFinite(player.currentTime) ? Math.max(0, player.currentTime) : 0;

      const repositionHlsPlayback = (targetSeconds: number) => {
        if (disposed || repositioning) return false;
        const href = hlsRepositionHref({
          currentUrl: new URL(window.location.href),
          mediaFileId: playback.file.id,
          startSeconds: targetSeconds,
          forceTranscode: playback.mode === "remux"
        });
        if (href === currentPageHref()) return false;

        repositioning = true;
        stopHlsTransport();
        flushProgress(sourceData);
        cancelPlaybackSession(playback);
        onReposition(href);
        return true;
      };

      const seekRepositionScheduler = createLatestHlsRepositionScheduler({
        reposition: repositionHlsPlayback
      });

      const shouldRepositionSeekTo = (targetSeconds: number) =>
        shouldRepositionHlsSeek({
          mode: playback.mode,
          status: playback.status,
          fromSeconds: lastPlaybackTime,
          toSeconds: targetSeconds
        });

      const restartHlsNearCurrentTime = (source: "hls" | "native" = "native") => {
        if (disposed) return;
        if (source === "native" && hls) return;
        const currentTime = currentPlayerTime();
        if (
          repositioning ||
          !shouldRecoverHlsPlaybackError({
            mode: playback.mode,
            status: playback.status,
            currentSeconds: currentTime,
            hasPlaybackActivity
          })
        ) {
          if (
            shouldReloadHlsPlaybackDataOnError({
              mode: playback.mode,
              status: playback.status,
              currentSeconds: currentTime,
              hasPlaybackActivity,
              hasLoadedMetadata: player.readyState >= HTMLMediaElement.HAVE_METADATA
            })
          ) {
            repositioning = true;
            stopHlsTransport();
            cancelPlaybackSession(playback);
            onReload();
          }
          return;
        }

        seekRepositionScheduler.cancel();
        repositionHlsPlayback(currentTime);
      };

      const onTimeUpdate = () => {
        if (!player.seeking) lastPlaybackTime = currentPlayerTime();
      };
      const onLoadStart = () => {
        if (!hasStartedPlayback) playerUiState = "starting";
      };
      const onCanPlay = () => {
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
      };
      const onPause = () => {
        if (
          disposed ||
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
        const targetSeconds = currentPlayerTime();
        playerUiState = "seeking";
        if (shouldRepositionSeekTo(targetSeconds)) {
          seekRepositionScheduler.schedule(targetSeconds);
          return;
        }
        seekRepositionScheduler.cancel();
      };
      const onSeeked = () => {
        const targetSeconds = currentPlayerTime();
        if (shouldRepositionSeekTo(targetSeconds)) {
          seekRepositionScheduler.schedule(targetSeconds);
          return;
        }
        seekRepositionScheduler.cancel();
        lastPlaybackTime = targetSeconds;
        playerUiState = player.paused ? "paused" : "playing";
      };
      const onPlayerError = () => {
        playerUiState = "error";
        restartHlsNearCurrentTime("native");
      };

      if (player.readyState >= HTMLMediaElement.HAVE_METADATA) {
        prepareInitialPlayback();
      } else {
        player.addEventListener("loadedmetadata", prepareInitialPlayback, {
          once: true
        });
      }
      player.addEventListener("loadstart", onLoadStart);
      player.addEventListener("canplay", onCanPlay);
      player.addEventListener("playing", onPlaying);
      player.addEventListener("pause", onPause);
      player.addEventListener("waiting", onWaiting);
      player.addEventListener("stalled", onWaiting);
      player.addEventListener("timeupdate", onTimeUpdate);
      player.addEventListener("seeking", onSeeking);
      player.addEventListener("seeked", onSeeked);
      player.addEventListener("error", onPlayerError);

      const interval = window.setInterval(() => void save(false, sourceData), 10000);
      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") flushProgress(sourceData);
      };
      const flushCapturedProgress = () => flushProgress(sourceData);
      window.addEventListener("pagehide", flushCapturedProgress);
      document.addEventListener("visibilitychange", onVisibilityChange);

      cleanup = () => {
        seekRepositionScheduler.cancel();
        player.removeEventListener("loadedmetadata", prepareInitialPlayback);
        player.removeEventListener("loadstart", onLoadStart);
        player.removeEventListener("canplay", onCanPlay);
        player.removeEventListener("playing", onPlaying);
        player.removeEventListener("pause", onPause);
        player.removeEventListener("waiting", onWaiting);
        player.removeEventListener("stalled", onWaiting);
        player.removeEventListener("timeupdate", onTimeUpdate);
        player.removeEventListener("seeking", onSeeking);
        player.removeEventListener("seeked", onSeeked);
        player.removeEventListener("error", onPlayerError);
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
    const playback = data.playback;
    if (
      (playback.mode !== "transcode" && playback.mode !== "remux") ||
      !playback.playbackSessionId ||
      (playback.status !== "preparing" && playback.status !== "ready")
    )
      return;

    heartbeatPlaybackSession(playback);
    const interval = window.setInterval(() => heartbeatPlaybackSession(playback), 10000);
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
    flushProgress(data);
    cancelPlaybackSession(data.playback);
  });
</script>

{#if data.playback.status === "ready" && data.playback.streamUrl}
  <!-- svelte-ignore a11y_media_has_caption -->
  <div class="video-shell">
    <video
      bind:this={video}
      controls
      playsinline
      preload={data.playback.mode === "direct" ? "metadata" : "auto"}
      onplay={() => (hasPlaybackActivity = true)}
      ontimeupdate={() => {
        if (video && video.currentTime > 0) hasPlaybackActivity = true;
      }}
      onpause={() => save(false)}
      onended={() => save(true)}
    >
      {#each data.playback.tracks as track}
        <track
          kind="subtitles"
          src={track.src}
          srclang={track.language}
          label={track.label}
          default={track.default}
        />
      {/each}
    </video>

    {#if isPlayerOverlayVisible()}
      <div
        class:interactive={isPlayOverlayVisible()}
        class="player-overlay"
        aria-live="polite"
      >
        {#if isPlayOverlayVisible()}
          <button
            class="overlay-play"
            type="button"
            aria-label="Play"
            onclick={playFromOverlay}
          >
            <Play size={34} fill="currentColor" aria-hidden="true" />
          </button>
        {:else if playerUiState === "error"}
          <span class="overlay-error" aria-hidden="true">!</span>
        {:else}
          <span class="overlay-spinner" aria-hidden="true"></span>
        {/if}
        <p>{playerOverlayMessage()}</p>
      </div>
    {/if}
  </div>

  <p class:error={saveState === "error"} class="save-state">
    {#if saveState === "saving"}
      Saving progress
    {:else if saveState === "saved"}
      Progress saved
    {:else if saveState === "error"}
      Progress could not be saved
    {:else}
      Resume starts at {Math.floor(data.startSeconds)}s
    {/if}
  </p>
{:else}
  <section class="playback-message" aria-live="polite">
    <h2>
      {data.playback.status === "preparing"
        ? "Preparing playback"
        : "Playback unavailable"}
    </h2>
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

  video {
    width: 100%;
    max-height: min(72vh, calc(100dvh - 9rem));
    background: #000;
    display: block;
  }

  .player-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 0.75rem;
    padding: 1rem 1rem 4rem;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.18);
    color: #f8fafc;
    text-align: center;
  }

  .player-overlay.interactive {
    pointer-events: auto;
  }

  .player-overlay p {
    margin: 0;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.56);
    padding: 0.4rem 0.7rem;
    font-size: 0.85rem;
    font-weight: 750;
  }

  .overlay-play {
    width: 5rem;
    height: 5rem;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 999px;
    background: rgba(8, 12, 16, 0.72);
    color: #fff;
    box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.35);
  }

  .overlay-play:hover {
    background: rgba(18, 25, 33, 0.86);
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

  .save-state {
    margin: 0;
    color: #a8a195;
  }
</style>
