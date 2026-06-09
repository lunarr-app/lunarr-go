<script lang="ts">
  import MovieListPage from "../_components/MovieListPage.svelte";

  let { data } = $props();
  const hrefForPage = (page: number) => (page > 1 ? `/movies/recent?page=${page}` : "/movies/recent");
</script>

<svelte:head>
  <title>Recently Added Movies - Lunarr</title>
  <meta name="description" content="Browse recently added movies in your Lunarr library." />
</svelte:head>

<MovieListPage
  title="Recently added"
  description="Movies ordered by the newest scanned files."
  movies={data.movies}
  pageInfo={data.pageInfo}
  {hrefForPage}
/>
