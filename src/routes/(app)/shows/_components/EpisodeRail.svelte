<script lang="ts">
  import EpisodeCard from "$lib/components/EpisodeCard.svelte";
  import { twoRowRailItems } from "$lib/media/rails";
  import type { EpisodeSummary } from "$lib/media/types";

  let {
    episodes,
    twoRowThreshold = 5,
  }: {
    episodes: EpisodeSummary[];
    twoRowThreshold?: number;
  } = $props();

  let width = $state(0);
  const isTwoRow = $derived(episodes.length >= twoRowThreshold);
  const visibleEpisodes = $derived(isTwoRow ? twoRowRailItems(episodes, width, { minColumnPx: 240 }) : episodes);
</script>

<div class="episode-rail" class:two-row={isTwoRow} bind:clientWidth={width}>
  {#each visibleEpisodes as episode (episode.id)}
    <EpisodeCard {episode} />
  {/each}
</div>

<style>
  .episode-rail {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: clamp(15rem, 24vw, 20rem);
    grid-template-rows: auto;
    gap: 1.1rem;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-inline: contain;
    padding: 0.1rem 0 0.85rem;
    scroll-snap-type: x proximity;
    scroll-padding-inline: 0.25rem;
    scrollbar-color: var(--color-scrollbar) transparent;
    scrollbar-width: thin;
  }

  .episode-rail.two-row {
    grid-auto-flow: row;
    grid-auto-columns: unset;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    grid-template-rows: repeat(2, auto);
    overflow: visible;
    scroll-snap-type: none;
  }

  .episode-rail :global(.episode) {
    scroll-snap-align: start;
  }

  .episode-rail::-webkit-scrollbar {
    height: 0.55rem;
  }

  .episode-rail::-webkit-scrollbar-track {
    background: transparent;
  }

  .episode-rail::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: var(--color-scrollbar);
  }

  .episode-rail::-webkit-scrollbar-thumb:hover {
    background: var(--color-scrollbar-hover);
  }

  @media (max-width: 640px) {
    .episode-rail {
      grid-auto-columns: minmax(15rem, 78vw);
    }

    .episode-rail.two-row {
      grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    }
  }
</style>
