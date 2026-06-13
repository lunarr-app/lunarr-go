<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, tick } from "svelte";
  import { Cast, Play } from "@lucide/svelte";
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

  type CastPlaybackResponse = {
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

  let {
    data,
    onProgressSaved,
    onReload,
    onReposition,
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
  let castAvailable = $state(false);
  let castLaunchState = $state<"idle" | "connecting" | "connected" | "error">(
    "idle",
  );
  let castOwnedPlaybackSessionId = $state<string | null>(null);
  let hasPlaybackActivity = false;
  let playbackActivityKey: string | null = null;
  const cancelledPlaybackSessions = new Set<string>();
  const castOwnedPlaybackSessions = new Set<string>();
  let castFrameworkPromise: Promise<CastApi> | null = null;

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
    });

    return castFrameworkPromise;
  }

  function playbackIsCastOwned(playback: PlaybackDecision) {
    const sessionId = activePlaybackSessionId(playback);
    return Boolean(sessionId && castOwnedPlaybackSessions.has(sessionId));
  }

  function markCastOwnedSession(sessionId: string | null) {
    if (!sessionId) return;
    castOwnedPlaybackSessions.add(sessionId);
    castOwnedPlaybackSessionId = sessionId;
  }

  function releaseCastOwnedSession(sessionId: string | null) {
    if (!sessionId) return;
    castOwnedPlaybackSessions.delete(sessionId);
    if (castOwnedPlaybackSessionId === sessionId) castOwnedPlaybackSessionId = null;
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
    const positionSeconds = absolutePlaybackSeconds({
      relativeSeconds: Number.isFinite(video.currentTime)
        ? video.currentTime
        : 0,
      streamStartSeconds: sourceData.playback.streamStartSeconds,
    });
    const fileDurationSeconds = Number(
      sourceData.playback.file.duration_seconds,
    );
    const durationSeconds =
      Number.isFinite(fileDurationSeconds) && fileDurationSeconds > 0
        ? fileDurationSeconds
        : Number.isFinite(video.duration)
          ? absolutePlaybackSeconds({
              relativeSeconds: video.duration,
              streamStartSeconds: sourceData.playback.streamStartSeconds,
            })
          : null;
    const ended = completed || video.ended;
    if (!ended && !hasPlaybackActivity && video.currentTime <= 0) return null;

    return {
      mediaFileId: sourceData.playback.file.id,
      positionSeconds,
      durationSeconds,
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
    if (!options.includeCastOwned && playbackIsCastOwned(playback)) return;
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

  function currentCastPositionSeconds() {
    const payload = progressPayload(data, false);
    if (payload) return payload.positionSeconds;
    return Number.isFinite(data.startSeconds) ? data.startSeconds : 0;
  }

  async function prepareCastPlayback() {
    const playback = data.playback;
    const response = await fetch("/api/playback/cast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mediaItemId: data.item.id,
        mediaFileId: playback.file.id,
        playbackSessionId: playback.playbackSessionId,
        mode: playback.mode,
        subtitleTrackIds: playback.tracks.map((track) => track.id),
      }),
    });
    if (!response.ok) throw new Error("Could not prepare Cast playback.");
    return (await response.json()) as CastPlaybackResponse;
  }

  async function castPlayback() {
    if (castLaunchState === "connecting") return;
    castLaunchState = "connecting";
    try {
      const api = await ensureCastFramework();
      const context = configureCastFramework(api);
      const session =
        context.getCurrentSession() ?? (await context.requestSession());
      const castPlayback = await prepareCastPlayback();
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
          ? Number(castPlayback.durationSeconds)
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
      loadRequest.currentTime = currentCastPositionSeconds();
      const defaultTrackIds = castPlayback.tracks
        .map((track, index) => (track.default ? index + 1 : null))
        .filter((id): id is number => id !== null);
      if (defaultTrackIds.length > 0) {
        loadRequest.activeTrackIds = defaultTrackIds;
      }

      await session.loadMedia(loadRequest);
      markCastOwnedSession(castPlayback.playbackSessionId);
      video?.pause();
      castLaunchState = "connected";
    } catch {
      castLaunchState = "error";
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
        playerUiState = "starting";
        saveState = "idle";
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
          if (!disposed && !hasStartedPlayback)
            playerUiState = "autoplayBlocked";
        }
      };

      const prepareInitialPlayback = () => {
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
        clearTransientOverlayIfPlaying();
      };
      const onLoadStart = () => {
        if (!hasStartedPlayback) playerUiState = "starting";
      };
      const onCanPlay = () => {
        clearTransientOverlayIfPlaying();
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
        const decision = hlsSeekController.seeking();
        playerUiState = decision.uiState;
      };
      const onSeeked = () => {
        const decision = hlsSeekController.seeked({
          relativeSeconds: Number.isFinite(player.currentTime)
            ? player.currentTime
            : 0,
          paused: player.paused,
        });
        playerUiState = decision.uiState;
      };
      const onPlayerError = () => {
        playerUiState = "error";
        restartHlsNearCurrentTime("native");
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
      player.addEventListener("playing", onPlaying);
      player.addEventListener("pause", onPause);
      player.addEventListener("waiting", onWaiting);
      player.addEventListener("stalled", onWaiting);
      player.addEventListener("timeupdate", onTimeUpdate);
      player.addEventListener("seeking", onSeeking);
      player.addEventListener("seeked", onSeeked);
      player.addEventListener("error", onPlayerError);

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
    let disposed = false;
    let removeListener: (() => void) | undefined;

    void ensureCastFramework()
      .then((api) => {
        if (disposed) return;
        const context = configureCastFramework(api);
        const onSessionStateChanged = (event: { sessionState: string }) => {
          if (
            event.sessionState === api.cast.framework.SessionState.SESSION_ENDED
          ) {
            const sessionId = castOwnedPlaybackSessionId;
            releaseCastOwnedSession(sessionId);
            if (sessionId) cancelPlaybackSessionById(sessionId);
            castLaunchState = "idle";
          } else if (
            event.sessionState ===
              api.cast.framework.SessionState.SESSION_STARTED ||
            event.sessionState ===
              api.cast.framework.SessionState.SESSION_RESUMED
          ) {
            castAvailable = true;
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

    {#if castAvailable}
      <button
        class:active={castLaunchState === "connected"}
        class:error={castLaunchState === "error"}
        class="cast-button"
        type="button"
        aria-label="Cast"
        title="Cast"
        onclick={castPlayback}
        disabled={castLaunchState === "connecting"}
      >
        <Cast size={20} aria-hidden="true" />
      </button>
    {/if}

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
{:else if data.playback.status === "preparing"}
  <div class="video-shell placeholder-shell" aria-live="polite">
    <div class="player-overlay">
      <span class="overlay-spinner" aria-hidden="true"></span>
      <p>Starting playback</p>
    </div>
  </div>
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

  video {
    width: 100%;
    max-height: min(72vh, calc(100dvh - 9rem));
    background: #000;
    display: block;
  }

  .cast-button {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 2;
    width: 2.5rem;
    height: 2.5rem;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 8px;
    background: rgba(8, 12, 16, 0.68);
    color: #f8fafc;
  }

  .cast-button:hover:not(:disabled),
  .cast-button.active {
    background: rgba(30, 90, 78, 0.84);
    border-color: rgba(95, 217, 180, 0.55);
  }

  .cast-button.error {
    background: rgba(127, 29, 29, 0.84);
    border-color: rgba(252, 165, 165, 0.5);
  }

  .cast-button:disabled {
    opacity: 0.72;
  }

  .placeholder-shell {
    min-height: min(56.25vw, 32rem);
    aspect-ratio: 16 / 9;
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
