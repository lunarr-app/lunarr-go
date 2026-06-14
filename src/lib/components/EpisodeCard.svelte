<script lang="ts">
  import type { EpisodeSummary } from "$lib/media/types";

  let { episode, href = `/episodes/${episode.id}` }: { episode: EpisodeSummary; href?: string } = $props();

  const progressPercent = $derived.by(() => {
    if (episode.completed) return 100;
    if (!episode.durationSeconds || episode.durationSeconds <= 0) return episode.progressSeconds > 0 ? 4 : 0;
    return Math.min(99, Math.max(0, Math.round((episode.progressSeconds / episode.durationSeconds) * 100)));
  });
  const hasProgress = $derived(episode.completed || progressPercent > 0);
  const numberLabel = $derived.by(() => {
    if (episode.seasonNumber === null || episode.episodeNumber === null) return episode.seasonTitle;
    return `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
  });
  const statusLabel = $derived.by(() => {
    if (episode.completed) return "Watched";
    if (progressPercent > 0) return `Resume ${progressPercent}%`;
    return numberLabel;
  });
</script>

<a class:has-progress={hasProgress} class="episode" {href} aria-label={`${episode.showTitle}, ${numberLabel}, ${episode.title}`}>
  <div class="still">
    {#if episode.stillUrl}
      <img src={episode.stillUrl} alt="" loading="lazy" />
    {:else if episode.showPosterUrl}
      <img src={episode.showPosterUrl} alt="" loading="lazy" />
    {:else}
      <span>{episode.showTitle}</span>
    {/if}
  </div>
  <div class="meta">
    <strong>{episode.title}</strong>
    <div class="details">
      <span>{episode.showTitle}</span>
      <span>{statusLabel}</span>
    </div>
    <div class="progress" aria-hidden="true">
      <span style={`width: ${progressPercent}%`}></span>
    </div>
  </div>
</a>

<style>
  .episode {
    display: grid;
    gap: 0.55rem;
    min-width: 0;
  }

  .still {
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border: 1px solid transparent;
    border-radius: 8px;
    background: var(--color-card);
    display: grid;
    place-items: center;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.22);
    transition:
      border-color 160ms ease,
      transform 160ms ease;
  }

  .episode:hover .still {
    transform: translateY(-2px);
    border-color: var(--color-accent-border);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .still span {
    padding: 0.75rem;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .details {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 0.55rem;
    color: var(--color-dim);
    font-size: 0.86rem;
  }

  .details span {
    min-width: 0;
    white-space: nowrap;
  }

  .details span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .details span:last-child {
    color: var(--color-accent);
  }

  .episode:not(.has-progress) .details span:last-child {
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
