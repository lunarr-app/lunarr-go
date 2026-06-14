<script lang="ts">
  import { browser } from "$app/environment";
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import MediaPlayer from "$lib/components/MediaPlayer.svelte";
  import PlayerShell from "$lib/components/PlayerShell.svelte";
  import { appendClientPlaybackCapabilityParams, detectClientPlaybackCapabilities } from "$lib/playback/capabilities";
  import { shouldClosePlaybackModalOnKeydown } from "$lib/playback/controls";
  import type { PlaybackData } from "$lib/server/playback";

  let playbackData: PlaybackData | null = $state(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let reloadToken = $state(0);
  let modalPanel: HTMLDivElement | null = $state(null);
  let progressInvalidationTimer: ReturnType<typeof setTimeout> | null = null;

  const mediaItemId = $derived(page.url.searchParams.get("play")?.trim() || null);
  const modalOpen = $derived(Boolean(mediaItemId));
  const playbackRequestHref = $derived.by(() => (mediaItemId ? playbackApiHref(mediaItemId, page.url) : null));

  function playbackApiHref(id: string, sourceUrl: URL) {
    const apiUrl = new URL(`/api/playback/${encodeURIComponent(id)}`, sourceUrl.origin);
    for (const key of ["file", "start", "transcode", "target"]) {
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
    return window.MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
  }

  function closeHref(sourceUrl = page.url) {
    const url = new URL(sourceUrl);
    for (const key of ["play", "file", "start", "transcode", "target"]) {
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
        error = fetchError instanceof Error ? fetchError.message : "Playback could not be started.";
      })
      .finally(() => {
        if (!controller.signal.aborted && token === reloadToken) loading = false;
      });

    return () => controller.abort();
  });

  $effect(() => {
    if (!browser || !modalOpen) return;
    modalPanel?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        shouldClosePlaybackModalOnKeydown({
          key: event.key,
          defaultPrevented: event.defaultPrevented,
        })
      ) {
        closeModal();
      }
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
    onpointerdown={(event) => event.target === event.currentTarget && closeModal()}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label={playbackData?.item.title ?? "Playback"}
      tabindex="-1"
      bind:this={modalPanel}
    >
      <div class="player-frame">
        {#if playbackData}
          <MediaPlayer
            data={playbackData}
            onClose={closeModal}
            onProgressSaved={invalidatePageAfterProgress}
            onReload={requestReload}
            onReposition={repositionPlayback}
          />
        {:else if error}
          <section class="message" aria-live="polite">
            <h2>Playback unavailable</h2>
            <p>{error}</p>
          </section>
        {:else}
          <PlayerShell title="Starting playback" busyLabel="Starting playback" onClose={closeModal} />
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
    width: min(100%, 80rem);
    max-height: calc(100dvh - 2rem);
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    border: 0;
    border-radius: 8px;
    background: transparent;
    box-shadow: none;
    padding: 0;
    overflow: visible;
  }

  p,
  h2 {
    margin: 0;
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
    border: 1px solid var(--color-warning-border);
    border-radius: 8px;
    background: var(--color-warning-soft);
    padding: 1rem;
  }

  .message h2 {
    font-size: 1.05rem;
  }

  .message p {
    color: var(--color-subtle);
  }

  @media (max-width: 720px) {
    .overlay {
      align-items: center;
      padding: 0;
    }

    .modal {
      width: 100%;
      max-height: 100dvh;
      border-radius: 0;
    }
  }
</style>
