<script lang="ts">
  import MediaHero from "$lib/components/MediaHero.svelte";
  import { formatEpisodeCode } from "$lib/media/format";
  import { Calendar, CirclePlay, ExternalLink, Link2, Sparkles, Star } from "@lucide/svelte";

  let {
    title,
    posterUrl,
    backdropUrl,
    overview,
    genres,
    year,
    status,
    ratingLabel,
    seasonCountLabel,
    episodeCountLabel,
    nextEpisode,
    watchHref,
    watchedCount,
    totalEpisodes,
    progressPercent,
    trailerHref,
    similarHref,
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
    ratingLabel: string | null;
    seasonCountLabel: string;
    episodeCountLabel: string;
    nextEpisode:
      | {
          id: string;
          fileId: string | null;
          progressSeconds: number;
          seasonNumber: number | null;
          episodeNumber: number | null;
        }
      | undefined;
    watchHref: (episode: { id: string; fileId: string | null }) => string;
    watchedCount: number;
    totalEpisodes: number;
    progressPercent: number;
    trailerHref: string | null;
    similarHref: string;
    canManageShares: boolean;
    onShareOpen: () => void;
  } = $props();
</script>

<MediaHero {title} {posterUrl} {backdropUrl} {overview} {genres} bottomMargin="2rem">
  {#snippet facts()}
    {#if year}<span><Calendar size={15} aria-hidden="true" />{year}</span>{/if}
    {#if status}<span>{status}</span>{/if}
    {#if ratingLabel}
      <span><Star size={15} aria-hidden="true" />{ratingLabel}</span>
    {/if}
    <span>{seasonCountLabel}</span>
    <span>{episodeCountLabel}</span>
  {/snippet}

  {#snippet actions()}
    {#if nextEpisode?.fileId}
      <a class="button primary-action" href={watchHref(nextEpisode)}>
        <CirclePlay size={19} aria-hidden="true" />
        {nextEpisode.progressSeconds > 0 ? "Resume" : "Play"}
      </a>
      <a class="button secondary" href={`/episodes/${nextEpisode.id}`}>{formatEpisodeCode(nextEpisode) || "Episode"}</a>
    {/if}
    {#if trailerHref}
      <a class="button secondary" href={trailerHref} target="_blank" rel="noreferrer">
        <ExternalLink size={16} aria-hidden="true" />
        Trailer
      </a>
    {/if}
    <a class="button secondary" href={similarHref}>
      <Sparkles size={16} aria-hidden="true" />
      Similar
    </a>
    {#if canManageShares}
      <button class="button secondary" type="button" onclick={onShareOpen}>
        <Link2 size={16} aria-hidden="true" />
        Share
      </button>
    {/if}
  {/snippet}

  {#snippet below()}
    <div class="watch-summary" aria-label={`${watchedCount} of ${totalEpisodes} episodes watched`}>
      <div>
        <strong>{watchedCount}/{totalEpisodes}</strong>
        <span>Watched</span>
      </div>
      <div class="watch-progress" aria-hidden="true">
        <span style={`width: ${progressPercent}%`}></span>
      </div>
    </div>
  {/snippet}
</MediaHero>

<style>
  .primary-action {
    min-width: 8rem;
  }

  .watch-summary {
    display: grid;
    grid-template-columns: auto minmax(10rem, 18rem);
    gap: 0.8rem;
    align-items: center;
  }

  .watch-summary > div:first-child {
    display: grid;
    gap: 0.05rem;
  }

  .watch-summary strong {
    font-size: 1.05rem;
  }

  .watch-summary span {
    color: var(--color-muted);
    font-size: 0.84rem;
  }

  .watch-progress {
    overflow: hidden;
    height: 0.45rem;
    border-radius: 999px;
    background: var(--color-border-strong);
  }

  .watch-progress span {
    display: block;
    height: 100%;
    min-width: 0;
    border-radius: inherit;
    background: var(--color-accent);
  }

  @media (max-width: 760px) {
    .watch-summary {
      grid-template-columns: 1fr;
    }
  }
</style>
