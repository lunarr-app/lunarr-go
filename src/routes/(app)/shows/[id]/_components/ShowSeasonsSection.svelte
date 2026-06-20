<script lang="ts">
  import { showSeasonHref } from "$lib/media/seasons";

  type Season = {
    id: string;
    title: string;
    posterUrl: string | null;
    episodes: Array<{
      fileId: string | null;
      completed: boolean;
    }>;
  };

  let {
    showId,
    showPosterUrl,
    seasons,
  }: {
    showId: string;
    showPosterUrl: string | null;
    seasons: Season[];
  } = $props();

  function seasonStats(season: Season) {
    const episodes = season.episodes;
    const total = episodes.length;
    const playable = episodes.filter((episode) => episode.fileId).length;
    const watched = episodes.filter((episode) => episode.completed).length;
    const missing = total - playable;
    return {
      total,
      playable,
      watched,
      missing,
      progress: total > 0 ? Math.round((watched / total) * 100) : 0,
    };
  }
</script>

<section class="seasons" aria-labelledby="seasons-heading">
  <div class="section-heading">
    <h2 id="seasons-heading">Seasons</h2>
    <p class="muted">Choose a season to browse episodes.</p>
  </div>

  <div class="season-grid">
    {#each seasons as season}
      {@const stats = seasonStats(season)}
      <a class="season-card" href={showSeasonHref(showId, season)}>
        <div class="poster">
          {#if season.posterUrl || showPosterUrl}
            <img src={season.posterUrl ?? showPosterUrl} alt="" loading="lazy" />
          {:else}
            <span>{season.title}</span>
          {/if}
        </div>
        <div class="season-copy">
          <strong>{season.title}</strong>
          <span>{stats.total} {stats.total === 1 ? "episode" : "episodes"}</span>
          {#if stats.missing > 0}
            <span>{stats.playable}/{stats.total} available</span>
          {:else}
            <span>{stats.watched}/{stats.total} watched</span>
          {/if}
          <div class="season-progress" aria-hidden="true">
            <span style={`width: ${stats.progress}%`}></span>
          </div>
        </div>
      </a>
    {/each}
  </div>
</section>

<style>
  .seasons {
    min-width: 0;
  }

  .section-heading {
    margin-bottom: 0.85rem;
  }

  .section-heading h2,
  .section-heading p {
    margin: 0;
  }

  .section-heading p {
    margin-top: 0.25rem;
  }

  .season-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.8rem, 1fr));
    gap: 1rem;
  }

  .season-card {
    display: grid;
    gap: 0.55rem;
    min-width: 0;
  }

  .poster {
    display: grid;
    place-items: center;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid transparent;
    background: var(--color-card);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
    color: var(--color-muted);
    transition:
      border-color 160ms ease,
      transform 160ms ease;
  }

  .season-card:hover .poster {
    transform: translateY(-2px);
    border-color: var(--color-accent-border);
  }

  .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .poster span {
    padding: 1rem;
    color: var(--color-subtle);
    text-align: center;
    overflow-wrap: anywhere;
  }

  .season-copy {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  .season-copy strong,
  .season-copy span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .season-copy span {
    color: var(--color-muted);
    font-size: 0.84rem;
  }

  .season-progress {
    overflow: hidden;
    height: 3px;
    margin-top: 0.2rem;
    border-radius: 999px;
    background: var(--color-border);
  }

  .season-progress span {
    display: block;
    height: 100%;
    min-width: 0;
    border-radius: inherit;
    background: var(--color-accent);
  }
</style>
