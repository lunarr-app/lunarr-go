<script lang="ts">
  import type { ShowSummary } from "$lib/media/types";

  let { show }: { show: ShowSummary } = $props();
</script>

<a class="show" href={`/shows/${show.id}`} aria-label={show.title}>
  <div class="poster">
    {#if show.posterUrl}
      <img src={show.posterUrl} alt="" loading="lazy" />
    {:else}
      <span>{show.title}</span>
    {/if}
  </div>
  <div class="meta">
    <strong>{show.title}</strong>
    <div class="details">
      <span>{show.year ?? "Unknown year"}</span>
      <span
        >{show.seasonCount}
        {show.seasonCount === 1 ? "season" : "seasons"}</span
      >
    </div>
  </div>
</a>

<style>
  .show {
    display: grid;
    gap: 0.65rem;
    min-width: 0;
  }

  .poster {
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border: 1px solid transparent;
    border-radius: 8px;
    background: var(--color-card);
    display: grid;
    place-items: center;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
    transition:
      border-color 160ms ease,
      transform 160ms ease;
  }

  .show:hover .poster {
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
    color: var(--color-muted);
    font-size: 0.88rem;
  }

  .details span {
    min-width: 0;
    white-space: nowrap;
  }
</style>
