<script lang="ts">
  import Pagination from "$lib/components/Pagination.svelte";
  import SearchField from "$lib/components/SearchField.svelte";
  import ShowCard from "$lib/components/ShowCard.svelte";
  import type { ShowSummary } from "$lib/media/types";
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
    shows,
    pageInfo,
    hrefForPage,
    query = "",
    sort = "title",
    showFilters = false,
  }: {
    title: string;
    description: string;
    shows: ShowSummary[];
    pageInfo: PageInfo;
    hrefForPage: (page: number) => string;
    query?: string;
    sort?: string;
    showFilters?: boolean;
  } = $props();

  let searchForm: HTMLFormElement | null = $state(null);
  let searchSubmitTimer: ReturnType<typeof setTimeout> | undefined = $state(undefined);

  const range = $derived({
    first: pageInfo.total === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1,
    last: Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total),
  });
  const summary = $derived(`Showing ${range.first}-${range.last} of ${pageInfo.total}`);

  function submitSearchNow() {
    if (searchSubmitTimer) {
      clearTimeout(searchSubmitTimer);
      searchSubmitTimer = undefined;
    }
    searchForm?.requestSubmit();
  }

  function submitSearchSoon() {
    if (searchSubmitTimer) {
      clearTimeout(searchSubmitTimer);
    }
    searchSubmitTimer = setTimeout(() => {
      searchSubmitTimer = undefined;
      searchForm?.requestSubmit();
    }, 350);
  }
</script>

<header class="page-header">
  <div>
    <a class="back-link" href="/shows">
      <ArrowLeft size={16} aria-hidden="true" />
      <span>Shows</span>
    </a>
    <h1>{title}</h1>
    <p class="muted">{description}</p>
  </div>
  {#if showFilters}
    <form method="GET" role="search" bind:this={searchForm}>
      <SearchField ariaLabel="Search shows" placeholder="Search shows" value={query} oninput={submitSearchSoon} />
      <select name="sort" aria-label="Sort shows" onchange={submitSearchNow}>
        <option value="title" selected={sort === "title"}>Title</option>
        <option value="recent" selected={sort === "recent"}>Recently added</option>
        <option value="latest" selected={sort === "latest"}>Latest aired</option>
        <option value="popular" selected={sort === "popular"}>Popular</option>
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
    <h2>No matching shows</h2>
    <p class="muted">Adjust the filters or return to the show dashboard.</p>
    <a class="button secondary" href="/shows">
      <ArrowLeft size={16} aria-hidden="true" />
      Back to shows
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

  @media (max-width: 640px) {
    form {
      grid-template-columns: 1fr;
    }
  }
</style>
