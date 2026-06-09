<script lang="ts">
  import { page } from "$app/state";
  import EpisodeCard from "$lib/components/EpisodeCard.svelte";
  import MovieCard from "$lib/components/MovieCard.svelte";
  import { playbackModalHref } from "$lib/playback/links";
  import { Film, Tv } from "@lucide/svelte";

  let { data } = $props();
  const hasProgress = $derived(data.movies.length > 0 || data.episodes.length > 0);

  function playHref(mediaItemId: string, mediaFileId?: string | null) {
    return playbackModalHref({
      currentUrl: page.url,
      mediaItemId,
      mediaFileId
    });
  }
</script>

<svelte:head>
  <title>Continue Watching - Lunarr</title>
  <meta name="description" content="Resume movies and TV episodes that are still in progress in your Lunarr library." />
</svelte:head>

<header class="page-header">
  <div>
    <h1>Continue Watching</h1>
    <p class="muted">Resume movies and episodes that are still in progress.</p>
  </div>
</header>

{#if hasProgress}
  {#if data.movies.length}
    <section class="media-section" aria-labelledby="movies-heading">
      <h2 id="movies-heading">Movies</h2>
      <div class="movie-grid">
        {#each data.movies as movie}
          <MovieCard {movie} href={playHref(movie.id, movie.resumeFileId)} />
        {/each}
      </div>
    </section>
  {/if}

  {#if data.episodes.length}
    <section class="media-section" aria-labelledby="episodes-heading">
      <h2 id="episodes-heading">Episodes</h2>
      <div class="episode-grid">
        {#each data.episodes as episode}
          <EpisodeCard {episode} href={playHref(episode.id, episode.fileId)} />
        {/each}
      </div>
    </section>
  {/if}
{:else}
  <section class="empty">
    <h2>Nothing in progress</h2>
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

  h1 {
    margin: 0 0 0.25rem;
    font-size: clamp(1.55rem, 2.4vw, 2.25rem);
  }

  .media-section {
    margin-top: 1.8rem;
  }

  h2 {
    margin: 0 0 0.85rem;
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

  .empty h2 {
    margin: 0;
  }

  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }
</style>
