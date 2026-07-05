<script lang="ts">
  import EpisodeListPage from "../_components/EpisodeListPage.svelte";

  let { data } = $props();

  function hrefForPage(page: number) {
    return page > 1 ? `/continue/episodes?page=${page}` : "/continue/episodes";
  }
</script>

<svelte:head>
  <title>Continue Watching Episodes - Lunarr</title>
  <meta name="description" content="Resume every in-progress TV episode in your Lunarr library." />
</svelte:head>

<EpisodeListPage
  title="Continue watching episodes"
  description="Resume in-progress TV episodes."
  episodes={data.episodes}
  pageInfo={data.pageInfo}
  emptyTitle="No episodes in progress"
  emptyDescription="Start an episode and Lunarr will keep it here until it is watched."
  {hrefForPage}
/>
