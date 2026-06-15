<script lang="ts">
  import ShowListPage from "../_components/ShowListPage.svelte";

  let { data } = $props();
  const hrefForPage = (page: number) => (page > 1 ? `/shows/popular?page=${page}` : "/shows/popular");
</script>

<svelte:head>
  <title>Popular Shows - Lunarr</title>
  <meta name="description" content="Browse popular and highly rated shows in your Lunarr library." />
</svelte:head>

<ShowListPage
  title="Popular"
  description="Shows ordered by popularity and rating."
  shows={data.shows}
  pageInfo={data.pageInfo}
  {hrefForPage}
/>
