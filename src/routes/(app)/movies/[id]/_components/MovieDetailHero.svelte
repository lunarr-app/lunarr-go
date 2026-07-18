<script lang="ts">
  import MediaHero from "$lib/components/MediaHero.svelte";
  import MediaHeroPlaybackActions from "$lib/components/MediaHeroPlaybackActions.svelte";
  import MediaHeroResumeBar from "$lib/components/MediaHeroResumeBar.svelte";
  import { Bookmark, BookmarkCheck, Compass, ExternalLink, Link2 } from "@lucide/svelte";

  let {
    title,
    posterUrl,
    backdropUrl,
    overview,
    year,
    genres,
    primaryFile,
    primaryHref,
    primaryActionLabel,
    hasCompletedProgress,
    resumeLabel,
    resumePercent,
    trailerHref,
    similarHref,
    inWatchlist,
    canManageShares,
    onShareOpen,
  }: {
    title: string;
    posterUrl: string | null;
    backdropUrl: string | null;
    overview: string | null;
    year: number | null;
    genres: string[];
    primaryFile?: { id: string };
    primaryHref: string;
    primaryActionLabel: string;
    hasCompletedProgress: boolean;
    resumeLabel: string | null;
    resumePercent: number;
    trailerHref: string | null;
    similarHref: string;
    inWatchlist: boolean;
    canManageShares: boolean;
    onShareOpen: () => void;
  } = $props();
</script>

<MediaHero {title} {posterUrl} {backdropUrl} {overview} {year} {genres}>
  {#snippet actions()}
    <MediaHeroPlaybackActions {primaryFile} {primaryHref} {primaryActionLabel} {hasCompletedProgress} />
  {/snippet}

  {#snippet secondaryActions()}
    <form class="inline-action" method="POST" action="?/watchlist">
      <button class="text" type="submit">
        {#if inWatchlist}
          <BookmarkCheck size={16} aria-hidden="true" />
          In Watchlist
        {:else}
          <Bookmark size={16} aria-hidden="true" />
          Watchlist
        {/if}
      </button>
    </form>
    <a class="button text" href={similarHref}>
      <Compass size={16} aria-hidden="true" />
      Similar
    </a>
    {#if trailerHref}
      <a class="button text" href={trailerHref} target="_blank" rel="noreferrer">
        <ExternalLink size={16} aria-hidden="true" />
        Trailer
      </a>
    {/if}
    {#if canManageShares}
      <button class="button text" type="button" onclick={onShareOpen}>
        <Link2 size={16} aria-hidden="true" />
        Share
      </button>
    {/if}
  {/snippet}

  {#snippet below()}
    <MediaHeroResumeBar {resumeLabel} {resumePercent} />
  {/snippet}
</MediaHero>
