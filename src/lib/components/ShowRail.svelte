<script lang="ts">
  import ShowCard from "$lib/components/ShowCard.svelte";
  import type { ShowSummary } from "$lib/media/types";

  let { shows }: { shows: ShowSummary[] } = $props();
</script>

<div class="show-rail">
  {#each shows as show (show.id)}
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
  }
</style>
