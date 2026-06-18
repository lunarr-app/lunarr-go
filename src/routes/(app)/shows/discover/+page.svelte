<script lang="ts">
  import ShowListPage from "../_components/ShowListPage.svelte";

  let { data } = $props();
  const hrefForPage = (page: number) => (page > 1 ? `/shows/discover?page=${page}` : "/shows/discover");
</script>

<svelte:head>
  <title>Discover TV Shows - Lunarr</title>
  <meta name="description" content="Personalized TV picks based on your Lunarr watch history." />
</svelte:head>

<ShowListPage
  title="Discover TV shows"
  description="Picks similar to your recent episode watches, ranked by shared genres, keywords, cast, and creators."
  shows={data.shows}
  pageInfo={data.pageInfo}
  {hrefForPage}
  emptyTitle="No recommendations yet"
  emptyDescription="Watch an episode and Lunarr will surface similar shows here."
/>
