<script lang="ts">
  import SearchField from "$lib/components/SearchField.svelte";
  import { createDebouncedCatalogSearch } from "$lib/media/catalog-search.svelte";
  import { MOVIE_SEARCH_PLACEHOLDER } from "$lib/media/search";
  import MovieRail from "./_components/MovieRail.svelte";
  import { ChevronRight, Library, Search } from "@lucide/svelte";

  let { data } = $props();
  const catalogSearch = createDebouncedCatalogSearch(
    () => data.query,
    () => ({ status: data.status }),
  );

  const hasActiveFilters = $derived(data.query.trim().length > 0 || data.status !== "all");

  const sections = $derived([
    {
      key: "continue",
      title: "Continue watching",
      movies: data.rows.continueWatching,
      href: "/continue/movies",
    },
    {
      key: "all",
      title: "All movies",
      movies: data.rows.all,
      href: allMoviesHref(),
    },
    {
      key: "recent",
      title: "Recently added",
      movies: data.rows.recent,
      href: "/movies/recent",
    },
    {
      key: "latest",
      title: "Latest releases",
      movies: data.rows.latest,
      href: "/movies/latest",
    },
    {
      key: "popular",
      title: "Popular",
      movies: data.rows.popular,
      href: "/movies/popular",
    },
  ]);
  const TWO_ROW_MOVIE_RAIL_COUNT = 9;

  function allMoviesHref() {
    const params = new URLSearchParams();
    const query = data.query.trim();
    if (query.length > 0) params.set("q", query);
    if (data.status !== "all") params.set("status", data.status);
    const search = params.toString();
    return search ? `/movies/all?${search}` : "/movies/all";
  }

  function onStatusChange(event: Event) {
    const status = (event.currentTarget as HTMLSelectElement).value;
    catalogSearch.commitSearch({ status });
  }
</script>

<svelte:head>
  <title>Movies - Lunarr</title>
  <meta name="description" content="Browse, search, filter, and resume movies in your Lunarr library." />
</svelte:head>

<header class="page-header">
  <div>
    <div class="title-row">
      <h1>Movies</h1>
    </div>
    <p class="muted">Browse scanned local movies and resume playback.</p>
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
      ariaLabel="Search movies"
      placeholder={MOVIE_SEARCH_PLACEHOLDER}
      bind:value={catalogSearch.queryInput}
      bind:inputRef={catalogSearch.searchInput}
      oninput={catalogSearch.submitSearchSoon}
    />
    <select name="status" aria-label="Watch status" value={data.status} onchange={onStatusChange}>
      <option value="all" selected={data.status === "all"}>All</option>
      <option value="unwatched" selected={data.status === "unwatched"}>Unwatched</option>
      <option value="watched" selected={data.status === "watched"}>Watched</option>
    </select>
  </form>
</header>

{#if sections.every((section) => section.movies.length === 0)}
  <section class="empty">
    {#if hasActiveFilters}
      <h2>No matching movies</h2>
      <p class="muted">Adjust the search or watch-status filter to broaden the results.</p>
      <a class="button secondary" href="/movies">
        <Search size={16} aria-hidden="true" />
        Clear filters
      </a>
    {:else}
      <h2>No movies scanned yet</h2>
      <p class="muted">Add a movie library and run a scan to populate this page.</p>
      <a class="button" href="/libraries">
        <Library size={16} aria-hidden="true" />
        Add library
      </a>
    {/if}
  </section>
{:else}
  {#each sections as section}
    {#if section.movies.length}
      <section class="movie-section">
        <div class="section-heading">
          <h2>{section.title}</h2>
          {#if section.href}
            <a class="view-all" href={section.href}>
              <span>View all</span>
              <ChevronRight size={16} aria-hidden="true" />
            </a>
          {/if}
        </div>
        <MovieRail movies={section.movies} twoRowThreshold={TWO_ROW_MOVIE_RAIL_COUNT} />
      </section>
    {/if}
  {/each}
{/if}

<style>
  .page-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(26rem, 38rem);
    gap: var(--space-3);
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
    grid-template-columns: minmax(14rem, 1fr) minmax(8rem, auto);
    gap: var(--space-2);
    justify-self: end;
    width: 100%;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.55rem, 2.4vw, 2.25rem);
  }

  .movie-section {
    margin-top: var(--space-5);
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

  @media (max-width: 980px) {
    .page-header {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    form {
      grid-template-columns: 1fr;
    }

    .section-heading {
      display: flex;
      flex-wrap: wrap;
    }
  }
</style>
