<script lang="ts">
  import MediaHero from "$lib/components/MediaHero.svelte";
  import ShowWatchSummary from "$lib/components/ShowWatchSummary.svelte";
  import { formatEpisodeCode } from "$lib/media/format";
  import { Bookmark, BookmarkCheck, CirclePlay, Clapperboard, Compass, ExternalLink, Link2 } from "@lucide/svelte";

  let {
    title,
    posterUrl,
    backdropUrl,
    overview,
    genres,
    year,
    status,
    seasonCountLabel,
    episodeCountLabel,
    nextEpisode,
    watchHref,
    watchedCount,
    totalEpisodes,
    progressPercent,
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
    genres: string[];
    year: number | null;
    status: string | null;
    seasonCountLabel: string;
    episodeCountLabel: string;
    nextEpisode?: {
      id: string;
      fileId: string | null;
      progressSeconds: number;
      seasonNumber: number | null;
      episodeNumber: number | null;
    };
    watchHref: (episode: { id: string; fileId: string | null }) => string;
    watchedCount: number;
    totalEpisodes: number;
    progressPercent: number;
    trailerHref: string | null;
    similarHref: string;
    inWatchlist: boolean;
    canManageShares: boolean;
    onShareOpen: () => void;
  } = $props();
</script>

<MediaHero {title} {posterUrl} {backdropUrl} {overview} {year} {genres} bottomMargin="2rem">
  {#snippet facts()}
    {#if status}<span>{status}</span>{/if}
    <span>{seasonCountLabel}</span>
    <span>{episodeCountLabel}</span>
  {/snippet}

  {#snippet actions()}
    {#if nextEpisode?.fileId}
      <a class="button primary-action" href={watchHref(nextEpisode)}>
        <CirclePlay size={19} aria-hidden="true" />
        {nextEpisode.progressSeconds > 0 ? "Resume" : "Play"}
      </a>
      <a class="button secondary" href={`/episodes/${nextEpisode.id}`}>
        <Clapperboard size={16} aria-hidden="true" />
        {formatEpisodeCode(nextEpisode) || "Episode"}
      </a>
    {/if}
  {/snippet}

  {#snippet secondaryActions()}
    {#if trailerHref}
      <a class="button text" href={trailerHref} target="_blank" rel="noreferrer">
        <ExternalLink size={16} aria-hidden="true" />
        Trailer
      </a>
    {/if}
    <a class="button text" href={similarHref}>
      <Compass size={16} aria-hidden="true" />
      Similar
    </a>
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
    {#if canManageShares}
      <button class="button text" type="button" onclick={onShareOpen}>
        <Link2 size={16} aria-hidden="true" />
        Share
      </button>
    {/if}
  {/snippet}

  {#snippet below()}
    <ShowWatchSummary {watchedCount} totalCount={totalEpisodes} {progressPercent} />
  {/snippet}
</MediaHero>
