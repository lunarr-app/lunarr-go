<script lang="ts">
  import { browser } from "$app/environment";
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import MediaPlayer from "$lib/player/MediaPlayer.svelte";
  import PlayerShell from "$lib/player/PlayerShell.svelte";
  import { shouldClosePlaybackModalOnKeydown } from "$lib/playback/controls";
  import { buildClientPlaybackApiHref } from "$lib/playback/client-href";
  import { webPlaybackApiPath } from "$lib/playback/capabilities";
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
    return buildClientPlaybackApiHref({
      pathname: webPlaybackApiPath(id),
      sourceUrl,
    });
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
    playbackData = null;

    void fetch(href, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "Playback could not be started.");
        }
        if (token !== reloadToken) return;
        playbackData = (await response.json()) as PlaybackData;
      })
      .catch((fetchError) => {
        if (controller.signal.aborted || token !== reloadToken) return;
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
    background: #000;
    padding: 0;
  }

  .modal {
    width: 100%;
    height: 100dvh;
    max-height: 100dvh;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    border: 0;
    border-radius: 0;
    background: #000;
    box-shadow: none;
    padding: 0;
    overflow: hidden;
  }

  p,
  h2 {
    margin: 0;
  }

  .player-frame {
    min-width: 0;
    min-height: 0;
    height: 100%;
    display: grid;
    gap: 0;
  }

  .player-frame :global(.video-shell) {
    width: 100%;
    height: 100%;
    max-height: none;
    min-height: 0;
    aspect-ratio: auto;
    border-radius: 0;
  }

  .player-frame :global(.placeholder-shell) {
    width: 100%;
    height: 100%;
    max-height: none;
    min-height: 0;
    aspect-ratio: auto;
  }

  .message {
    align-self: center;
    justify-self: center;
    width: min(100% - 2rem, 36rem);
    display: grid;
    gap: 0.35rem;
    border: 1px solid var(--color-warning-border);
    border-radius: 8px;
    background: var(--color-warning-soft);
    padding: var(--space-3);
  }

  .player-frame :global(.playback-message) {
    align-self: center;
    justify-self: center;
    width: min(100% - 2rem, 36rem);
  }

  .message h2 {
    font-size: 1.05rem;
  }

  .message p {
    color: var(--color-subtle);
  }
</style>
