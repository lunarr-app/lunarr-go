<script lang="ts">
  import ShowListPage from "../_components/ShowListPage.svelte";

  let { data } = $props();
  const hrefForPage = (page: number) => (page > 1 ? `/shows/latest?page=${page}` : "/shows/latest");
</script>

<svelte:head>
  <title>Recently Aired Shows - Lunarr</title>
  <meta name="description" content="Browse recently aired shows in your Lunarr library." />
</svelte:head>

<ShowListPage
  title="Recently aired"
  description="Shows ordered by the latest aired episode."
  shows={data.shows}
  pageInfo={data.pageInfo}
  {hrefForPage}
/>
