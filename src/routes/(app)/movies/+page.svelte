<script lang="ts">
  import MovieCard from "$lib/components/MovieCard.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import Rail from "$lib/components/Rail.svelte";
  import SearchField from "$lib/components/SearchField.svelte";
  import { createDebouncedCatalogSearch } from "$lib/media/catalog-search.svelte";
  import { MOVIE_SEARCH_PLACEHOLDER } from "$lib/media/search";
  import { ChevronRight, Library } from "@lucide/svelte";

  let { data } = $props();

  const catalogSearch = createDebouncedCatalogSearch(() => data.query);

  const isSearching = $derived(data.query.length > 0);
  const resultTotal = $derived(data.pageInfo?.total ?? data.results.length);
  const refineHref = $derived(`/movies/all?q=${encodeURIComponent(data.query)}`);

  const range = $derived.by(() => {
    const pageInfo = data.pageInfo;
    if (!pageInfo) return { first: 0, last: 0, total: 0 };
    return {
      first: pageInfo.total === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1,
      last: Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total),
      total: pageInfo.total,
    };
  });
  const summary = $derived(`Showing ${range.first}-${range.last} of ${range.total}`);

  function hrefForPage(page: number) {
    const params = new URLSearchParams();
    if (data.query) params.set("q", data.query);
    if (page > 1) params.set("page", String(page));
    const search = params.toString();
    return search ? `/movies?${search}` : "/movies";
  }

  function countLabel(total: number, singular: string, plural: string) {
    return `${total} ${total === 1 ? singular : plural}`;
  }

  const sections = $derived(
    [
      {
        key: "recent",
        title: "Recently added",
        movies: data.rails?.recent ?? [],
        href: "/movies/recent",
      },
      {
        key: "latest",
        title: "Latest releases",
        movies: data.rails?.latest ?? [],
        href: "/movies/latest",
      },
      {
        key: "popular",
        title: "Popular",
        movies: data.rails?.popular ?? [],
        href: "/movies/popular",
      },
    ].filter((section) => section.movies.length > 0),
  );
  const libraryEmpty = $derived(!isSearching && sections.length === 0);
</script>

<svelte:head>
  <title>Movies - Lunarr</title>
  <meta name="description" content="Browse and resume movies in your Lunarr library." />
</svelte:head>

<header class="page-header">
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
  </form>
</header>

{#if isSearching}
  <div class="results-bar">
    <p class="results-count">
      <strong>{resultTotal}</strong>
      <span>{resultTotal === 1 ? "result" : "results"}</span>
      <span class="results-for">for</span>
      <span class="results-query">“{data.query}”</span>
    </p>
    <a class="results-refine" href={refineHref}>
      <span>Filter &amp; sort</span>
      <ChevronRight size={15} aria-hidden="true" />
    </a>
  </div>

  {#if data.results.length}
    <section aria-label="Movie search results">
      <div class="grid">
        {#each data.results as movie}
          <MovieCard {movie} />
        {/each}
      </div>
      {#if data.pageInfo && data.pageInfo.totalPages > 1}
        <Pagination
          page={data.pageInfo.page}
          totalPages={data.pageInfo.totalPages}
          hasPrevious={data.pageInfo.hasPrevious}
          hasNext={data.pageInfo.hasNext}
          {hrefForPage}
          {summary}
          ariaLabel="Movie search results pages"
        />
      {/if}
    </section>
  {:else}
    <section class="empty">
      <h2>No matching movies</h2>
      <p class="muted">No results for “{data.query}”. Try a different title, keyword, genre, or filename.</p>
    </section>
  {/if}
{:else if libraryEmpty}
  <section class="empty">
    <h2>No movies scanned yet</h2>
    <p class="muted">Add a movie library and run a scan to populate this page.</p>
    <a class="button" href="/libraries">
      <Library size={16} aria-hidden="true" />
      Add library
    </a>
  </section>
{:else}
  {#each sections as section}
    <section class="movie-section" aria-labelledby={`${section.key}-heading`}>
      <div class="section-heading">
        <h2 id={`${section.key}-heading`}>{section.title}</h2>
        <div class="section-meta">
          <span>{countLabel(section.movies.length, "movie", "movies")}</span>
          {#if section.href}
            <a class="view-all" href={section.href}>
              <span>View all</span>
              <ChevronRight size={16} aria-hidden="true" />
            </a>
          {/if}
        </div>
      </div>
      <Rail items={section.movies} variant="poster">
        {#snippet children(movie)}
          <MovieCard {movie} />
        {/snippet}
      </Rail>
    </section>
  {/each}
{/if}

<style>
  .page-header {
    margin-bottom: 1.6rem;
  }

  form {
    display: block;
    max-width: 40rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 1.1rem;
  }

  .results-bar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: 1rem;
  }

  .results-count {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
    color: var(--color-muted);
    font-size: 0.95rem;
  }

  .results-count strong {
    color: var(--color-text);
    font-size: 1.35rem;
    font-weight: 800;
    line-height: 1;
  }

  .results-query {
    color: var(--color-text);
    font-weight: 700;
  }

  .results-refine {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    color: var(--color-muted);
    font-size: 0.9rem;
    font-weight: 700;
    white-space: nowrap;
    text-decoration: none;
  }

  .results-refine:hover {
    color: var(--color-text);
  }

  .movie-section + .movie-section {
    margin-top: var(--space-5);
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: 0.85rem;
  }

  .section-meta {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .section-meta span {
    color: var(--color-muted);
    font-size: 0.86rem;
    font-weight: 700;
  }

  .view-all {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
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
</style>
