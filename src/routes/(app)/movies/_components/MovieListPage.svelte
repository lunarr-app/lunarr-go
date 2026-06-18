<script lang="ts">
  import MovieCard from "$lib/components/MovieCard.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import SearchField from "$lib/components/SearchField.svelte";
  import { createDebouncedCatalogSearch } from "$lib/media/catalog-search.svelte";
  import { MOVIE_SEARCH_PLACEHOLDER } from "$lib/media/search";
  import type { MovieSummary } from "$lib/media/types";
  import { ArrowLeft } from "@lucide/svelte";

  type PageInfo = {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };

  let {
    title,
    description,
    movies,
    pageInfo,
    hrefForPage,
    query = "",
    status = "all",
    showFilters = false,
    backHref = "/movies",
    backLabel = "Movies",
    emptyHref = "/movies",
    emptyTitle = "No matching movies",
    emptyDescription = "Adjust the filters or return to the movie dashboard.",
    emptyActionLabel = "Back to movies",
  }: {
    title: string;
    description: string;
    movies: MovieSummary[];
    pageInfo: PageInfo;
    hrefForPage: (page: number) => string;
    query?: string;
    status?: string;
    showFilters?: boolean;
    backHref?: string;
    backLabel?: string;
    emptyHref?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyActionLabel?: string;
  } = $props();

  const catalogSearch = createDebouncedCatalogSearch(
    () => query,
    () => ({ status }),
  );

  const range = $derived({
    first: pageInfo.total === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1,
    last: Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total),
  });
  const summary = $derived(`Showing ${range.first}-${range.last} of ${pageInfo.total}`);

  function onStatusChange(event: Event) {
    const nextStatus = (event.currentTarget as HTMLSelectElement).value;
    catalogSearch.commitSearch({ status: nextStatus });
  }
</script>

<header class="page-header">
  <div>
    <a class="back-link" href={backHref}>
      <ArrowLeft size={16} aria-hidden="true" />
      <span>{backLabel}</span>
    </a>
    <h1>{title}</h1>
    <p class="muted">{description}</p>
  </div>
  {#if showFilters}
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
      <select name="status" aria-label="Watch status" value={status} onchange={onStatusChange}>
        <option value="all" selected={status === "all"}>All</option>
        <option value="unwatched" selected={status === "unwatched"}>Unwatched</option>
        <option value="watched" selected={status === "watched"}>Watched</option>
      </select>
    </form>
  {/if}
</header>

{#if movies.length}
  <section aria-label={title}>
    <div class="grid">
      {#each movies as movie}
        <MovieCard {movie} />
      {/each}
    </div>
    {#if pageInfo.totalPages > 1}
      <Pagination
        page={pageInfo.page}
        totalPages={pageInfo.totalPages}
        hasPrevious={pageInfo.hasPrevious}
        hasNext={pageInfo.hasNext}
        {hrefForPage}
        {summary}
        ariaLabel={`${title} pages`}
      />
    {/if}
  </section>
{:else}
  <section class="empty">
    <h2>{emptyTitle}</h2>
    <p class="muted">{emptyDescription}</p>
    <a class="button secondary" href={emptyHref}>
      <ArrowLeft size={16} aria-hidden="true" />
      {emptyActionLabel}
    </a>
  </section>
{/if}

<style>
  .page-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(26rem, 38rem);
    gap: 1rem;
    align-items: end;
    margin-bottom: 1.6rem;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin-bottom: 0.35rem;
    color: var(--color-muted);
    font-size: 0.9rem;
    font-weight: 700;
  }

  .back-link:hover {
    color: var(--color-text);
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: clamp(1.55rem, 2.4vw, 2.25rem);
  }

  form {
    display: grid;
    grid-template-columns: minmax(14rem, 1fr) minmax(8rem, auto);
    gap: 0.5rem;
    justify-self: end;
    width: 100%;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 1.1rem;
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
  }
</style>
