<script lang="ts">
  import MovieCard from "$lib/components/MovieCard.svelte";
  import Rail from "$lib/components/Rail.svelte";
  import ShowCard from "$lib/components/ShowCard.svelte";
  import { ChevronRight, Film, Tv } from "@lucide/svelte";

  let { data } = $props();

  const hasPicks = $derived(data.movies.length > 0 || data.shows.length > 0);

  function countLabel(total: number) {
    return `${total} ${total === 1 ? "pick" : "picks"}`;
  }
</script>

<svelte:head>
  <title>Discover - Lunarr</title>
  <meta name="description" content="Movie and TV picks matched to what you have been watching in Lunarr." />
</svelte:head>

<div class="discover">
  {#if hasPicks}
    {#if data.movies.length}
      <section class="pick-section" aria-labelledby="movies-for-you">
        <div class="section-heading">
          <div class="section-heading-text">
            <h2 id="movies-for-you" class="section-title">Movies for you</h2>
            <p class="section-sub">
              Picks similar to your recent watches, ranked by shared genres, keywords, cast, and directors.
            </p>
          </div>
          <div class="section-meta">
            <span>{countLabel(data.moviesPage.total)}</span>
            <a class="view-all" href="/movies/discover">
              <span>View all</span>
              <ChevronRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
        <Rail items={data.movies} variant="poster">
          {#snippet children(movie)}
            <MovieCard {movie} />
          {/snippet}
        </Rail>
      </section>
    {/if}

    {#if data.shows.length}
      <section class="pick-section" aria-labelledby="shows-for-you">
        <div class="section-heading">
          <div class="section-heading-text">
            <h2 id="shows-for-you" class="section-title">Shows for you</h2>
            <p class="section-sub">
              Picks similar to your recent episode watches, ranked by shared genres, keywords, cast, and creators.
            </p>
          </div>
          <div class="section-meta">
            <span>{countLabel(data.showsPage.total)}</span>
            <a class="view-all" href="/shows/discover">
              <span>View all</span>
              <ChevronRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
        <Rail items={data.shows} variant="poster">
          {#snippet children(show)}
            <ShowCard {show} />
          {/snippet}
        </Rail>
      </section>
    {/if}
  {:else}
    <section class="empty">
      <h2 class="empty-title">Nothing to discover yet</h2>
      <p class="muted">Watch a movie or an episode and Lunarr will surface picks matched to your taste.</p>
      <div class="empty-actions">
        <a class="button" href="/movies">
          <Film size={16} aria-hidden="true" />
          Browse movies
        </a>
        <a class="button secondary" href="/shows">
          <Tv size={16} aria-hidden="true" />
          Browse shows
        </a>
      </div>
    </section>
  {/if}
</div>

<style>
  .pick-section + .pick-section {
    margin-top: 2.4rem;
  }

  .section-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: 0.85rem;
  }

  .section-heading-text {
    min-width: 0;
  }

  .section-title,
  .empty-title {
    margin: 0;
  }

  .section-sub {
    margin: 0.3rem 0 0;
    color: var(--color-muted);
    font-size: 0.86rem;
    line-height: 1.45;
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

  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  @media (max-width: 760px) {
    .section-heading {
      flex-wrap: wrap;
    }
  }
</style>
