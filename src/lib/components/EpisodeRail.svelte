<script lang="ts">
  import EpisodeCard from "$lib/components/EpisodeCard.svelte";
  import type { EpisodeSummary } from "$lib/media/types";

  let { episodes }: { episodes: EpisodeSummary[] } = $props();
</script>

<div class="episode-rail">
  {#each episodes as episode (episode.id)}
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
  }
</style>
