<script lang="ts">
  import { page } from "$app/state";
  import MediaHero from "$lib/components/MediaHero.svelte";
  import { formatEpisodeCode } from "$lib/media/format";
  import { playbackModalHref } from "$lib/playback/links";
  import { Calendar, Check, ChevronLeft, ChevronRight, CirclePlay, Clock3, RotateCcw, Star } from "@lucide/svelte";

  let { data, form } = $props();

  type Episode = (typeof data.season.episodes)[number];

  const currentSeasonIndex = $derived(data.seasons.findIndex((season) => season.id === data.season.id));
  const previousSeason = $derived(currentSeasonIndex > 0 ? data.seasons[currentSeasonIndex - 1] : null);
  const nextSeason = $derived(
    currentSeasonIndex >= 0 && currentSeasonIndex < data.seasons.length - 1
      ? data.seasons[currentSeasonIndex + 1]
      : null,
  );
  const watchedCount = $derived(data.season.episodes.filter((episode) => episode.completed).length);
  const episodeCount = $derived(data.season.episodes.length);
  const playableCount = $derived(data.season.episodes.filter((episode) => episode.fileId).length);
  const missingCount = $derived(episodeCount - playableCount);
  const playableWatchedCount = $derived(
    data.season.episodes.filter((episode) => episode.fileId && episode.completed).length,
  );
  const seasonComplete = $derived(playableCount > 0 && playableWatchedCount === playableCount);
  const progressPercent = $derived(episodeCount > 0 ? Math.round((watchedCount / episodeCount) * 100) : 0);
  const nextEpisode = $derived(
    data.season.episodes.find((episode) => !episode.completed && episode.progressSeconds > 0 && episode.fileId) ??
      data.season.episodes.find((episode) => !episode.completed && episode.fileId) ??
      data.season.episodes.find((episode) => episode.fileId),
  );
  const episodeLabel = $derived(`${episodeCount} ${episodeCount === 1 ? "episode" : "episodes"}`);
  const seasonProgressLabel = $derived.by(() => {
    if (episodeCount === 0) return episodeLabel;
    if (missingCount > 0) return `${episodeLabel} · ${missingCount} missing · ${watchedCount} watched`;
    if (watchedCount === episodeCount) return `${episodeLabel} · complete`;
    return `${episodeLabel} · ${watchedCount} watched`;
  });

  function episodeCode(episode: Pick<Episode, "seasonNumber" | "episodeNumber">) {
    return formatEpisodeCode(episode);
  }

  function watchHref(episode: Pick<Episode, "id" | "fileId">) {
    return playbackModalHref({
      currentUrl: page.url,
      mediaItemId: episode.id,
      mediaFileId: episode.fileId,
    });
  }

  function seasonHref(season: Pick<(typeof data.seasons)[number], "id">) {
    return `/shows/${data.show.id}/seasons/${season.id}`;
  }

  function runtimeLabel(seconds: number | null) {
    return seconds ? `${Math.round(seconds / 60)} min` : null;
  }

  function episodeProgressLabel(episode: Pick<Episode, "completed" | "durationSeconds" | "progressSeconds">) {
    if (episode.completed || episode.progressSeconds <= 0) return null;
    if (!episode.durationSeconds) return "In progress";
    const percent = Math.min(99, Math.max(1, Math.round((episode.progressSeconds / episode.durationSeconds) * 100)));
    return `${percent}%`;
  }
</script>

<svelte:head>
  <title>{data.show.title} {data.season.title} - Lunarr</title>
  <meta name="description" content={`Browse ${data.season.title} episodes for ${data.show.title} in Lunarr.`} />
</svelte:head>

<MediaHero
  title={`${data.show.title} · ${data.season.title}`}
  posterUrl={data.season.posterUrl ?? data.show.posterUrl}
  backdropUrl={data.show.backdropUrl}
  overview={data.show.overview}
  genres={data.show.genres.slice(0, 4)}
  bottomMargin="1.6rem"
