<script lang="ts">
  import MovieListPage from "../../movies/_components/MovieListPage.svelte";

  let { data } = $props();

  function hrefForPage(page: number) {
    return page > 1 ? `/continue/movies?page=${page}` : "/continue/movies";
  }
</script>

<svelte:head>
  <title>Continue Watching Movies - Lunarr</title>
  <meta name="description" content="Resume every in-progress movie in your Lunarr library." />
</svelte:head>

<MovieListPage
  title="Continue watching movies"
  description="Resume in-progress movies."
  movies={data.movies}
  pageInfo={data.pageInfo}
  emptyTitle="No movies in progress"
  emptyDescription="Start a movie and Lunarr will keep it here until it is watched."
  {hrefForPage}
/>
