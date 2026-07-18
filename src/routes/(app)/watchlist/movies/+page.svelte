<script lang="ts">
  import MovieListPage from "../../movies/_components/MovieListPage.svelte";

  let { data } = $props();

  function hrefForPage(page: number) {
    return page > 1 ? `/watchlist/movies?page=${page}` : "/watchlist/movies";
  }
</script>

<svelte:head>
  <title>Watchlist Movies - Lunarr</title>
  <meta name="description" content="Movies in your personal watchlist." />
</svelte:head>

<MovieListPage
  title="Watchlist movies"
  description="Movies you want to watch."
  movies={data.movies}
  pageInfo={data.pageInfo}
  emptyTitle="No movies in watchlist"
  emptyDescription="Browse your library and add movies to your watchlist."
  {hrefForPage}
/>
