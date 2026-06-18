<script lang="ts">
  import MovieListPage from "../_components/MovieListPage.svelte";

  let { data } = $props();
  const hrefForPage = (page: number) => (page > 1 ? `/movies/discover?page=${page}` : "/movies/discover");
</script>

<svelte:head>
  <title>Discover Movies - Lunarr</title>
  <meta name="description" content="Personalized movie picks based on your Lunarr watch history." />
</svelte:head>

<MovieListPage
  title="Discover movies"
  description="Picks similar to your recent watches, ranked by shared genres, keywords, cast, and directors."
  movies={data.movies}
  pageInfo={data.pageInfo}
  {hrefForPage}
  emptyTitle="No recommendations yet"
  emptyDescription="Watch a movie and Lunarr will surface similar titles here."
/>
