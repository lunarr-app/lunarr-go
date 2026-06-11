<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, tick } from "svelte";
  import {
    hlsRepositionHref,
    initialPlayerTimelineSeconds,
    shouldReloadHlsPlaybackDataOnError,
    shouldRecoverHlsPlaybackError
  } from "$lib/playback/seek";
  import {
    activePlaybackSessionId,
    cancelPlaybackSessionOnce,
    postWithBeaconFallback,
    shouldCancelCapturedPlaybackSession,
    shouldInvalidateAfterHeartbeat
  } from "$lib/playback/session";
  import type { PlaybackData, PlaybackDecision } from "$lib/server/playback";

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
  let hasPlaybackActivity = false;
  let playbackActivityKey: string | null = null;
  const cancelledPlaybackSessions = new Set<string>();

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

      const currentPlayerTime = () =>
        Number.isFinite(player.currentTime) ? Math.max(0, player.currentTime) : 0;

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

        repositioning = true;
        const href = hlsRepositionHref({
          currentUrl: new URL(window.location.href),
          mediaFileId: playback.file.id,
          startSeconds: currentTime,
          forceTranscode: playback.mode === "remux"
        });
        if (href === currentPageHref()) {
          repositioning = false;
          return;
        }
        stopHlsTransport();
        flushProgress(sourceData);
        cancelPlaybackSession(playback);
        onReposition(href);
      };

      const onTimeUpdate = () => {
        if (!player.seeking) lastPlaybackTime = currentPlayerTime();
      };
      const onPlayerError = () => restartHlsNearCurrentTime("native");

      if (player.readyState >= HTMLMediaElement.HAVE_METADATA) {
        seekToStart();
      } else {
        player.addEventListener("loadedmetadata", seekToStart, { once: true });
      }
      player.addEventListener("timeupdate", onTimeUpdate);
      player.addEventListener("error", onPlayerError);

      const interval = window.setInterval(() => void save(false, sourceData), 10000);
      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") flushProgress(sourceData);
      };
      const flushCapturedProgress = () => flushProgress(sourceData);
      window.addEventListener("pagehide", flushCapturedProgress);
      document.addEventListener("visibilitychange", onVisibilityChange);

      cleanup = () => {
        player.removeEventListener("loadedmetadata", seekToStart);
        player.removeEventListener("timeupdate", onTimeUpdate);
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
  <video
    bind:this={video}
    controls
    playsinline
    preload="metadata"
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
  video {
    width: 100%;
    max-height: min(72vh, calc(100dvh - 9rem));
    background: #000;
    border-radius: 8px;
    display: block;
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
