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

  let selectedSeasonId = $state("");

  const activeSeason = $derived(seasons.find((season) => season.id === selectedSeasonId) ?? seasons[0] ?? null);

  $effect(() => {
    if (!seasons.some((season) => season.id === selectedSeasonId)) {
      selectedSeasonId = seasons[0]?.id ?? "";
    }
  });

  function seasonTabLabel(season: ShareSeason) {
    if (season.seasonNumber !== null) {
      return `Season ${season.seasonNumber}`;
    }
    return season.title;
  }
</script>

<section class="episodes-section" aria-label="Episodes">
  <div class="season-tabs" role="tablist" aria-label="Seasons">
    {#each seasons as season (season.id)}
      <button
        class:active={activeSeason?.id === season.id}
        type="button"
        role="tab"
        aria-selected={activeSeason?.id === season.id}
        onclick={() => (selectedSeasonId = season.id)}
      >
        {seasonTabLabel(season)}
      </button>
    {/each}
  </div>

  {#if activeSeason}
    <div role="tabpanel" aria-label={seasonTabLabel(activeSeason)}>
      <div class="episodes">
        {#each activeSeason.episodes as episode (episode.id)}
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
  {/if}
</section>

<style>
  .episodes-section {
    display: grid;
    gap: 1rem;
  }

  .season-tabs {
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    padding-bottom: 0.15rem;
    border-bottom: 1px solid var(--color-border);
    scrollbar-width: thin;
  }

  .season-tabs button {
    flex: 0 0 auto;
    min-height: 2.25rem;
    padding: 0.35rem 0.85rem;
    border: 0;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    border-radius: 0;
    background: transparent;
    color: var(--color-subtle);
    font-size: 0.92rem;
    font-weight: 650;
    white-space: nowrap;
  }

  .season-tabs button:hover {
    color: var(--color-text);
  }

  .season-tabs button.active {
    color: var(--color-text);
    border-bottom-color: var(--color-accent);
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
    grid-template-columns: minmax(10rem, 13rem) minmax(0, 1fr) auto;
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
      grid-template-columns: minmax(8rem, 10rem) minmax(0, 1fr);
    }

    .play-button {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }
</style>
