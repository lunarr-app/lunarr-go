<script lang="ts">
  import MovieListPage from "../_components/MovieListPage.svelte";

  let { data } = $props();
  const hrefForPage = (page: number) => (page > 1 ? `/movies/popular?page=${page}` : "/movies/popular");
</script>

<svelte:head>
  <title>Popular Movies - Lunarr</title>
  <meta name="description" content="Browse popular and highly rated movies in your Lunarr library." />
</svelte:head>

<MovieListPage
  title="Popular"
  description="Movies ordered by popularity and rating."
  movies={data.movies}
  pageInfo={data.pageInfo}
  {hrefForPage}
/>
