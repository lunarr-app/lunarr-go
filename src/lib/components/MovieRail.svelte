<script lang="ts">
  import MovieCard from "$lib/components/MovieCard.svelte";
  import type { MovieSummary } from "$lib/media/types";

  let { movies }: { movies: MovieSummary[] } = $props();
</script>

<div class="movie-rail">
  {#each movies as movie (movie.id)}
    <MovieCard {movie} />
  {/each}
</div>

<style>
  .movie-rail {
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

  .movie-rail :global(.movie) {
    scroll-snap-align: start;
  }

  .movie-rail::-webkit-scrollbar {
    height: 0.55rem;
  }

  .movie-rail::-webkit-scrollbar-track {
    background: transparent;
  }

  .movie-rail::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: var(--color-scrollbar);
  }

  .movie-rail::-webkit-scrollbar-thumb:hover {
    background: var(--color-scrollbar-hover);
  }

  @media (max-width: 760px) {
    .movie-rail {
      grid-auto-columns: minmax(8.25rem, 38vw);
    }
  }
</style>
