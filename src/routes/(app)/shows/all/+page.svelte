<script lang="ts">
  import ShowListPage from "../_components/ShowListPage.svelte";

  let { data } = $props();

  function hrefForPage(page: number) {
    const params = new URLSearchParams();
    const query = data.query.trim();
    if (query.length > 0) params.set("q", query);
    if (data.sort !== "title") params.set("sort", data.sort);
    if (page > 1) params.set("page", String(page));
    const search = params.toString();
    return search ? `/shows/all?${search}` : "/shows/all";
  }
</script>

<svelte:head>
  <title>All Shows - Lunarr</title>
  <meta name="description" content="Browse, search, and sort every show in your Lunarr library." />
</svelte:head>

<ShowListPage
  title="All shows"
  description="Browse every scanned show in your library."
  shows={data.shows}
  pageInfo={data.pageInfo}
  {hrefForPage}
  query={data.query}
  sort={data.sort}
  showFilters
/>
