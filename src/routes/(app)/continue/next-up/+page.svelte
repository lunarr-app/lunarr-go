<script lang="ts">
  import EpisodeListPage from "../_components/EpisodeListPage.svelte";

  let { data } = $props();

  function hrefForPage(page: number) {
    return page > 1 ? `/continue/next-up?page=${page}` : "/continue/next-up";
  }
</script>

<svelte:head>
  <title>Next Up Episodes - Lunarr</title>
  <meta name="description" content="See the next unwatched episode for every show you are watching." />
</svelte:head>

<EpisodeListPage
  title="Next up"
  description="The next unwatched episode for shows you are watching."
  episodes={data.episodes}
  pageInfo={data.pageInfo}
  emptyTitle="Nothing queued next"
  emptyDescription="Finish an episode in a show to see the next one here."
  {hrefForPage}
/>
