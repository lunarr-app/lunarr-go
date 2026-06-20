<script lang="ts">
  import ShowCard from "$lib/components/ShowCard.svelte";
  import { twoRowRailItems } from "$lib/media/rails";
  import type { ShowSummary } from "$lib/media/types";

  let {
    shows,
    twoRowThreshold = 9,
  }: {
    shows: ShowSummary[];
    twoRowThreshold?: number;
  } = $props();

  let width = $state(0);
  const isTwoRow = $derived(shows.length >= twoRowThreshold);
  const visibleShows = $derived(isTwoRow ? twoRowRailItems(shows, width) : shows);
</script>

<div class="show-rail" class:two-row={isTwoRow} bind:clientWidth={width}>
  {#each visibleShows as show (show.id)}
    <ShowCard {show} />
  {/each}
</div>

<style>
  .show-rail {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: clamp(8.8rem, 12vw, 10.5rem);
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

  .show-rail.two-row {
    grid-auto-flow: row;
    grid-auto-columns: unset;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    grid-template-rows: repeat(2, auto);
    overflow: visible;
    scroll-snap-type: none;
  }

  .show-rail :global(.show) {
    scroll-snap-align: start;
  }

  .show-rail::-webkit-scrollbar {
    height: 0.55rem;
  }

  .show-rail::-webkit-scrollbar-track {
    background: transparent;
  }

  .show-rail::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: var(--color-scrollbar);
  }

  .show-rail::-webkit-scrollbar-thumb:hover {
    background: var(--color-scrollbar-hover);
  }

  @media (max-width: 640px) {
    .show-rail {
      grid-auto-columns: minmax(8.25rem, 38vw);
    }

    .show-rail.two-row {
      grid-template-columns: repeat(auto-fill, minmax(8.25rem, 1fr));
    }
  }
</style>
