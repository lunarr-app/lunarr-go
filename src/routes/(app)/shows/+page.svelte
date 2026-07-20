<script lang="ts">
  import ShowListPage from "./_components/ShowListPage.svelte";

  let { data } = $props();

  function hrefForPage(page: number) {
    const params = new URLSearchParams();
    const query = data.query.trim();
    if (query.length > 0) params.set("q", query);
    if (data.sort !== "latest") params.set("sort", data.sort);
    if (page > 1) params.set("page", String(page));
    const search = params.toString();
    return search ? `/shows?${search}` : "/shows";
  }
</script>

<svelte:head>
  <title>Shows - Lunarr</title>
  <meta name="description" content="Browse, search, and sort every show in your Lunarr library." />
</svelte:head>

<ShowListPage
  title="Shows"
  description="Browse, search, and sort your TV library."
  shows={data.shows}
  pageInfo={data.pageInfo}
  {hrefForPage}
  query={data.query}
  sort={data.sort}
  showFilters
  emptyTitle="No shows found"
  emptyDescription="Try a different search or sort, or add a TV library and run a scan."
/>
