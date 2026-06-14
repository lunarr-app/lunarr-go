<script lang="ts">
  import MovieCard from "$lib/components/MovieCard.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import SearchField from "$lib/components/SearchField.svelte";
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
    sort = "title",
    showFilters = false,
  }: {
    title: string;
    description: string;
    movies: MovieSummary[];
    pageInfo: PageInfo;
    hrefForPage: (page: number) => string;
    query?: string;
    status?: string;
    sort?: string;
    showFilters?: boolean;
  } = $props();

  let searchForm: HTMLFormElement | null = $state(null);
  let searchSubmitTimer: ReturnType<typeof setTimeout> | undefined =
    $state(undefined);

  const range = $derived({
    first:
      pageInfo.total === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1,
    last: Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total),
  });
  const summary = $derived(
    `Showing ${range.first}-${range.last} of ${pageInfo.total}`,
  );

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
    <a class="back-link" href="/movies">
      <ArrowLeft size={16} aria-hidden="true" />
      <span>Movies</span>
    </a>
    <h1>{title}</h1>
    <p class="muted">{description}</p>
  </div>
  {#if showFilters}
    <form method="GET" role="search" bind:this={searchForm}>
      <SearchField
        ariaLabel="Search movies"
        placeholder="Search movies"
        value={query}
        oninput={submitSearchSoon}
      />
      <select
        name="status"
        aria-label="Watch status"
        onchange={submitSearchNow}
      >
        <option value="all" selected={status === "all"}>All</option>
        <option value="unwatched" selected={status === "unwatched"}
          >Unwatched</option
        >
        <option value="watched" selected={status === "watched"}>Watched</option>
      </select>
      <select name="sort" aria-label="Sort movies" onchange={submitSearchNow}>
        <option value="title" selected={sort === "title"}>Title</option>
        <option value="recent" selected={sort === "recent"}
          >Recently added</option
        >
        <option value="year_desc" selected={sort === "year_desc"}
          >Release year</option
        >
        <option value="rating" selected={sort === "rating"}>Rating</option>
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
    <h2>No matching movies</h2>
    <p class="muted">Adjust the filters or return to the movie dashboard.</p>
    <a class="button secondary" href="/movies">
      <ArrowLeft size={16} aria-hidden="true" />
      Back to movies
    </a>
  </section>
{/if}

<style>
  .page-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(34rem, 46rem);
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
    grid-template-columns: minmax(16rem, 1fr) minmax(7rem, auto) minmax(
        8rem,
        auto
      );
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
