<script lang="ts">
  import MovieCard from "$lib/components/MovieCard.svelte";
  import Rail from "$lib/components/Rail.svelte";
  import { ChevronRight, Library } from "@lucide/svelte";

  let { data } = $props();

  function countLabel(total: number, singular: string, plural: string) {
    return `${total} ${total === 1 ? singular : plural}`;
  }

  const sections = $derived([
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
</script>

<svelte:head>
  <title>Movies - Lunarr</title>
  <meta name="description" content="Browse and resume movies in your Lunarr library." />
</svelte:head>

{#if sections.every((section) => section.movies.length === 0)}
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
    {#if section.movies.length}
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
    {/if}
  {/each}
{/if}

<style>
  .movie-section + .movie-section {
    margin-top: var(--space-5);
  }

  h2 {
    margin: 0;
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

  .empty h2 {
    margin: 0;
  }
</style>
