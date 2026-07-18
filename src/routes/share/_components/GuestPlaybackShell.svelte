<script lang="ts">
  import { browser } from "$app/environment";
  import MediaPlayer from "$lib/player/MediaPlayer.svelte";
  import PlayerShell from "$lib/player/PlayerShell.svelte";
  import { shouldClosePlaybackModalOnKeydown } from "$lib/playback/controls";
  import type { PlaybackData } from "$lib/server/playback";

  let {
    playbackRequestHref,
    persistProgress = true,
    onClose,
    onReposition,
  }: {
    playbackRequestHref: string | null;
    persistProgress?: boolean;
    onClose: () => void;
    onReposition: (href: string) => void;
  } = $props();

  let playbackData: PlaybackData | null = $state(null);
  let errorMessage: string | null = $state(null);
  let reloadToken = $state(0);

  function requestReload() {
    reloadToken += 1;
  }

  $effect(() => {
    if (!browser) return;
    const href = playbackRequestHref;
    const token = reloadToken;
    if (!href) {
      playbackData = null;
      errorMessage = null;
      return;
    }

    const controller = new AbortController();
    playbackData = null;
    errorMessage = null;

    void fetch(href, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.detail ?? "Playback could not be started.");
        }
        if (token !== reloadToken) return;
        playbackData = (await response.json()) as PlaybackData;
      })
      .catch((fetchError) => {
        if (controller.signal.aborted || token !== reloadToken) return;
        playbackData = null;
        errorMessage = fetchError instanceof Error ? fetchError.message : "Playback could not be started.";
      });

    return () => controller.abort();
  });

  $effect(() => {
    if (!browser || !playbackRequestHref) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        shouldClosePlaybackModalOnKeydown({
          key: event.key,
          defaultPrevented: event.defaultPrevented,
        })
      ) {
        onClose();
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  });
</script>

<div class="player-overlay">
  <div class="player-frame">
    {#if playbackData}
      <MediaPlayer
        data={playbackData}
        {persistProgress}
        {onClose}
        onProgressSaved={() => undefined}
        onReload={requestReload}
        {onReposition}
      />
    {:else if errorMessage}
      <section class="message" aria-live="polite">
        <h2>Playback unavailable</h2>
        <p>{errorMessage}</p>
        <button class="secondary" type="button" onclick={onClose}>Back</button>
      </section>
    {:else}
      <PlayerShell title="Starting playback" busyLabel="Starting playback" {onClose} />
    {/if}
  </div>
</div>

<style>
  .player-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    background: #000;
  }

  .player-frame {
    min-width: 0;
    min-height: 0;
    height: 100%;
    display: grid;
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
    gap: 0.75rem;
    border: 1px solid var(--color-warning-border);
    border-radius: 8px;
    background: var(--color-warning-soft);
    padding: var(--space-3);
  }

  .message h2,
  .message p {
    margin: 0;
  }

  .message p {
    color: var(--color-subtle);
  }
</style>
