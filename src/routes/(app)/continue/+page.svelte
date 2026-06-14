<script lang="ts">
  import EpisodeCard from "$lib/components/EpisodeCard.svelte";
  import MovieCard from "$lib/components/MovieCard.svelte";
  import { Film, Tv } from "@lucide/svelte";

  let { data } = $props();
  const hasProgress = $derived(data.movies.length > 0 || data.episodes.length > 0);
  const movieCountLabel = $derived(`${data.movies.length} ${data.movies.length === 1 ? "movie" : "movies"}`);
  const episodeCountLabel = $derived(`${data.episodes.length} ${data.episodes.length === 1 ? "episode" : "episodes"}`);
</script>

<svelte:head>
  <title>Continue Watching - Lunarr</title>
  <meta name="description" content="Resume movies and TV episodes that are still in progress in your Lunarr library." />
</svelte:head>

<header class="page-header">
  <div>
    <h1 class="page-title">Continue Watching</h1>
  </div>
</header>

{#if hasProgress}
  {#if data.movies.length}
    <section class="media-section" aria-labelledby="movies-heading">
      <div class="section-heading">
        <h2 id="movies-heading" class="section-title">Movies</h2>
        <span>{movieCountLabel}</span>
      </div>
      <div class="movie-grid">
        {#each data.movies as movie}
          <MovieCard {movie} />
        {/each}
      </div>
    </section>
  {/if}

  {#if data.episodes.length}
    <section class="media-section" aria-labelledby="episodes-heading">
      <div class="section-heading">
        <h2 id="episodes-heading" class="section-title">Episodes</h2>
        <span>{episodeCountLabel}</span>
      </div>
      <div class="episode-grid">
        {#each data.episodes as episode}
          <EpisodeCard {episode} />
        {/each}
      </div>
    </section>
  {/if}
{:else}
  <section class="empty">
    <h2 class="empty-title">Nothing in progress</h2>
    <p class="muted">Start a movie or episode and Lunarr will keep it here until it is watched.</p>
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

<style>
  .page-header {
    margin-bottom: 1.6rem;
  }

  .page-title {
    margin: 0;
    font-size: clamp(1.55rem, 2.4vw, 2.25rem);
  }

  .media-section {
    margin-top: 1.8rem;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.85rem;
  }

  .section-title,
  .empty-title {
    margin: 0;
  }

  .section-heading span {
    color: var(--color-muted);
    font-size: 0.86rem;
    font-weight: 700;
  }

  .movie-grid,
  .episode-grid {
    display: grid;
    gap: 1.1rem;
  }

  .movie-grid {
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  }

  .episode-grid {
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
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
</style>
