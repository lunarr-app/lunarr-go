<script lang="ts">
  import MovieRail from "../movies/_components/MovieRail.svelte";
  import ShowRail from "../shows/_components/ShowRail.svelte";
  import { ChevronRight } from "@lucide/svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>Discover - Lunarr</title>
  <meta name="description" content="Personalized movie and TV recommendations based on your Lunarr watch history." />
</svelte:head>

<section class="discover-section">
  <div class="section-heading">
    <div>
      <h2>Discover movies</h2>
      <p class="muted section-sub">Picks similar to your recent watches.</p>
    </div>
    <a class="view-all" href="/movies/discover">
      <span>View all</span>
      <ChevronRight size={16} aria-hidden="true" />
    </a>
  </div>
  {#if data.movies.length}
    <MovieRail movies={data.movies} />
  {:else}
    <p class="muted empty">No recommendations yet — watch a movie and Lunarr will surface similar titles here.</p>
  {/if}
</section>

<section class="discover-section">
  <div class="section-heading">
    <div>
      <h2>Discover TV shows</h2>
      <p class="muted section-sub">Picks similar to your recent episode watches.</p>
    </div>
    <a class="view-all" href="/shows/discover">
      <span>View all</span>
      <ChevronRight size={16} aria-hidden="true" />
    </a>
  </div>
  {#if data.shows.length}
    <ShowRail shows={data.shows} />
  {:else}
    <p class="muted empty">No recommendations yet — watch an episode and Lunarr will surface similar shows here.</p>
  {/if}
</section>

<style>
  .discover-section + .discover-section {
    margin-top: var(--space-5);
  }

  .section-heading {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    margin-bottom: 0.85rem;
  }

  .section-heading h2 {
    margin: 0;
  }

  .section-sub {
    margin: 0.15rem 0 0;
    font-size: 0.9rem;
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
    margin: 0;
  }
</style>
