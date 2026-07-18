<script lang="ts">
  import MovieCard from "$lib/components/MovieCard.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import ShowCard from "$lib/components/ShowCard.svelte";

  let { data } = $props();

  function hrefForPage(page: number) {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    const search = params.toString();
    return search ? `/watchlist?${search}` : "/watchlist";
  }

  const movieRange = $derived({
    first: data.moviesPage.total === 0 ? 0 : (data.moviesPage.page - 1) * data.moviesPage.pageSize + 1,
    last: Math.min(data.moviesPage.page * data.moviesPage.pageSize, data.moviesPage.total),
  });
  const showRange = $derived({
    first: data.showsPage.total === 0 ? 0 : (data.showsPage.page - 1) * data.showsPage.pageSize + 1,
    last: Math.min(data.showsPage.page * data.showsPage.pageSize, data.showsPage.total),
  });
  const movieSummary = $derived(`Showing ${movieRange.first}-${movieRange.last} of ${data.moviesPage.total}`);
  const showSummary = $derived(`Showing ${showRange.first}-${showRange.last} of ${data.showsPage.total}`);

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
      <a class="button" href="/movies">Browse Movies</a>
      <a class="button secondary" href="/shows">Browse Shows</a>
    </div>
  </section>
{:else}
  {#if data.movies.length > 0}
    <section>
      <h2 class="section-title">Movies</h2>
      <div class="grid">
        {#each data.movies as movie}
          <MovieCard {movie} />
        {/each}
      </div>
      {#if data.moviesPage.totalPages > 1}
        <Pagination
          page={data.moviesPage.page}
          totalPages={data.moviesPage.totalPages}
          hasPrevious={data.moviesPage.hasPrevious}
          hasNext={data.moviesPage.hasNext}
          {hrefForPage}
          summary={movieSummary}
          ariaLabel="Watchlist movie pages"
        />
      {/if}
    </section>
  {/if}

  {#if data.shows.length > 0}
    <section>
      <h2 class="section-title">Shows</h2>
      <div class="grid">
        {#each data.shows as show}
          <ShowCard {show} />
        {/each}
      </div>
      {#if data.showsPage.totalPages > 1}
        <Pagination
          page={data.showsPage.page}
          totalPages={data.showsPage.totalPages}
          hasPrevious={data.showsPage.hasPrevious}
          hasNext={data.showsPage.hasNext}
          {hrefForPage}
          summary={showSummary}
          ariaLabel="Watchlist show pages"
        />
      {/if}
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

  .section-title {
    margin: 0 0 1rem;
    font-size: 1.25rem;
  }

  section {
    margin-bottom: 2.5rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 1.1rem;
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
    gap: var(--space-2);
    margin-top: 0.5rem;
  }
</style>
