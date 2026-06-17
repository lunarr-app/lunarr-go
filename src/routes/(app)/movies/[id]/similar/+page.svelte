<script lang="ts">
  import SimilarMediaPage from "$lib/components/SimilarMediaPage.svelte";

  let { data } = $props();
</script>

<SimilarMediaPage
  kind="movie"
  mediaId={data.media.id}
  title={data.media.title}
  emptyMessage="No similar movies were found in your library."
  movies={data.movies}
  pageInfo={data.pageInfo}
/>
