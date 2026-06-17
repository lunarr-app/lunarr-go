<script lang="ts">
  import SimilarMediaPage from "$lib/components/SimilarMediaPage.svelte";

  let { data } = $props();
</script>

<SimilarMediaPage
  kind="show"
  mediaId={data.media.id}
  title={data.media.title}
  emptyMessage="No similar shows were found in your library."
  shows={data.shows}
  pageInfo={data.pageInfo}
/>
