<script lang="ts">
  import MovieListPage from "../_components/MovieListPage.svelte";

  let { data } = $props();
  const hrefForPage = (page: number) => (page > 1 ? `/movies/latest?page=${page}` : "/movies/latest");
</script>

<svelte:head>
  <title>Latest Movie Releases - Lunarr</title>
  <meta name="description" content="Browse the newest movie releases in your Lunarr library." />
</svelte:head>

<MovieListPage
  title="Latest releases"
  description="Movies ordered by release date."
  movies={data.movies}
  pageInfo={data.pageInfo}
  {hrefForPage}
/>
