<script lang="ts">
  import { browser } from "$app/environment";
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { X } from "@lucide/svelte";
  import MediaPlayer from "$lib/components/MediaPlayer.svelte";
  import {
    appendClientPlaybackCapabilityParams,
    detectClientPlaybackCapabilities,
  } from "$lib/playback/capabilities";
  import type { PlaybackData } from "$lib/server/playback";

  let playbackData: PlaybackData | null = $state(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let reloadToken = $state(0);
  let closeButton: HTMLButtonElement | null = $state(null);
  let progressInvalidationTimer: ReturnType<typeof setTimeout> | null = null;

  const mediaItemId = $derived(
    page.url.searchParams.get("play")?.trim() || null,
  );
  const modalOpen = $derived(Boolean(mediaItemId));
  const playbackRequestHref = $derived.by(() =>
    mediaItemId ? playbackApiHref(mediaItemId, page.url) : null,
  );

  function playbackApiHref(id: string, sourceUrl: URL) {
    const apiUrl = new URL(
      `/api/playback/${encodeURIComponent(id)}`,
      sourceUrl.origin,
    );
    for (const key of ["file", "start", "transcode"]) {
      const value = sourceUrl.searchParams.get(key);
      if (value) apiUrl.searchParams.set(key, value);
    }
    if (browser) {
      const video = document.createElement("video");
      appendClientPlaybackCapabilityParams(
        apiUrl.searchParams,
        detectClientPlaybackCapabilities((type) => video.canPlayType(type), {
          mediaSourceSupported: canUseFmp4MediaSource(),
        }),
      );
    }
    return `${apiUrl.pathname}${apiUrl.search}`;
  }

  function canUseFmp4MediaSource() {
    if (!("MediaSource" in window)) return false;
    return window.MediaSource.isTypeSupported(
      'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
    );
  }

  function closeHref(sourceUrl = page.url) {
    const url = new URL(sourceUrl);
    for (const key of ["play", "file", "start", "transcode"]) {
      url.searchParams.delete(key);
    }
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function requestReload() {
    reloadToken += 1;
  }

  function closeModal() {
    if (progressInvalidationTimer) {
      clearTimeout(progressInvalidationTimer);
      progressInvalidationTimer = null;
    }
    void goto(closeHref(), {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    }).then(() => invalidateAll());
  }

  function repositionPlayback(href: string) {
    void goto(href, {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }

  function invalidatePageAfterProgress() {
    if (progressInvalidationTimer) return;
    progressInvalidationTimer = setTimeout(() => {
      progressInvalidationTimer = null;
      void invalidateAll();
    }, 750);
  }

  $effect(() => {
    if (!browser) return;
    const href = playbackRequestHref;
    const token = reloadToken;
    if (!href) {
      playbackData = null;
      loading = false;
      error = null;
      return;
    }

    const controller = new AbortController();
    loading = true;
    error = null;

    void fetch(href, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "Playback could not be started.");
        }
        playbackData = (await response.json()) as PlaybackData;
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) return;
        playbackData = null;
        error =
          fetchError instanceof Error
            ? fetchError.message
            : "Playback could not be started.";
      })
      .finally(() => {
        if (!controller.signal.aborted && token === reloadToken)
          loading = false;
      });

    return () => controller.abort();
  });

  $effect(() => {
    if (!browser || !modalOpen) return;
    closeButton?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      if (progressInvalidationTimer) {
        clearTimeout(progressInvalidationTimer);
        progressInvalidationTimer = null;
      }
    };
  });
</script>

{#if modalOpen}
  <div
    class="overlay"
    role="presentation"
    onpointerdown={(event) =>
      event.target === event.currentTarget && closeModal()}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label={playbackData?.item.title ?? "Playback"}
    >
      <header>
        <div>
          <p>Now playing</p>
          <h2>{playbackData?.item.title ?? "Starting playback"}</h2>
        </div>
        <button
          class="icon-button"
          type="button"
          aria-label="Close player"
          bind:this={closeButton}
          onclick={closeModal}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div class="player-frame">
        {#if playbackData}
          <MediaPlayer
            data={playbackData}
            onProgressSaved={invalidatePageAfterProgress}
            onReload={requestReload}
            onReposition={repositionPlayback}
          />
        {:else if error}
          <section class="message" aria-live="polite">
            <h2>Playback unavailable</h2>
            <p>{error}</p>
          </section>
        {:else if loading}
          <section class="message" aria-live="polite">
            <h2>Starting playback</h2>
            <p>Preparing the selected file.</p>
          </section>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.72);
    padding: clamp(0.65rem, 2vw, 1.5rem);
  }

  .modal {
    width: min(100%, 68rem);
    max-height: calc(100dvh - 2rem);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.8rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    background: #070b0f;
    box-shadow: 0 1.8rem 5rem rgba(0, 0, 0, 0.5);
    padding: 0.85rem;
    overflow: hidden;
  }

  header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: start;
  }

  header div {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  p,
  h2 {
    margin: 0;
  }

  header p {
    color: #95a4ae;
    font-size: 0.82rem;
    font-weight: 750;
    text-transform: uppercase;
  }

  header h2 {
    overflow: hidden;
    font-size: 1.08rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .icon-button {
    width: 2.2rem;
    min-height: 2.2rem;
    border-radius: 6px;
    padding: 0;
  }

  .player-frame {
    min-width: 0;
    min-height: 0;
    display: grid;
    gap: 0.6rem;
  }

  .message {
    display: grid;
    gap: 0.35rem;
    border: 1px solid rgba(255, 217, 154, 0.16);
    border-radius: 8px;
    background: rgba(255, 217, 154, 0.06);
    padding: 1rem;
  }

  .message h2 {
    font-size: 1.05rem;
  }

  .message p {
    color: #b7c3cc;
  }

  @media (max-width: 720px) {
    .overlay {
      align-items: end;
      padding: 0;
    }

    .modal {
      width: 100%;
      max-height: 100dvh;
      border-right: 0;
      border-bottom: 0;
      border-left: 0;
      border-radius: 8px 8px 0 0;
    }
  }
</style>
