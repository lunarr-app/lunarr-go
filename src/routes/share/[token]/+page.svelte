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
  import { CirclePlay, Clock3, Tv } from "@lucide/svelte";

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

  const playableEpisodeCount = $derived.by(() => {
    if (data.share.kind !== "show") return 0;
    return data.share.seasons.reduce((count, season) => count + season.episodes.length, 0);
  });

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
  <div class="share-shell">
    <header class="share-header">
      <div class="share-frame share-header-row">
        <LunarrBrand />
        <p class="expiry">
          <Clock3 size={16} aria-hidden="true" />
          {expiryLabel}
        </p>
      </div>
    </header>

    <div class="share-hero">
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
          {#if data.share.kind === "show" && playableEpisodeCount > 0}
            <span>
              <Tv size={14} aria-hidden="true" />
              {playableEpisodeCount} episode{playableEpisodeCount === 1 ? "" : "s"}
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
    </div>

    {#if data.share.kind === "show"}
      <main class="share-main">
        <div class="share-frame">
          <GuestShareEpisodeList seasons={data.share.seasons} onPlay={openPlayer} />
        </div>
      </main>
    {/if}
  </div>
{/if}

<style>
  .share-shell {
    --share-gutter: clamp(1rem, 3vw, 2.4rem);
    --share-max-width: 64rem;
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    background: var(--color-bg);
  }

  .share-frame {
    width: 100%;
    max-width: var(--share-max-width);
    margin: 0 auto;
  }

  .share-header {
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-strong);
    backdrop-filter: blur(14px);
    padding: 0.65rem var(--share-gutter);
  }

  .share-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .expiry {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--color-subtle);
    font-size: 0.95rem;
  }

  .share-hero {
    padding-inline: var(--share-gutter);
  }

  .share-hero :global(.hero.standalone) {
    min-height: clamp(16rem, 38vh, 26rem);
    padding-inline: 0;
    padding-block: clamp(1.5rem, 3vw, 2.25rem);
  }

  .share-hero :global(.hero.standalone .hero-inner) {
    min-height: 0;
  }

  .share-main {
    flex: 1;
    padding: 1.5rem var(--share-gutter) 2rem;
  }

  @media (max-width: 760px) {
    .share-header-row {
      align-items: flex-start;
    }
  }
</style>
