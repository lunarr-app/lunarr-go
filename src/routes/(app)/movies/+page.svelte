<script lang="ts">
  import { page } from "$app/state";
  import MovieCard from "$lib/components/MovieCard.svelte";
  import SearchField from "$lib/components/SearchField.svelte";
  import { playbackModalHref } from "$lib/playback/links";
  import { ChevronRight, Library, Search } from "@lucide/svelte";

  let { data } = $props();
  let searchForm: HTMLFormElement | null = $state(null);
  let searchSubmitTimer: ReturnType<typeof setTimeout> | undefined =
    $state(undefined);

  const sections = $derived([
    {
      key: "continue",
      title: "Continue watching",
      movies: data.rows.continueWatching,
      href: "/continue",
      watch: true,
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
  const hasActiveFilters = $derived(
    data.query.trim().length > 0 || data.status !== "all",
  );

  function movieHref(movie: (typeof data.rows.all)[number], watch = false) {
    if (!watch) return `/movies/${movie.id}`;
    return playbackModalHref({
      currentUrl: page.url,
      mediaItemId: movie.id,
      mediaFileId: movie.resumeFileId
    });
  }

  function allMoviesHref() {
    const params = new URLSearchParams();
    const query = data.query.trim();
    if (query.length > 0) params.set("q", query);
    if (data.status !== "all") params.set("status", data.status);
    if (data.sort !== "title") params.set("sort", data.sort);
    const search = params.toString();
    return search ? `/movies/all?${search}` : "/movies/all";
  }

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

<svelte:head>
  <title>Movies - Lunarr</title>
  <meta
    name="description"
    content="Browse, search, filter, and resume movies in your Lunarr library."
  />
</svelte:head>

<header class="page-header">
  <div>
    <h1>Movies</h1>
    <p class="muted">Browse scanned local movies and resume playback.</p>
  </div>
  <form method="GET" role="search" bind:this={searchForm}>
    <SearchField
      ariaLabel="Search movies"
      placeholder="Search movies"
      value={data.query}
      oninput={submitSearchSoon}
    />
    <select name="status" aria-label="Watch status" onchange={submitSearchNow}>
      <option value="all" selected={data.status === "all"}>All</option>
      <option value="unwatched" selected={data.status === "unwatched"}
        >Unwatched</option
      >
      <option value="watched" selected={data.status === "watched"}
        >Watched</option
      >
    </select>
    <select name="sort" aria-label="Sort movies" onchange={submitSearchNow}>
      <option value="title" selected={data.sort === "title"}>Title</option>
      <option value="recent" selected={data.sort === "recent"}
        >Recently added</option
      >
      <option value="year_desc" selected={data.sort === "year_desc"}
        >Release year</option
      >
      <option value="rating" selected={data.sort === "rating"}>Rating</option>
    </select>
  </form>
</header>

{#if sections.every((section) => section.movies.length === 0)}
  <section class="empty">
    {#if hasActiveFilters}
      <h2>No matching movies</h2>
      <p class="muted">
        Adjust the search or watch-status filter to broaden the results.
      </p>
      <a class="button secondary" href="/movies">
        <Search size={16} aria-hidden="true" />
        Clear filters
      </a>
    {:else}
      <h2>No movies scanned yet</h2>
      <p class="muted">
        Add a movie library and run a scan to populate this page.
      </p>
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
          <a class="view-all" href={section.href}>
            <span>View all</span>
            <ChevronRight size={16} aria-hidden="true" />
          </a>
        </div>
        <div class="movie-rail">
          {#each section.movies as movie}
            <MovieCard {movie} href={movieHref(movie, section.watch)} />
          {/each}
        </div>
      </section>
    {/if}
  {/each}
{/if}

<style>
  .page-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(34rem, 46rem);
    gap: 1rem;
    align-items: end;
    margin-bottom: 1.6rem;
  }

  form {
    display: grid;
    grid-template-columns: minmax(16rem, 1fr) minmax(7rem, auto) minmax(
        8rem,
        auto
      );
    gap: 0.5rem;
  }

  h1 {
    margin: 0 0 0.25rem;
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
    color: #95a4ae;
    font-size: 0.9rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .view-all:hover {
    color: #f7f9fb;
  }

  .movie-rail {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: clamp(8.8rem, 12vw, 10.5rem);
    grid-template-rows: repeat(2, auto);
    gap: 1.1rem;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-inline: contain;
    padding: 0.1rem 0 0.85rem;
    scroll-snap-type: x proximity;
    scroll-padding-inline: 0.25rem;
    scrollbar-color: rgba(149, 164, 174, 0.45) transparent;
    scrollbar-width: thin;
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
    background: rgba(149, 164, 174, 0.35);
  }

  .movie-rail::-webkit-scrollbar-thumb:hover {
    background: rgba(149, 164, 174, 0.55);
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
