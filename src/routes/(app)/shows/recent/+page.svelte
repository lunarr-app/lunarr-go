<script lang="ts">
  import ShowListPage from "../_components/ShowListPage.svelte";

  let { data } = $props();
  const hrefForPage = (page: number) => (page > 1 ? `/shows/recent?page=${page}` : "/shows/recent");
</script>

<svelte:head>
  <title>Recently Added Shows - Lunarr</title>
  <meta name="description" content="Browse recently added shows in your Lunarr library." />
</svelte:head>

<ShowListPage
  title="Recently added"
  description="Shows ordered by the newest scanned episode files."
  shows={data.shows}
  pageInfo={data.pageInfo}
  {hrefForPage}
/>
