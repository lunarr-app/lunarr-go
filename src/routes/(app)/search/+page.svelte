<script lang="ts">
  import SearchField from "$lib/components/SearchField.svelte";
  import MovieRail from "$lib/components/MovieRail.svelte";
  import ShowRail from "$lib/components/ShowRail.svelte";
  import { createDebouncedCatalogSearch } from "$lib/media/catalog-search.svelte";
  import { MOVIE_SEARCH_PLACEHOLDER } from "$lib/media/search";
  import { ChevronRight } from "@lucide/svelte";

  let { data } = $props();

  const catalogSearch = createDebouncedCatalogSearch(() => data.query);

  const hasQuery = $derived(data.query.trim().length > 0);
  const hasResults = $derived(data.movies.length > 0 || data.shows.length > 0);

  function moviesAllHref() {
    const q = data.query.trim();
    return q ? `/movies/all?q=${encodeURIComponent(q)}` : "/movies/all";
  }

  function showsAllHref() {
    const q = data.query.trim();
    return q ? `/shows/all?q=${encodeURIComponent(q)}` : "/shows/all";
  }
</script>

<svelte:head>
  <title>Search - Lunarr</title>
  <meta name="description" content="Search your Lunarr movie and TV library by title, keyword, genre, or filename." />
</svelte:head>

<section class="search-bar">
  <SearchField
    ariaLabel="Search library"
    placeholder={MOVIE_SEARCH_PLACEHOLDER}
    bind:value={catalogSearch.queryInput}
    bind:inputRef={catalogSearch.searchInput}
    oninput={catalogSearch.submitSearchSoon}
  />
  {#if !hasQuery}
    <p class="muted hint">Search your movie and TV library by title, keyword, genre, or filename.</p>
  {:else if !hasResults}
    <p class="muted hint">No results for “{data.query.trim()}”.</p>
  {/if}
</section>

{#if hasQuery && hasResults}
  {#if data.movies.length}
    <section class="result-section">
      <div class="section-heading">
        <h2>Movies</h2>
        <a class="view-all" href={moviesAllHref()}>
          <span>View all</span>
          <ChevronRight size={16} aria-hidden="true" />
        </a>
      </div>
      <MovieRail movies={data.movies} />
    </section>
  {/if}

  {#if data.shows.length}
    <section class="result-section">
      <div class="section-heading">
        <h2>TV shows</h2>
        <a class="view-all" href={showsAllHref()}>
          <span>View all</span>
          <ChevronRight size={16} aria-hidden="true" />
        </a>
      </div>
      <ShowRail shows={data.shows} />
    </section>
  {/if}
{/if}

<style>
  .search-bar {
    margin-bottom: var(--space-5);
  }

  .hint {
    margin-top: var(--space-3);
  }

  .result-section + .result-section {
    margin-top: var(--space-5);
  }

  .section-heading {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    margin-bottom: 0.85rem;
  }

  .section-heading h2 {
    margin: 0;
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
</style>
