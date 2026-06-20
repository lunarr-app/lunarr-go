<script lang="ts">
  import SearchField from "$lib/components/SearchField.svelte";
  import { createDebouncedCatalogSearch } from "$lib/media/catalog-search.svelte";
  import { SHOW_SEARCH_PLACEHOLDER } from "$lib/media/search";
  import EpisodeRail from "./_components/EpisodeRail.svelte";
  import ShowRail from "./_components/ShowRail.svelte";
  import { ChevronRight, Library, Search, Sparkles } from "@lucide/svelte";

  let { data } = $props();
  const catalogSearch = createDebouncedCatalogSearch(() => data.query);

  const hasActiveSearch = $derived(data.query.trim().length > 0);
  const episodeSections = $derived(
    hasActiveSearch
      ? []
      : [
          {
            key: "continue",
            title: "Continue watching",
            episodes: data.rows.continueWatching,
            href: "/continue",
          },
          {
            key: "next-up",
            title: "Next up",
            episodes: data.rows.nextUp,
          },
        ].filter((section) => section.episodes.length > 0),
  );
  const showSections = $derived([
    {
      key: "all",
      title: hasActiveSearch ? "Matching shows" : "All shows",
      shows: data.rows.all,
      href: allShowsHref(),
    },
    {
      key: "recent",
      title: "Recently added",
      shows: data.rows.recent,
      href: "/shows/recent",
    },
    {
      key: "latest",
      title: "Recently aired",
      shows: data.rows.latest,
      href: "/shows/latest",
    },
    {
      key: "popular",
      title: "Popular",
      shows: data.rows.popular,
      href: "/shows/popular",
    },
  ]);
  const hasContent = $derived(episodeSections.length > 0 || showSections.some((section) => section.shows.length > 0));
  const TWO_ROW_EPISODE_RAIL_COUNT = 5;
  const TWO_ROW_SHOW_RAIL_COUNT = 9;

  function allShowsHref() {
    const params = new URLSearchParams();
    const query = data.query.trim();
    if (query.length > 0) params.set("q", query);
    const search = params.toString();
    return search ? `/shows/all?${search}` : "/shows/all";
  }
</script>

<svelte:head>
  <title>Shows - Lunarr</title>
  <meta name="description" content="Browse, search, and open scanned TV shows in your Lunarr library." />
</svelte:head>

<header class="page-header">
  <div>
    <div class="title-row">
      <h1>Shows</h1>
      {#if !hasActiveSearch}
        <a class="discover-link button secondary" href="/shows/discover">
          <Sparkles size={16} aria-hidden="true" />
          Discover TV shows
        </a>
      {/if}
    </div>
    <p class="muted">Browse scanned TV libraries by show and season.</p>
  </div>
  <form
    method="GET"
    role="search"
    onsubmit={(event) => {
      event.preventDefault();
      catalogSearch.commitSearch();
    }}
  >
    <SearchField
      ariaLabel="Search shows"
      placeholder={SHOW_SEARCH_PLACEHOLDER}
      bind:value={catalogSearch.queryInput}
      bind:inputRef={catalogSearch.searchInput}
      oninput={catalogSearch.submitSearchSoon}
    />
  </form>
</header>

{#if !hasContent}
  <section class="empty">
    {#if hasActiveSearch}
      <h2>No matching shows</h2>
      <p class="muted">Adjust the search to broaden the results.</p>
      <a class="button secondary" href="/shows">
        <Search size={16} aria-hidden="true" />
        Clear search
      </a>
    {:else}
      <h2>No shows scanned yet</h2>
      <p class="muted">Add a TV library and run a scan to populate this page.</p>
      <a class="button" href="/libraries">
        <Library size={16} aria-hidden="true" />
        Add library
      </a>
    {/if}
  </section>
{:else}
  {#each episodeSections as section}
    <section class="media-section">
      <div class="section-heading">
        <h2>{section.title}</h2>
        {#if section.href}
          <a class="view-all" href={section.href}>
            <span>View all</span>
            <ChevronRight size={16} aria-hidden="true" />
          </a>
        {/if}
      </div>
      <EpisodeRail episodes={section.episodes} twoRowThreshold={TWO_ROW_EPISODE_RAIL_COUNT} />
    </section>
  {/each}

  {#each showSections as section}
    {#if section.shows.length}
      <section class="media-section">
        <div class="section-heading">
          <h2>{section.title}</h2>
          {#if section.href}
            <a class="view-all" href={section.href}>
              <span>View all</span>
              <ChevronRight size={16} aria-hidden="true" />
            </a>
          {/if}
        </div>
        <ShowRail shows={section.shows} twoRowThreshold={TWO_ROW_SHOW_RAIL_COUNT} />
      </section>
    {/if}
  {/each}
{/if}

<style>
  .page-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(26rem, 38rem);
    gap: 1rem;
    align-items: end;
    margin-bottom: 1.6rem;
  }

  .title-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 0.25rem;
  }

  form {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
    justify-self: end;
    width: 100%;
  }

  h1 {
    margin: 0;
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
    .section-heading {
      display: flex;
      flex-wrap: wrap;
    }
  }
</style>
