<script lang="ts">
  import Pagination from "$lib/components/Pagination.svelte";
  import SearchField from "$lib/components/SearchField.svelte";
  import ShowCard from "$lib/components/ShowCard.svelte";
  import { createDebouncedCatalogSearch } from "$lib/media/catalog-search.svelte";
  import { SHOW_SEARCH_PLACEHOLDER } from "$lib/media/search";
  import type { ShowSummary } from "$lib/media/types";

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
    shows,
    pageInfo,
    hrefForPage,
    query = "",
    sort = "title",
    showFilters = false,
    emptyTitle = "No matching shows",
    emptyDescription = "Adjust the filters or return to the show dashboard.",
  }: {
    title: string;
    description: string;
    shows: ShowSummary[];
    pageInfo: PageInfo;
    hrefForPage: (page: number) => string;
    query?: string;
    sort?: string;
    showFilters?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
  } = $props();

  const catalogSearch = createDebouncedCatalogSearch(() => query, () => ({ sort }));

  const range = $derived({
    first: pageInfo.total === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1,
    last: Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total),
  });
  const summary = $derived(`Showing ${range.first}-${range.last} of ${pageInfo.total}`);

  function onSortChange(event: Event) {
    const nextSort = (event.currentTarget as HTMLSelectElement).value;
    catalogSearch.commitSearch({ sort: nextSort });
  }
</script>

<header class="page-header">
  <div>
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
        ariaLabel="Search shows"
        placeholder={SHOW_SEARCH_PLACEHOLDER}
        bind:value={catalogSearch.queryInput}
        bind:inputRef={catalogSearch.searchInput}
        oninput={catalogSearch.submitSearchSoon}
      />
      <select name="sort" aria-label="Sort shows" value={sort} onchange={onSortChange}>
        <option value="title" selected={sort === "title"}>Title A–Z</option>
        <option value="recent" selected={sort === "recent"}>Recently added</option>
        <option value="latest" selected={sort === "latest"}>Recently aired</option>
        <option value="popular" selected={sort === "popular"}>Most popular</option>
      </select>
    </form>
  {/if}
</header>

{#if shows.length}
  <section aria-label={title}>
    <div class="grid">
      {#each shows as show}
        <ShowCard {show} />
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
  </section>
{/if}

<style>
  .page-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(26rem, 38rem);
    gap: var(--space-3);
    align-items: end;
    margin-bottom: 1.6rem;
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: clamp(1.55rem, 2.4vw, 2.25rem);
  }

  form {
    display: grid;
    grid-template-columns: minmax(11rem, 1fr) minmax(8.5rem, auto);
    gap: var(--space-2);
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

  @media (max-width: 820px) {
    .page-header {
      grid-template-columns: 1fr;
    }
  }
</style>
