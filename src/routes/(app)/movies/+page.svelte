<script lang="ts">
  import MovieListPage from "./_components/MovieListPage.svelte";

  let { data } = $props();

  function hrefForPage(page: number) {
    const params = new URLSearchParams();
    const query = data.query.trim();
    if (query.length > 0) params.set("q", query);
    if (data.status !== "all") params.set("status", data.status);
    if (data.sort !== "title") params.set("sort", data.sort);
    if (page > 1) params.set("page", String(page));
    const search = params.toString();
    return search ? `/movies?${search}` : "/movies";
  }
</script>

<svelte:head>
  <title>Movies - Lunarr</title>
  <meta name="description" content="Browse, search, and filter every movie in your Lunarr library." />
</svelte:head>

<MovieListPage
  title="Movies"
  description="Browse, search, and filter your movie library."
  movies={data.movies}
  pageInfo={data.pageInfo}
  {hrefForPage}
  query={data.query}
  status={data.status}
  sort={data.sort}
  showFilters
  emptyTitle="No movies found"
  emptyDescription="Try a different search or filter, or add a movie library and run a scan."
/>
