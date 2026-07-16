<script lang="ts">
  import MediaHero from "$lib/components/MediaHero.svelte";
  import ShowWatchSummary from "$lib/components/ShowWatchSummary.svelte";
  import { formatEpisodeCode } from "$lib/media/format";
  import { Calendar, CirclePlay, Eye, EyeOff, Star } from "@lucide/svelte";

  let {
    showTitle,
    showYear,
    showStatus,
    voteAverage,
    seasonTitle,
    posterUrl,
    backdropUrl,
    overview,
    genres,
    seasonProgressLabel,
    nextEpisode,
    watchHref,
    playableCount,
    seasonComplete,
    watchedCount,
    episodeCount,
    progressPercent,
  }: {
    showTitle: string;
    showYear: number | null;
    showStatus: string | null;
    voteAverage: number | null;
    seasonTitle: string;
    posterUrl: string | null;
    backdropUrl: string | null;
    overview: string | null;
    genres: string[];
    seasonProgressLabel: string;
    nextEpisode?: {
      id: string;
      fileId: string | null;
      progressSeconds: number;
      seasonNumber: number | null;
      episodeNumber: number | null;
    };
    watchHref: (episode: { id: string; fileId: string | null }) => string;
    playableCount: number;
    seasonComplete: boolean;
    watchedCount: number;
    episodeCount: number;
    progressPercent: number;
  } = $props();
</script>

<MediaHero title={`${showTitle} · ${seasonTitle}`} {posterUrl} {backdropUrl} {overview} {genres} bottomMargin="1.6rem">
  {#snippet facts()}
    {#if showYear}<span><Calendar size={15} aria-hidden="true" />{showYear}</span>{/if}
    {#if showStatus}<span>{showStatus}</span>{/if}
    {#if voteAverage}
      <span><Star size={15} aria-hidden="true" />{voteAverage.toFixed(1)}</span>
    {/if}
    <span>{seasonProgressLabel}</span>
  {/snippet}

  {#snippet actions()}
    {#if nextEpisode?.fileId}
      <a class="button primary-action" href={watchHref(nextEpisode)}>
        <CirclePlay size={19} aria-hidden="true" />
        {nextEpisode.progressSeconds > 0 ? "Resume" : "Play"}
      </a>
      <a class="button secondary" href={`/episodes/${nextEpisode.id}`}>{formatEpisodeCode(nextEpisode) || "Episode"}</a>
    {/if}
    {#if playableCount > 0}
      <form class="season-bulk-action" method="POST" action="?/seasonWatched">
        <input type="hidden" name="completed" value={seasonComplete ? "false" : "true"} />
        <button class="button secondary" type="submit">
          {#if seasonComplete}
            <EyeOff size={16} aria-hidden="true" />
            Unwatch season
          {:else}
            <Eye size={16} aria-hidden="true" />
            Watched season
          {/if}
        </button>
      </form>
    {/if}
  {/snippet}

  {#snippet below()}
    <ShowWatchSummary {watchedCount} totalCount={episodeCount} {progressPercent} />
  {/snippet}
</MediaHero>

<style>
  .season-bulk-action {
    display: contents;
  }
</style>
