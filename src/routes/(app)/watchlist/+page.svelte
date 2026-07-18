<script lang="ts">
  import MovieCard from "$lib/components/MovieCard.svelte";
  import ShowCard from "$lib/components/ShowCard.svelte";
  import Rail from "$lib/components/Rail.svelte";
  import { Film, Tv } from "@lucide/svelte";

  let { data } = $props();

  const isEmpty = $derived(data.movies.length === 0 && data.shows.length === 0);
</script>

<svelte:head>
  <title>Watchlist - Lunarr</title>
  <meta name="description" content="Your personal watchlist of movies and shows." />
</svelte:head>

<header class="page-header">
  <div>
    <h1>Watchlist</h1>
    <p class="muted">Movies and shows you want to watch.</p>
  </div>
</header>

{#if isEmpty}
  <section class="empty">
    <h2>Your watchlist is empty</h2>
    <p class="muted">Browse your library and add movies or shows to your watchlist.</p>
    <div class="empty-actions">
      <a class="button" href="/movies">
        <Film size={16} aria-hidden="true" />
        Browse Movies
      </a>
      <a class="button secondary" href="/shows">
        <Tv size={16} aria-hidden="true" />
        Browse Shows
      </a>
    </div>
  </section>
{:else}
  {#if data.movies.length > 0}
    <section class="media-section" aria-labelledby="movies-heading">
      <div class="section-heading">
        <h2 id="movies-heading" class="section-title">Movies</h2>
        <span class="count">{data.moviesPage.total} {data.moviesPage.total === 1 ? "movie" : "movies"}</span>
      </div>
      <Rail items={data.movies} variant="poster">
        {#snippet children(movie)}
          <MovieCard {movie} />
        {/snippet}
      </Rail>
    </section>
  {/if}

  {#if data.shows.length > 0}
    <section class="media-section" aria-labelledby="shows-heading">
      <div class="section-heading">
        <h2 id="shows-heading" class="section-title">Shows</h2>
        <span class="count">{data.showsPage.total} {data.showsPage.total === 1 ? "show" : "shows"}</span>
      </div>
      <Rail items={data.shows} variant="poster">
        {#snippet children(show)}
          <ShowCard {show} />
        {/snippet}
      </Rail>
    </section>
  {/if}
{/if}

<style>
  .page-header {
    margin-bottom: 1.6rem;
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: clamp(1.55rem, 2.4vw, 2.25rem);
  }

  .media-section + .media-section {
    margin-top: 1.8rem;
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    margin-bottom: 0.85rem;
  }

  .section-title {
    margin: 0;
  }

  .count {
    color: var(--color-muted);
    font-size: 0.86rem;
    font-weight: 700;
  }

  .empty {
    display: grid;
    justify-items: start;
    gap: 0.8rem;
    margin-top: 3rem;
    max-width: 34rem;
  }

  .empty h2 {
    margin: 0;
  }

  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }
</style>
