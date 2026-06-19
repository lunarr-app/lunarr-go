<script lang="ts">
  import { formatEpisodeCode, formatMediaDuration } from "$lib/media/format";
  import type { SharePageData } from "$lib/shares/types";
  import { CirclePlay } from "@lucide/svelte";

  type ShareSeason = Extract<SharePageData, { kind: "show" }>["seasons"][number];

  let {
    seasons,
    onPlay,
  }: {
    seasons: ShareSeason[];
    onPlay: (episodeId: string) => void;
  } = $props();
</script>

<section class="episodes-section" aria-label="Episodes">
  {#each seasons as season (season.id)}
    <div class="season-block">
      <h2>{season.title}</h2>
      <div class="episodes">
        {#each season.episodes as episode (episode.id)}
          <article class="episode-row">
            <div class="still" aria-hidden="true">
              {#if episode.stillUrl}
                <img src={episode.stillUrl} alt="" loading="lazy" />
              {:else}
                <span>{formatEpisodeCode(episode, { style: "short" })}</span>
              {/if}
            </div>
            <div class="episode-main">
              <div class="episode-heading">
                <span>{formatEpisodeCode(episode, { style: "short" })}</span>
                <h3>{episode.title}</h3>
              </div>
              {#if episode.runtimeSeconds}
                <p class="episode-runtime">{formatMediaDuration(episode.runtimeSeconds)}</p>
              {/if}
              {#if episode.overview}
                <p class="episode-overview">{episode.overview}</p>
              {/if}
            </div>
            <button class="secondary compact play-button" type="button" onclick={() => onPlay(episode.id)}>
              <CirclePlay size={15} aria-hidden="true" />
              Play
            </button>
          </article>
        {/each}
      </div>
    </div>
  {/each}
</section>

<style>
  .episodes-section {
    display: grid;
    gap: 1.5rem;
  }

  .season-block h2 {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
  }

  .episodes {
    display: grid;
    gap: 0;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--color-surface);
  }

  .episode-row {
    display: grid;
    grid-template-columns: minmax(9rem, 12rem) minmax(0, 1fr) auto;
    gap: 0.9rem;
    align-items: center;
    padding: 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }

  .episode-row:last-child {
    border-bottom: 0;
  }

  .still {
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 8px;
    background: var(--color-card);
    color: var(--color-subtle);
    font-weight: 800;
  }

  .still img {
    width: 100%;
    height: 100%;
    object-fit: cover;
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

  .episode-heading h3 {
    margin: 0;
    font-size: 1rem;
    line-height: 1.25;
  }

  .episode-runtime {
    margin: 0;
    color: var(--color-muted);
    font-size: 0.84rem;
  }

  .episode-overview {
    margin: 0;
    color: var(--color-subtle);
    font-size: 0.92rem;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .play-button {
    min-height: 2rem;
    padding: 0 0.7rem;
    white-space: nowrap;
  }

  @media (max-width: 760px) {
    .episode-row {
      grid-template-columns: minmax(7rem, 9rem) minmax(0, 1fr);
    }

    .play-button {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }
</style>
