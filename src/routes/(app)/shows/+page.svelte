<script lang="ts">
  import EpisodeCard from "$lib/components/EpisodeCard.svelte";
  import SearchField from "$lib/components/SearchField.svelte";
  import ShowCard from "$lib/components/ShowCard.svelte";
  import { ChevronRight, Library, Search } from "@lucide/svelte";

  let { data } = $props();
  let searchForm: HTMLFormElement | null = $state(null);
  let searchSubmitTimer: ReturnType<typeof setTimeout> | undefined =
    $state(undefined);
  const hasActiveSearch = $derived(data.query.trim().length > 0);
  const showSections = $derived([
    {
      key: "continue",
      title: "Continue watching",
      episodes: data.rows.continueWatching,
    },
    {
      key: "next-up",
      title: "Next up",
      episodes: data.rows.nextUp,
    },
  ]);
  const visibleEpisodeSections = $derived(
    hasActiveSearch
      ? []
      : showSections.filter((section) => section.episodes.length > 0),
  );
  const recentlyAiredShows = $derived(
    hasActiveSearch ? [] : data.rows.recentlyAiredShows,
  );
  const popularShows = $derived(hasActiveSearch ? [] : data.rows.popularShows);
  const allShows = $derived(data.rows.allShows);
  const hasContent = $derived(
    allShows.length > 0 ||
      visibleEpisodeSections.length > 0 ||
      recentlyAiredShows.length > 0 ||
      popularShows.length > 0,
  );

  function submitSearchNow() {
    if (searchSubmitTimer) {
      clearTimeout(searchSubmitTimer);
      searchSubmitTimer = undefined;
    }
    searchForm?.requestSubmit();
  }

  function submitSearchSoon() {
    if (searchSubmitTimer) clearTimeout(searchSubmitTimer);
    searchSubmitTimer = setTimeout(() => {
      searchSubmitTimer = undefined;
      searchForm?.requestSubmit();
    }, 350);
  }
</script>

<svelte:head>
  <title>Shows - Lunarr</title>
  <meta
    name="description"
    content="Browse, search, and open scanned TV shows in your Lunarr library."
  />
</svelte:head>

<header class="page-header">
  <div>
    <h1>Shows</h1>
    <p class="muted">Browse scanned TV libraries by show and season.</p>
  </div>
  <form method="GET" role="search" bind:this={searchForm}>
    <SearchField
      ariaLabel="Search shows"
      placeholder="Search shows"
      value={data.query}
      oninput={submitSearchSoon}
    />
    <select name="sort" aria-label="Sort shows" onchange={submitSearchNow}>
      <option value="title" selected={data.sort === "title"}>Title</option>
      <option value="recent" selected={data.sort === "recent"}
        >Recently added</option
      >
      <option value="latest" selected={data.sort === "latest"}
        >Latest aired</option
      >
      <option value="popular" selected={data.sort === "popular"}>Popular</option
      >
    </select>
  </form>
</header>

{#if !hasContent}
  <section class="empty">
    {#if data.query.trim().length}
      <h2>No matching shows</h2>
      <p class="muted">Adjust the search to broaden the results.</p>
      <a class="button secondary" href="/shows">
        <Search size={16} aria-hidden="true" />
        Clear search
      </a>
    {:else}
      <h2>No shows scanned yet</h2>
      <p class="muted">
        Add a TV library and run a scan to populate this page.
      </p>
      <a class="button" href="/libraries">
        <Library size={16} aria-hidden="true" />
        Add library
      </a>
    {/if}
  </section>
{:else}
  {#each visibleEpisodeSections as section}
    <section class="media-section">
      <div class="section-heading">
        <h2>{section.title}</h2>
        {#if section.key === "continue"}
          <a class="view-all" href="/continue">
            <span>View all</span>
            <ChevronRight size={16} aria-hidden="true" />
          </a>
        {/if}
      </div>
      <div class="episode-rail">
        {#each section.episodes as episode}
          <EpisodeCard {episode} />
        {/each}
      </div>
    </section>
  {/each}

  {#if recentlyAiredShows.length}
    <section class="media-section">
      <div class="section-heading">
        <h2>Recently aired</h2>
      </div>
      <div class="show-rail">
        {#each recentlyAiredShows as show}
          <ShowCard {show} />
        {/each}
      </div>
    </section>
  {/if}

  {#if popularShows.length}
    <section class="media-section">
      <div class="section-heading">
        <h2>Popular shows</h2>
      </div>
      <div class="show-rail">
        {#each popularShows as show}
          <ShowCard {show} />
        {/each}
      </div>
    </section>
  {/if}

  {#if allShows.length}
    <section class="media-section">
      <div class="section-heading">
        <h2>{hasActiveSearch ? "Matching shows" : "All shows"}</h2>
      </div>
      <div class="show-grid">
        {#each allShows as show}
          <ShowCard {show} />
        {/each}
      </div>
    </section>
  {/if}
{/if}

<style>
  .page-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(26rem, 38rem);
    gap: 1rem;
    align-items: end;
    margin-bottom: 1.6rem;
  }

  form {
    display: grid;
    grid-template-columns: minmax(14rem, 1fr) minmax(8rem, auto);
    gap: 0.5rem;
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: clamp(1.55rem, 2.4vw, 2.25rem);
  }

  .media-section {
    margin-top: 2rem;
  }

  h2 {
    margin: 0;
  }

  .section-heading {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    margin-bottom: 0.85rem;
  }

  .view-all {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    margin-left: auto;
    color: var(--color-muted);
    font-size: 0.9rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .view-all:hover {
    color: var(--color-text);
  }

  .episode-rail,
  .show-rail {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(2, auto);
    gap: 1.1rem;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-inline: contain;
    padding: 0.1rem 0 0.85rem;
    scroll-snap-type: x proximity;
    scroll-padding-inline: 0.25rem;
    scrollbar-color: var(--color-scrollbar) transparent;
    scrollbar-width: thin;
  }

  .episode-rail {
    grid-auto-columns: clamp(15rem, 24vw, 20rem);
  }

  .show-rail {
    grid-auto-columns: clamp(8.8rem, 12vw, 10.5rem);
  }

  .episode-rail :global(.episode),
  .show-rail :global(.show) {
    scroll-snap-align: start;
  }

  .episode-rail::-webkit-scrollbar,
  .show-rail::-webkit-scrollbar {
    height: 0.55rem;
  }

  .episode-rail::-webkit-scrollbar-track,
  .show-rail::-webkit-scrollbar-track {
    background: transparent;
  }

  .episode-rail::-webkit-scrollbar-thumb,
  .show-rail::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: var(--color-scrollbar);
  }

  .episode-rail::-webkit-scrollbar-thumb:hover,
  .show-rail::-webkit-scrollbar-thumb:hover {
    background: var(--color-scrollbar-hover);
  }

  .show-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.8rem, 1fr));
    gap: 1.35rem 1.1rem;
  }

  .empty {
    display: grid;
    justify-items: start;
    gap: 0.8rem;
    margin-top: 3rem;
    max-width: 34rem;
  }

  .empty h2 {
    margin: 0;
  }

  @media (max-width: 820px) {
    .page-header {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    form {
      grid-template-columns: 1fr;
    }

    .show-grid {
      grid-template-columns: repeat(auto-fill, minmax(8.25rem, 1fr));
    }

    .episode-rail {
      grid-auto-columns: minmax(15rem, 78vw);
    }

    .show-rail {
      grid-auto-columns: minmax(8.25rem, 38vw);
    }
  }
</style>
