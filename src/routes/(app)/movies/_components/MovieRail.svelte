<script lang="ts">
  import MovieCard from "$lib/components/MovieCard.svelte";
  import { twoRowRailItems } from "$lib/media/rails";
  import type { MovieSummary } from "$lib/media/types";

  let {
    movies,
    twoRowThreshold = 9,
  }: {
    movies: MovieSummary[];
    twoRowThreshold?: number;
  } = $props();

  let width = $state(0);
  const isTwoRow = $derived(movies.length >= twoRowThreshold);
  const visibleMovies = $derived(isTwoRow ? twoRowRailItems(movies, width) : movies);
</script>

<div class="movie-rail" class:two-row={isTwoRow} bind:clientWidth={width}>
  {#each visibleMovies as movie (movie.id)}
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

  .movie-rail.two-row {
    grid-auto-flow: row;
    grid-auto-columns: unset;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    grid-template-rows: repeat(2, auto);
    overflow: visible;
    scroll-snap-type: none;
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

    .movie-rail.two-row {
      grid-template-columns: repeat(auto-fill, minmax(8.25rem, 1fr));
    }
  }
</style>
