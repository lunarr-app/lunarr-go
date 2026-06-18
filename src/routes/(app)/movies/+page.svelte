<script lang="ts">
  import MovieCard from "$lib/components/MovieCard.svelte";
  import SearchField from "$lib/components/SearchField.svelte";
  import { createDebouncedCatalogSearch } from "$lib/media/catalog-search.svelte";
  import { MOVIE_SEARCH_PLACEHOLDER } from "$lib/media/search";
  import { twoRowRailOrder } from "$lib/media/rails";
  import { ChevronRight, Library, Search, Sparkles } from "@lucide/svelte";

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
      href: "/continue",
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
      {#if !hasActiveFilters}
        <a class="discover-link button secondary" href="/movies/discover">
          <Sparkles size={16} aria-hidden="true" />
          Discover movies
        </a>
      {/if}
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
        <div class="movie-rail" class:two-row={section.movies.length >= TWO_ROW_MOVIE_RAIL_COUNT}>
          {#each twoRowRailOrder(section.movies, TWO_ROW_MOVIE_RAIL_COUNT) as movie}
            <MovieCard {movie} />
          {/each}
        </div>
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
    grid-template-columns: minmax(14rem, 1fr) minmax(8rem, auto);
    gap: 0.5rem;
    justify-self: end;
    width: 100%;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.55rem, 2.4vw, 2.25rem);
  }

  .movie-section {
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

  .movie-rail {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: clamp(8.8rem, 12vw, 10.5rem);
    grid-template-rows: auto;
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

  .movie-rail.two-row {
    grid-template-rows: repeat(2, auto);
  }

  .movie-rail :global(.movie) {
    scroll-snap-align: start;
  }

  .movie-rail::-webkit-scrollbar {
    height: 0.55rem;
  }

  .movie-rail::-webkit-scrollbar-track {
    background: transparent;
  }

  .movie-rail::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: var(--color-scrollbar);
  }

  .movie-rail::-webkit-scrollbar-thumb:hover {
    background: var(--color-scrollbar-hover);
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

    .movie-rail {
      grid-auto-columns: minmax(8.25rem, 38vw);
    }
  }
</style>
