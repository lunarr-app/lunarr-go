<script lang="ts">
  import MovieCard from "$lib/components/MovieCard.svelte";
  import EpisodeCard from "$lib/components/EpisodeCard.svelte";
  import ShowCard from "$lib/components/ShowCard.svelte";
  import Rail from "$lib/components/Rail.svelte";
  import { ChevronRight, Film, Tv } from "@lucide/svelte";

  let { data } = $props();

  function countLabel(total: number, singular: string, plural: string) {
    return `${total} ${total === 1 ? singular : plural}`;
  }

  const hasContent = $derived(
    data.moviesPage.total > 0 ||
      data.episodesPage.total > 0 ||
      data.nextUpPage.total > 0 ||
      data.recommendedMovies.length > 0 ||
      data.recommendedShows.length > 0,
  );
  const movieCountLabel = $derived(countLabel(data.moviesPage.total, "movie", "movies"));
  const episodeCountLabel = $derived(countLabel(data.episodesPage.total, "episode", "episodes"));
  const nextUpCountLabel = $derived(countLabel(data.nextUpPage.total, "episode", "episodes"));
</script>

<svelte:head>
  <title>Continue Watching - Lunarr</title>
  <meta
    name="description"
    content="Resume in-progress movies and TV episodes, plus the next unwatched episode for shows you are watching."
  />
</svelte:head>

{#if hasContent}
  {#if data.moviesPage.total > 0}
    <section class="media-section" aria-labelledby="movies-heading">
      <div class="section-heading">
        <h2 id="movies-heading" class="section-title">Movies</h2>
        <div class="section-meta">
          <span>{movieCountLabel}</span>
          <a class="view-all" href="/continue/movies">
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

  {#if data.episodesPage.total > 0}
    <section class="media-section" aria-labelledby="episodes-heading">
      <div class="section-heading">
        <h2 id="episodes-heading" class="section-title">Episodes</h2>
        <div class="section-meta">
          <span>{episodeCountLabel}</span>
          <a class="view-all" href="/continue/episodes">
            <span>View all</span>
            <ChevronRight size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
      <Rail items={data.episodes} variant="episode">
        {#snippet children(episode)}
          <EpisodeCard {episode} />
        {/snippet}
      </Rail>
    </section>
  {/if}

  {#if data.nextUpPage.total > 0}
    <section class="media-section" aria-labelledby="next-up-heading">
      <div class="section-heading">
        <h2 id="next-up-heading" class="section-title">Next up</h2>
        <div class="section-meta">
          <span>{nextUpCountLabel}</span>
          <a class="view-all" href="/continue/next-up">
            <span>View all</span>
            <ChevronRight size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
      <Rail items={data.nextUp} variant="episode">
        {#snippet children(episode)}
          <EpisodeCard {episode} />
        {/snippet}
      </Rail>
    </section>
  {/if}

  {#if data.recommendedMovies.length}
    <section class="media-section" aria-labelledby="recommended-movies-heading">
      <div class="section-heading">
        <div>
          <h2 id="recommended-movies-heading" class="section-title">Recommended movies</h2>
          <p class="muted section-sub">Picks similar to your recent watches.</p>
        </div>
        <a class="view-all" href="/movies/discover">
          <span>View all</span>
          <ChevronRight size={16} aria-hidden="true" />
        </a>
      </div>
      <Rail items={data.recommendedMovies} variant="poster">
        {#snippet children(movie)}
          <MovieCard {movie} />
        {/snippet}
      </Rail>
    </section>
  {/if}

  {#if data.recommendedShows.length}
    <section class="media-section" aria-labelledby="recommended-shows-heading">
      <div class="section-heading">
        <div>
          <h2 id="recommended-shows-heading" class="section-title">Recommended shows</h2>
          <p class="muted section-sub">Picks similar to your recent episode watches.</p>
        </div>
        <a class="view-all" href="/shows/discover">
          <span>View all</span>
          <ChevronRight size={16} aria-hidden="true" />
        </a>
      </div>
      <Rail items={data.recommendedShows} variant="poster">
        {#snippet children(show)}
          <ShowCard {show} />
        {/snippet}
      </Rail>
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
  .media-section + .media-section {
    margin-top: 1.8rem;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: 0.85rem;
  }

  .section-title,
  .empty-title {
    margin: 0;
  }

  .section-sub {
    margin: 0.15rem 0 0;
    font-size: 0.82rem;
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
