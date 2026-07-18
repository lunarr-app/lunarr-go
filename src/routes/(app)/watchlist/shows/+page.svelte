<script lang="ts">
  import ShowListPage from "../../shows/_components/ShowListPage.svelte";

  let { data } = $props();

  function hrefForPage(page: number) {
    return page > 1 ? `/watchlist/shows?page=${page}` : "/watchlist/shows";
  }
</script>

<svelte:head>
  <title>Watchlist Shows - Lunarr</title>
  <meta name="description" content="Shows in your personal watchlist." />
</svelte:head>

<ShowListPage
  title="Watchlist shows"
  description="Shows you want to watch."
  shows={data.shows}
  pageInfo={data.pageInfo}
  emptyTitle="No shows in watchlist"
  emptyDescription="Browse your library and add shows to your watchlist."
  {hrefForPage}
/>
