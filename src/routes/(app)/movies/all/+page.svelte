<script lang="ts">
  import MovieListPage from "../_components/MovieListPage.svelte";

  let { data } = $props();

  function hrefForPage(page: number) {
    const params = new URLSearchParams();
    const query = data.query.trim();
    if (query.length > 0) params.set("q", query);
    if (data.status !== "all") params.set("status", data.status);
    if (page > 1) params.set("page", String(page));
    const search = params.toString();
    return search ? `/movies/all?${search}` : "/movies/all";
  }
</script>

<svelte:head>
  <title>All Movies - Lunarr</title>
  <meta name="description" content="Browse, search, and filter every movie in your Lunarr library." />
</svelte:head>

<MovieListPage
  title="All movies"
  description="Browse every scanned movie in your library."
  movies={data.movies}
  pageInfo={data.pageInfo}
  {hrefForPage}
  query={data.query}
  status={data.status}
  showFilters
/>