>
  {#snippet facts()}
    {#if data.show.year}<span><Calendar size={15} aria-hidden="true" />{data.show.year}</span>{/if}
    {#if data.show.status}<span>{data.show.status}</span>{/if}
    {#if data.show.voteAverage}
      <span><Star size={15} aria-hidden="true" />{data.show.voteAverage.toFixed(1)}</span>
    {/if}
    <span>{seasonProgressLabel}</span>
  {/snippet}

  {#snippet actions()}
    {#if nextEpisode?.fileId}
      <a class="button primary-action" href={watchHref(nextEpisode)}>
        <CirclePlay size={19} aria-hidden="true" />
        {nextEpisode.progressSeconds > 0 ? "Resume" : "Play"}
      </a>
      <a class="button secondary" href={`/episodes/${nextEpisode.id}`}>{episodeCode(nextEpisode) || "Episode"}</a>
    {/if}
  {/snippet}

  {#snippet below()}
    <div class="watch-summary" aria-label={`${watchedCount} of ${episodeCount} episodes watched`}>
      <div>
        <strong>{watchedCount}/{episodeCount}</strong>
        <span>Watched</span>
      </div>
      <div class="watch-progress" aria-hidden="true">
        <span style={`width: ${progressPercent}%`}></span>
      </div>
    </div>
  {/snippet}
</MediaHero>

{#if form?.error}
  <p class="error">{form.error}</p>
{/if}

<div class="season-return-row">
  <a class="show-return" href={`/shows/${data.show.id}`}>
    <ChevronLeft size={16} aria-hidden="true" />
    {data.show.title}
  </a>
  <div class="season-stepper">
    {#if previousSeason}
      <a class="step-link" href={seasonHref(previousSeason)}>
        <ChevronLeft size={16} aria-hidden="true" />
        <span>{previousSeason.title}</span>
      </a>
    {/if}
    {#if nextSeason}
      <a class="step-link" href={seasonHref(nextSeason)}>
        <span>{nextSeason.title}</span>
        <ChevronRight size={16} aria-hidden="true" />
      </a>
    {/if}
  </div>
</div>

<nav class="season-navigation" aria-label="Season navigation">
  <div class="season-toolbar">
    <div class="current-season">
      <strong>{data.season.title}</strong>
      <span>{seasonProgressLabel}</span>
    </div>
    {#if playableCount > 0}
      <form class="season-bulk-action" method="POST" action="?/seasonWatched">
        <input type="hidden" name="completed" value={seasonComplete ? "false" : "true"} />
        <button class="secondary compact">
          {#if seasonComplete}
            <RotateCcw size={15} aria-hidden="true" />
            Unwatch season
          {:else}
            <Check size={15} aria-hidden="true" />
            Watched season
          {/if}
        </button>
      </form>
    {/if}
  </div>

  <div class="season-list" aria-label="All seasons">
    {#each data.seasons as season}
      <a class:active={season.id === data.season.id} href={seasonHref(season)}>
        <span>{season.title}</span>
        <small>{season.episodes.length}</small>
      </a>
    {/each}
  </div>
</nav>

<section class="episodes-section" aria-label="Episodes">
  <div class="episodes">
    {#each data.season.episodes as episode}
      {@const progressLabel = episodeProgressLabel(episode)}
      <article class="episode-row" class:watched={episode.completed} class:missing={!episode.fileId}>
        {#if episode.fileId}
          <a class="still" href={`/episodes/${episode.id}`} aria-label={episode.title}>
            {#if episode.stillUrl}
              <img src={episode.stillUrl} alt="" loading="lazy" />
            {:else}
              <span>{episodeCode(episode) || episode.episodeNumber || ""}</span>
            {/if}
            {#if episode.progressSeconds > 0 && !episode.completed}
              <div class="episode-progress" aria-hidden="true">
                <span
                  style={`width: ${episode.durationSeconds ? Math.min(99, Math.round((episode.progressSeconds / episode.durationSeconds) * 100)) : 4}%`}
                ></span>
              </div>
            {/if}
          </a>
        {:else}
          <div class="still missing-still" aria-label={`${episode.title} is missing a file`}>
            {#if episode.stillUrl}
              <img src={episode.stillUrl} alt="" loading="lazy" />
            {:else}
              <span>{episodeCode(episode) || episode.episodeNumber || ""}</span>
            {/if}
          </div>
        {/if}
        <div class="episode-main">
          <div class="episode-heading">
            <span>{episodeCode(episode)}</span>
            <h4>
              {#if episode.fileId}
                <a href={`/episodes/${episode.id}`}>{episode.title}</a>
              {:else}
                {episode.title}
              {/if}
            </h4>
          </div>
          <div class="episode-facts">
            {#if episode.releaseDate}
              <span class="icon-fact"
                ><Calendar size={14} aria-hidden="true" />
                {episode.releaseDate}</span
              >
            {/if}
            {#if runtimeLabel(episode.runtimeSeconds)}
              <span class="icon-fact"
                ><Clock3 size={14} aria-hidden="true" />
                {runtimeLabel(episode.runtimeSeconds)}</span
              >
            {/if}
            {#if episode.fileId}
              <span
                >{episode.fileCount}
                {episode.fileCount === 1 ? "file" : "files"}</span
              >
            {:else}
              <span class="missing-badge">Missing</span>
            {/if}
            {#if episode.completed}<span>Watched</span>{/if}
            {#if progressLabel}
              <span class="progress-badge">{progressLabel}</span>
            {/if}
          </div>
          {#if episode.overview}
            <p>{episode.overview}</p>
          {/if}
        </div>
        <div class="episode-actions">
          {#if episode.fileId}
            <a class="button compact" href={watchHref(episode)}>
              <CirclePlay size={15} aria-hidden="true" />
              {episode.progressSeconds > 0 && !episode.completed ? "Resume" : "Play"}
            </a>
            <form class="episode-action-form" method="POST" action="?/watched">
              <input type="hidden" name="episodeId" value={episode.id} />
              <input type="hidden" name="fileId" value={episode.fileId} />
              <input type="hidden" name="completed" value={episode.completed ? "false" : "true"} />
              <button class="secondary compact">
                {#if episode.completed}
                  <RotateCcw size={15} aria-hidden="true" />
                  Unwatch
                {:else}
                  <Check size={15} aria-hidden="true" />
                  Watched
                {/if}
              </button>
            </form>
          {:else}
            <span class="missing-note">No file</span>
          {/if}
        </div>
      </article>
    {/each}
  </div>
</section>

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

  .watch-progress,
  .episode-progress {
    overflow: hidden;
    border-radius: 999px;
    background: var(--color-border-strong);
  }

  .watch-progress {
    height: 0.45rem;
  }

  .watch-progress span,
  .episode-progress span {
    display: block;
    height: 100%;
    min-width: 0;
    border-radius: inherit;
    background: var(--color-accent);
  }

  .season-return-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin: -0.45rem 0 0.45rem;
  }

  .show-return {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    width: fit-content;
    min-height: 1.85rem;
    color: var(--color-muted);
    font-size: 0.86rem;
    font-weight: 750;
  }

  .show-return:hover {
    color: var(--color-text);
  }

  .season-navigation {
    position: sticky;
    top: 0;
    z-index: 5;
    display: grid;
    gap: 0.25rem;
    margin: -0.25rem 0 1rem;
    border-bottom: 1px solid var(--color-border-strong);
    padding: 0.35rem 0 0;
  }

  .season-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.55rem;
    align-items: center;
  }

  .step-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-height: 1.8rem;
    border: 1px solid var(--color-border-strong);
    border-radius: 6px;
    background: var(--color-surface-faint);
    color: var(--color-text-soft);
    padding: 0 0.55rem;
    font-size: 0.82rem;
    font-weight: 750;
    white-space: nowrap;
  }

  .step-link {
    border-color: transparent;
    background: transparent;
    color: var(--color-muted);
  }

  .step-link:hover {
    border-color: var(--color-accent-border);
    background: var(--color-accent-soft);
    color: var(--color-text);
  }

  .current-season {
    display: grid;
    gap: 0;
    min-width: 0;
  }

  .current-season strong,
  .current-season span,
  .step-link span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .current-season span {
    color: var(--color-muted);
    font-size: 0.78rem;
  }

  .season-stepper,
  .season-list {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .season-stepper {
    justify-content: flex-end;
    min-width: 0;
  }

  .season-list {
    padding-bottom: 0;
  }

  .season-list a {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 2rem;
    padding: 0 0.65rem;
    color: var(--color-muted);
    font-size: 0.86rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .season-list a::after {
    content: "";
    position: absolute;
    right: 0.7rem;
    bottom: -1px;
    left: 0.7rem;
    height: 2px;
    border-radius: 999px;
    background: transparent;
  }

  .season-list a:hover,
  .season-list a.active {
    color: var(--color-text);
  }

  .season-list a.active::after {
    background: var(--color-accent);
  }

  .season-list small {
    color: var(--color-muted);
    font-size: 0.78rem;
    font-weight: 800;
  }

  .episodes-section {
    display: grid;
    gap: 0.9rem;
  }

  h4 {
    margin: 0;
  }

  .season-bulk-action {
    margin: 0;
  }

  .episodes {
    display: grid;
    gap: 0;
  }

  .episode-row {
    display: grid;
    grid-template-columns: minmax(10rem, 13rem) minmax(0, 1fr) auto;
    gap: 0.9rem;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
    padding: 0.7rem 0;
  }

  .episode-row.watched {
    opacity: 0.72;
  }

  .episode-row.missing {
    color: var(--color-text-soft);
  }

  .still {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border: 1px solid transparent;
    border-radius: 8px;
    background: var(--color-card);
    color: var(--color-subtle);
    font-weight: 800;
  }

  .still:hover {
    border-color: var(--color-accent-border);
  }

  .missing-still {
    border-color: var(--color-border);
    opacity: 0.74;
  }

  .missing-still:hover {
    border-color: var(--color-border);
  }

  .still img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .episode-progress {
    position: absolute;
    right: 0.45rem;
    bottom: 0.45rem;
    left: 0.45rem;
    height: 0.25rem;
  }

  .episode-main {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  .episode-heading {
    display: grid;
    gap: 0.1rem;
  }

  .episode-heading > span {
    color: var(--color-muted);
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0;
  }

  h4 {
    font-size: 1rem;
  }

  .episode-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.55rem;
    color: var(--color-muted);
    font-size: 0.84rem;
  }

  .episode-main p {
    margin: 0;
    color: var(--color-subtle);
    line-height: 1.5;
  }

  .missing-badge,
  .missing-note,
  .progress-badge {
    color: var(--color-warning);
  }

  .missing-note {
    align-self: center;
    font-size: 0.84rem;
    font-weight: 800;
  }

  .episode-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: flex-end;
  }

  .episode-action-form {
    margin: 0;
  }

  .compact {
    min-height: 2rem;
    padding: 0 0.65rem;
    font-size: 0.86rem;
  }

  @media (max-width: 760px) {
    .watch-summary {
      grid-template-columns: 1fr;
    }

    .season-return-row {
      display: grid;
      gap: 0.35rem;
    }

    .season-toolbar {
      grid-template-columns: 1fr;
      align-items: start;
    }

    .season-stepper {
      justify-content: flex-start;
      max-width: 100%;
    }

    .episode-row {
      grid-template-columns: 1fr;
    }

    .still {
      max-width: none;
    }

    .episode-actions {
      justify-content: flex-start;
    }
  }
</style>
