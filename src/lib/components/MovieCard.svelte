<script lang="ts">
  import type { MovieSummary } from "$lib/media/types";

  let { movie, href = `/movies/${movie.id}` }: { movie: MovieSummary; href?: string } = $props();

  const progressPercent = $derived.by(() => {
    if (movie.completed) return 100;
    if (!movie.durationSeconds || movie.durationSeconds <= 0) return movie.progressSeconds > 0 ? 4 : 0;
    return Math.min(99, Math.max(0, Math.round((movie.progressSeconds / movie.durationSeconds) * 100)));
  });

  const hasProgress = $derived(movie.completed || progressPercent > 0);
  const statusLabel = $derived.by(() => {
    if (movie.completed) return "Watched";
    if (progressPercent > 0) return `Resume ${progressPercent}%`;
    return "Unwatched";
  });
</script>

<a class:has-progress={hasProgress} class="movie" {href} aria-label={`${movie.title}, ${statusLabel}`}>
  <div class="poster">
    {#if movie.posterUrl}
      <img src={movie.posterUrl} alt="" loading="lazy" />
    {:else}
      <span>{movie.title}</span>
    {/if}
  </div>
  <div class="meta">
    <strong>{movie.title}</strong>
    <div class="details">
      <span>{movie.year ?? "Unknown year"}</span>
      <span>{statusLabel}</span>
    </div>
    <div class="progress" aria-hidden="true">
      <span style={`width: ${progressPercent}%`}></span>
    </div>
  </div>
</a>

<style>
  .movie {
    display: grid;
    gap: 0.65rem;
    min-width: 0;
  }

  .poster {
    aspect-ratio: 2 / 3;
    border-radius: 8px;
    overflow: hidden;
    background: var(--color-card);
    display: grid;
    place-items: center;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
    transition:
      border-color 160ms ease,
      transform 160ms ease;
    border: 1px solid transparent;
  }

  .movie:hover .poster {
    transform: translateY(-2px);
    border-color: var(--color-accent-border);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .poster span {
    padding: var(--space-3);
    color: var(--color-subtle);
    text-align: center;
    overflow-wrap: anywhere;
  }

  .meta {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  strong {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .details {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 0.55rem;
    color: var(--color-dim);
    font-size: 0.88rem;
  }

  .details span {
    min-width: 0;
    white-space: nowrap;
  }

  .details span:last-child {
    overflow: hidden;
    color: var(--color-accent);
    text-overflow: ellipsis;
  }

  .movie:not(.has-progress) .details span:last-child {
    color: var(--color-muted);
  }

  .progress {
    height: 3px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--color-border);
  }

  .progress span {
    display: block;
    height: 100%;
    min-width: 0;
    border-radius: inherit;
    background: var(--color-accent);
  }
</style>
