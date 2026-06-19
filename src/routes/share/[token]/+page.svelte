<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import GuestPlaybackShell from "$lib/components/GuestPlaybackShell.svelte";
  import GuestShareEpisodeList from "$lib/components/GuestShareEpisodeList.svelte";
  import LunarrBrand from "$lib/components/LunarrBrand.svelte";
  import MediaHero from "$lib/components/MediaHero.svelte";
  import { formatMediaDuration } from "$lib/media/format";
  import { buildClientPlaybackApiHref } from "$lib/playback/client-href";
  import { formatShareExpiryDescription } from "$lib/shares/format";
  import { shareClosePlaybackHref, sharePlaybackApiPath, sharePlaybackHref } from "$lib/shares/links";
  import { CirclePlay, Clock3 } from "@lucide/svelte";

  let { data } = $props();

  const mediaItemId = $derived(page.url.searchParams.get("play")?.trim() || null);
  const playerOpen = $derived(Boolean(mediaItemId));
  const playbackRequestHref = $derived.by(() =>
    mediaItemId
      ? buildClientPlaybackApiHref({
          pathname: sharePlaybackApiPath(data.share.token, mediaItemId),
          sourceUrl: page.url,
        })
      : null,
  );

  function closePlayer() {
    void goto(shareClosePlaybackHref(page.url), {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }

  function openPlayer(id: string) {
    void goto(sharePlaybackHref({ currentUrl: page.url, mediaItemId: id }), {
      replaceState: false,
      noScroll: true,
      keepFocus: true,
    });
  }

  function repositionPlayback(href: string) {
    void goto(href, {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }

  const expiryLabel = $derived(formatShareExpiryDescription(data.share.expiresAt));
  const runtimeLabel = $derived(
    data.share.kind === "movie" && data.share.runtimeSeconds ? formatMediaDuration(data.share.runtimeSeconds) : null,
  );
</script>

<svelte:head>
  <title>{data.share.title} · Lunarr Share</title>
  <meta name="description" content={`Watch ${data.share.title} via a shared Lunarr link.`} />
</svelte:head>

{#if playerOpen}
  <GuestPlaybackShell
    {playbackRequestHref}
    persistProgress={false}
    onClose={closePlayer}
    onReposition={repositionPlayback}
  />
{:else}
  <div class="share-shell" class:share-shell-show={data.share.kind === "show"}>
    <header class="share-header">
      <div class="share-inner">
        <LunarrBrand />
        <p class="expiry">
          <Clock3 size={16} aria-hidden="true" />
          {expiryLabel}
        </p>
      </div>
    </header>

    <MediaHero
      standalone
      title={data.share.title}
      posterUrl={data.share.posterUrl}
      backdropUrl={data.share.backdropUrl}
      overview={data.share.overview}
      bottomMargin="0"
    >
      {#snippet facts()}
        {#if runtimeLabel}
          <span>
            <Clock3 size={14} aria-hidden="true" />
            {runtimeLabel}
          </span>
        {/if}
      {/snippet}

      {#snippet actions()}
        {#if data.share.kind === "movie"}
          {@const movieShare = data.share}
          {#if movieShare.fileId}
            <button type="button" onclick={() => openPlayer(movieShare.movieId)}>
              <CirclePlay size={18} aria-hidden="true" />
              Play
            </button>
          {/if}
        {/if}
      {/snippet}
    </MediaHero>

    {#if data.share.kind === "show"}
      <div class="share-body">
        <GuestShareEpisodeList seasons={data.share.seasons} onPlay={openPlayer} />
      </div>
    {/if}
  </div>
{/if}

<style>
  .share-shell {
    display: grid;
    grid-template-rows: auto auto;
  }

  .share-shell-show {
    min-height: 100dvh;
    grid-template-rows: auto auto 1fr;
  }

  .share-inner {
    width: min(100%, 64rem);
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .share-header {
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-strong);
    backdrop-filter: blur(14px);
    padding: 0.65rem clamp(1rem, 3vw, 2.4rem);
  }

  .expiry {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--color-subtle);
    font-size: 0.95rem;
  }

  .share-body {
    width: min(100%, 64rem);
    margin: 0 auto;
    padding: 1.5rem clamp(1rem, 3vw, 2.4rem) 2rem;
  }

  @media (max-width: 760px) {
    .share-inner {
      align-items: flex-start;
    }
  }
</style>
