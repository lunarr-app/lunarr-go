<script lang="ts">
  import { formatEpisodeCode } from "$lib/media/format";
  import { Calendar, Check, CirclePlay, Clock3, RotateCcw } from "@lucide/svelte";

  type Episode = {
    id: string;
    title: string;
    fileId: string | null;
    fileCount: number;
    seasonNumber: number | null;
    episodeNumber: number | null;
    stillUrl: string | null;
    releaseDate: string | null;
    runtimeSeconds: number | null;
    durationSeconds: number | null;
    progressSeconds: number;
    completed: boolean;
    overview: string | null;
  };

  let {
    episodes,
    watchHref,
  }: {
    episodes: Episode[];
    watchHref: (episode: Pick<Episode, "id" | "fileId">) => string;
  } = $props();

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

<section class="episodes-section" aria-label="Episodes">
  <div class="episodes">
    {#each episodes as episode (episode.id)}
      {@const progressLabel = episodeProgressLabel(episode)}
      <article class="episode-row" class:watched={episode.completed} class:missing={!episode.fileId}>
        {#if episode.fileId}
          <a class="still" href={`/episodes/${episode.id}`} aria-label={episode.title}>
            {#if episode.stillUrl}
              <img src={episode.stillUrl} alt="" loading="lazy" />
            {:else}
              <span>{formatEpisodeCode(episode) || episode.episodeNumber || ""}</span>
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
              <span>{formatEpisodeCode(episode) || episode.episodeNumber || ""}</span>
            {/if}
          </div>
        {/if}
        <div class="episode-main">
          <div class="episode-heading">
            <span>{formatEpisodeCode(episode)}</span>
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
              <span
                ><Calendar size={14} aria-hidden="true" />
                {episode.releaseDate}</span
              >
            {/if}
            {#if runtimeLabel(episode.runtimeSeconds)}
              <span
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
  .episodes-section {
    display: grid;
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
    overflow: hidden;
    height: 0.25rem;
    border-radius: 999px;
    background: var(--color-border-strong);
  }

  .episode-progress span {
    display: block;
    height: 100%;
    min-width: 0;
    border-radius: inherit;
    background: var(--color-accent);
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
  }

  h4 {
    margin: 0;
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
    .episode-row {
      grid-template-columns: 1fr;
    }

    .episode-actions {
      justify-content: flex-start;
    }
  }
</style>
